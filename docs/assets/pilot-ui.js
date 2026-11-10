import {PILOT,txHashOk,validateDepositHash,findRecentDeposit,inspectMttRecipient,
  sendViaInjectedProvider,checkPilotSlot} from './pilot-status.js';
import {fetchLiveReserves,calculateQuote,parseUsdt,formatWei} from './quote.js';

const el=id=>document.getElementById(id);
const title=message=>{el('pilot-state').textContent=message};
const setBusy=busy=>{
  el('pilot-verify').disabled=busy;
  el('pilot-scan').disabled=busy;
};
const copy=async text=>{
  try{await navigator.clipboard.writeText(text);return true;}
  catch{
    const input=document.createElement('textarea');
    input.value=text;input.style.position='fixed';input.style.opacity='0';
    document.body.appendChild(input);input.select();
    const ok=document.execCommand('copy');input.remove();
    return ok;
  }
};
const setSteps=(count)=>{
  for(const row of document.querySelectorAll('[data-pilot-step]')){
    const index=Number(row.dataset.pilotStep);
    row.classList.toggle('done',index<count);
    row.classList.toggle('current',index===count);
  }
};
const showTx=(id,hash,network)=>{
  const element=el(id);
  if(!txHashOk(hash)){element.classList.add('hidden');return}
  element.href=(network==='bsc'?'https://bscscan.com/tx/':'https://explorer.mtt.network/tx/')+hash;
  element.classList.remove('hidden');
};
async function drawDepositStatus(result){
  if(result.pending){
    title('Транзакция отправлена. Ожидаем включения в блок BSC.');
    setSteps(0);return;
  }
  showTx('pilot-bsc-link',result.hash,'bsc');
  if(!result.confirmed){
    title('Депозит найден: '+result.confirmations+'/6 подтверждений BSC.');
    setSteps(0);return;
  }
  setSteps(1);
  title('1 USDT подтверждён в BSC. Движок выполняет Bridge / прямой обмен; это может занять время.');
  const recipient=await inspectMttRecipient({since:result.timestamp}).catch(()=>null);
  if(recipient?.payout){
    setSteps(4);
    const raw=recipient.payout.amountWei;
    title('MTT поступили клиенту: '+formatWei(raw,2)+' MTT. Выплата подтверждается транзакцией.');
    showTx('pilot-mtt-link',recipient.payout.hash,'mtt');
    const badge=document.querySelector('.status-pill');
    if(badge)badge.textContent='✓ PILOT COMPLETED';
  }
}
export function initPilot({tg,notify}){
  let savedHash='',slotAvailable=false;
  const allowedSender=PILOT.sender;
  const submit=el('pilot-send');
  const agreed=el('pilot-understand');
  try{savedHash=localStorage.getItem('mtt-pilot-bsc-tx')||'';}catch{}
  if(txHashOk(savedHash))el('pilot-tx-input').value=savedHash;

  const injected=Boolean(window.ethereum?.request);
  const refreshSend=()=>{submit.disabled=!agreed.checked||!injected||!slotAvailable};
  agreed.addEventListener('change',refreshSend);
  refreshSend();
  async function refreshSlot(){
    try{
      const slot=await checkPilotSlot();
      slotAvailable=slot.available&&!txHashOk(savedHash);
      if(!slotAvailable){
        if(el('pilot-mtt-link').classList.contains('hidden'))title(slot.reason);
        el('pilot-wallet-hint').textContent='Не отправляйте новые средства. Один тестовый депозит может быть уже использован.';
      }
    }catch{
      slotAvailable=false;
      el('pilot-wallet-hint').textContent='Не удалось проверить доступность одноразового пилота. Пока не отправляйте средства.';
    }
    refreshSend();
    return slotAvailable;
  }
  if(!injected)el('pilot-wallet-hint').textContent=
    'В Telegram не обнаружен встроенный EVM-кошелёк. Скопируйте адрес выше и выполните прямой перевод 1 USDT BEP-20 из своего приложения кошелька. Затем проверьте хеш ниже.';
  void refreshSlot();

  el('pilot-copy').addEventListener('click',async()=>{
    const success=await copy(PILOT.central);
    notify(success?'Адрес центрального кошелька скопирован':'Не удалось скопировать. Нажмите на адрес и скопируйте вручную.');
    tg?.HapticFeedback?.impactOccurred?.('light');
  });

  async function checkHash(hash){
    if(!txHashOk(hash)){
      title('Укажите корректный BSC-хеш в поле ниже.');
      return;
    }
    setBusy(true);
    title('Проверяю транзакцию в блокчейне BSC...');
    try{
      const result=await validateDepositHash(hash);
      savedHash=hash;slotAvailable=false;refreshSend();
      try{localStorage.setItem('mtt-pilot-bsc-tx',hash)}catch{}
      await drawDepositStatus(result);
      el('pilot-checked').textContent='Последняя проверка '+new Date().toLocaleTimeString('ru-RU');
    }catch(error){
      title('Проверка не пройдена: '+String(error.message).slice(0,180));
      el('pilot-checked').textContent='Если средства отправлены через relayer или контрактный кошелёк, автоматическая выплата не запустится. Не повторяйте перевод.';
      setSteps(0);
    }finally{setBusy(false)}
  }
  el('pilot-verify').addEventListener('click',()=>void checkHash(el('pilot-tx-input').value.trim()));

  async function scan(){
    setBusy(true);
    title('Ищу подтверждённый перевод с зарегистрированного адреса...');
    try{
      const result=await findRecentDeposit();
      if(!result){
        if(txHashOk(savedHash))return await checkHash(savedHash);
        title('Новый перевод не найден среди последних 1800 подтверждённых блоков BSC. Можно вставить хеш вручную.');
        return;
      }
      savedHash=result.hash;slotAvailable=false;refreshSend();
      el('pilot-tx-input').value=result.hash;
      try{localStorage.setItem('mtt-pilot-bsc-tx',result.hash)}catch{}
      await drawDepositStatus(result);
      el('pilot-checked').textContent='Транзакция найдена в публичном блокчейне BSC.';
    }catch(error){
      title('Не удалось прочитать RPC: '+String(error.message).slice(0,160)+'. Попробуйте проверить хеш вручную.');
    }finally{setBusy(false)}
  }
  el('pilot-scan').addEventListener('click',()=>void scan());

  submit.addEventListener('click',async()=>{
    if(!agreed.checked||!injected)return;
    if(!await refreshSlot())return;
    const yes=window.confirm('Отправить РОВНО 1 USDT (BEP-20) с зарегистрированного адреса '+allowedSender+' на '+PILOT.central+'? Ваш кошелёк запросит отдельное подтверждение. Это реальная операция.');
    if(!yes)return;
    submit.disabled=true;
    try{
      const hash=await sendViaInjectedProvider(window.ethereum);
      savedHash=hash;el('pilot-tx-input').value=hash;
      try{localStorage.setItem('mtt-pilot-bsc-tx',hash)}catch{}
      title('Запрос отправлен в BSC. Проверяю хеш...');
      tg?.HapticFeedback?.notificationOccurred?.('success');
      await checkHash(hash);
    }catch(error){
      title('Кошелёк не выполнил перевод: '+String(error.message).slice(0,180));
    }finally{refreshSend()}
  });

  async function quote(){
    try{
      const reserves=await fetchLiveReserves();
      const q=calculateQuote(parseUsdt('1'),reserves);
      el('pilot-quote').textContent='≈ '+formatWei(q.amountOut,2)+' MTT';
    }catch{
      el('pilot-quote').textContent='Курс недоступен';
    }
  }
  void quote();
  if(txHashOk(savedHash))void checkHash(savedHash);
  else void scan();
  // Read-only polling. Financial actions occur only in the separate private engine.
  window.setInterval(()=>{
    if(document.hidden||el('pane-pilot').classList.contains('hidden'))return;
    if(txHashOk(savedHash))void checkHash(savedHash);
    else void scan();
  },60000);
}
