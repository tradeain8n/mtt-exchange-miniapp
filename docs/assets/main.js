import {parseUsdt,formatWei,fetchLiveReserves,calculateQuote} from './quote.js';
import {getDeposit,hashOk,sendViaWallet,CENTRAL} from './chain.js';

const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#0b111c');tg.setBackgroundColor('#0b111c')}catch{}}
const el=id=>document.getElementById(id);
const $=selector=>document.querySelector(selector);
const amount=el('amount');
const fundingRoute=el('funding-route');
let sourceRoute=new URLSearchParams(window.location.search).get('asset')==='polygon-usdc'
 ?'polygon-usdc':'bsc-usdt';
fundingRoute.value=sourceRoute;
let lastServiceStatus=null;
let apiBase=null,accepting=false,quoteFresh=false,quoteTimer=null;
let currentHash='',checking=false,lastQuote=null,toastTimer=0;
const notify=msg=>{
 const toast=el('toast');toast.textContent=msg;toast.classList.remove('hidden');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.add('hidden'),3200);
};
const cleanHash=x=>String(x||'').trim();
async function copy(text){
 try{await navigator.clipboard.writeText(text);return true}
 catch{return false}
}
function tab(name){
 document.querySelectorAll('.tab').forEach(button=>{
  const selected=button.dataset.tab===name;
  button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));
 });
 document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.id!=='pane-'+name));
}
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.tab)));
const statusText={
 detected:'Депозит обнаружен в BSC',
 eligible:'Депозит проверен — начинается обработка',
 bridge_signed:'Отправляем USDT через мост',
 bridge_pending:'Ожидаем USDT в MTT Network',
 bridge_received:'USDT получен в MTT Network',
 approval_signed:'Подтверждается доступ Router',
 approved:'Готовится покупка MTT',
 swap_signed:'Покупка через пул отправлена',
 swap_received:'MTT куплены, готовим выплату',
 payout_signed:'MTT отправлены клиенту — ждём подтверждений',
 completed:'MTT зачислены клиенту',
 manual_review:'Операция остановлена для ручной проверки. Не повторяйте перевод.',
 refunded:'Средства возвращены'
};
const stages={
 detected:0,eligible:1,
 bridge_signed:1,bridge_pending:1,bridge_received:2,
 approval_signed:2,approved:2,swap_signed:2,swap_received:3,
 payout_signed:3,completed:4,manual_review:0,refunded:0
};
function steps(count){
 document.querySelectorAll('[data-stage]').forEach(element=>{
  const n=Number(element.dataset.stage);
  element.classList.toggle('done',n<count);
  element.classList.toggle('current',n===count);
 });
}
function addLink(label,url){
 const item=document.createElement('a');
 item.textContent=label;item.href=url;item.target='_blank';item.rel='noopener noreferrer';
 el('tx-links').append(item);
}
function setAccepting(state){
 lastServiceStatus=state;
 const polygon=sourceRoute==='polygon-usdc';
 accepting=!polygon&&Boolean(state?.accepting)&&apiBase!==null;
 el('service-closed-title').textContent=polygon
  ?'Polygon USDC пока не принимается':'Новые обмены временно недоступны';
 el('service-closed-description').textContent=polygon
  ?'Этот маршрут не подключён к финансовому процессору. Не переводите Polygon USDC или USDC.e на адрес обменника. Доступность BSC не означает доступность Polygon.'
  :'Котировку можно проверить, но отправлять средства пока нельзя. Открытие приёма подтверждается финансовым процессором.';
 const badge=el('service-badge');
 badge.classList.toggle('badge-open',accepting);
 badge.classList.toggle('badge-wait',!accepting);
 badge.querySelector('span').textContent=accepting?'Обмен доступен':polygon?'Polygon недоступен':'Приём приостановлен';
 el('service-closed').classList.toggle('hidden',accepting);
 el('payment-panel').classList.toggle('hidden',!accepting);
 el('footer-status').textContent=accepting?'Приём открыт':polygon?'Polygon USDC: недоступен':'Новые депозиты не принимаются';
 if(accepting&&state?.central){
  el('deposit-address').textContent=state.central;
 }
 updatePaymentButton();
}
function updatePaymentButton(){
 el('send').disabled=!accepting||!quoteFresh||!el('agree').checked||!window.ethereum?.request;
}
async function api(path){
 if(!apiBase)throw Error('Backend unavailable');
 const response=await fetch(apiBase+path,{cache:'no-store',signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error('Backend status '+response.status);
 return response.json();
}
async function initializeBackend(){
 try{
  const result=await fetch('./config.json',{cache:'no-store'});
  if(!result.ok)throw Error('Config unavailable');
  const config=await result.json();
  if(typeof config.apiBaseUrl==='string'){
   const url=new URL(config.apiBaseUrl);
   if(url.protocol==='https:'&&url.hostname!=='tradeain8n.github.io')
    apiBase=url.origin+url.pathname.replace(/\/$/,'');
  }
 }catch{}
 await refreshService();
}
async function refreshService(){
 try{
  if(!apiBase)throw Error('Backend not deployed');
  const data=await api('/api/health');
  setAccepting(data.ok?data:null);
 }catch{setAccepting(null)}
}
function renderSourceRoute(){
 const polygon=sourceRoute==='polygon-usdc';
 el('source-ticker').textContent=polygon?'USDC':'USDT';
 el('source-asset').textContent=polygon?'USDC':'USDT';
 el('source-network').textContent=polygon?'Polygon · 137':'BSC · BEP-20';
 el('route-description').textContent=polygon
  ?'USDC в Polygon — отдельный маршрут, пока недоступный для обмена на MTT. Существуют native USDC и USDC.e с разными контрактами. Не отправляйте средства до активации.'
  :'Отправляете USDT BEP-20 из личного EVM-кошелька в сети BNB Smart Chain. После подтверждения сервис покупает нативные MTT и выплачивает их на тот же адрес в MTT Network.';
 el('polygon-tracking-warning').classList.toggle('hidden',!polygon);
 el('check-tx').disabled=polygon;
 el('tx-hash').disabled=polygon;
 if(polygon){
  el('tx-progress').textContent='Polygon USDC пока не поддерживается: отслеживание переводов этой сети не включено.';
 }
 quoteFresh=false;lastQuote=null;
 setAccepting(lastServiceStatus);
}
fundingRoute.addEventListener('change',()=>{
 sourceRoute=fundingRoute.value==='polygon-usdc'?'polygon-usdc':'bsc-usdt';
 renderSourceRoute();
 void quote();
});

function sanitizeAmount(){
 const raw=amount.value.trim();
 const wei=parseUsdt(raw);
 if(wei<10n**18n||wei>20n*10n**18n)throw Error('Допускается от 1 до 20 USDT');
 return wei;
}
async function quote(){
 if(sourceRoute==='polygon-usdc'){
  quoteFresh=false;lastQuote=null;
  el('result').textContent='—';el('rate').textContent='—';
  el('quote-state').textContent='Маршрут не поддерживается';
  el('quote-warning').textContent='Polygon USDC пока не принимается. Не используйте котировку BSC USDT для Polygon. Native USDC и USDC.e — разные токены. Финальная цена и комиссии для Polygon ещё не рассчитаны.';
  updatePaymentButton();return;
 }
 const requested=amount.value;
 try{
  const wei=sanitizeAmount();
  let output,source;
  if(apiBase){
   try{
    const response=await api('/api/quote?amount='+encodeURIComponent(requested.replace(',','.')));
    output=response?.amountMtt;
    if(response?.ok&&output)source='backend';
   }catch{}
  }
  if(!source){
   const reserves=await fetchLiveReserves();
   const q=calculateQuote(wei,reserves);
   output=formatWei(q.amountOut,2).replace(/\s/g,'').replace(',','.');
   source='onchain';
  }
  if(amount.value!==requested||sourceRoute!=='bsc-usdt')return;
  lastQuote=output;
  quoteFresh=true;
  el('result').textContent=Number(output).toLocaleString('ru-RU',{maximumFractionDigits:2});
  el('rate').textContent=(Number(output)/Number(wei/10n**12n)*1000000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' MTT';
  el('quote-state').textContent=source==='backend'?'Текущая, плавающая':'Из текущих резервов';
  el('quote-warning').textContent='Предварительная котировка: клиенту 90% фактически купленных MTT, сервису 10%. Итог зависит от цены пула при исполнении. Вывод с Binance и сетевые комиссии оплачиваются отдельно.';
 }catch{
  quoteFresh=false;lastQuote=null;el('result').textContent='—';
  el('rate').textContent='—';el('quote-state').textContent='Недоступна';
  el('quote-warning').textContent='Невозможно безопасно рассчитать сумму. Не отправляйте средства.';
 }
 updatePaymentButton();
}
let quoteDelay=null;
amount.addEventListener('input',()=>{quoteFresh=false;updatePaymentButton();clearTimeout(quoteDelay);quoteDelay=setTimeout(quote,350)});
el('agree').addEventListener('change',updatePaymentButton);
el('copy-address').addEventListener('click',async()=>{
 if(!accepting)return;
 notify((await copy(CENTRAL))?'Адрес скопирован':'Не удалось скопировать адрес');
});
async function payment(){
 if(!accepting||!quoteFresh||!el('agree').checked)return;
 try{
  if(!await refreshLiveBeforePayment())return;
  const raw=amount.value.replace(',','.');
  if(!confirm('Отправить '+raw+' USDT BEP-20 на центральный адрес обменника? Выплата MTT будет рассчитана по фактическому курсу.'))return;
  const hash=await sendViaWallet(window.ethereum,raw);
  currentHash=hash;el('tx-hash').value=hash;
  try{localStorage.setItem('baby-mtt-last-tx',hash)}catch{}
  tab('status');await check();
 }catch(err){notify('Перевод не отправлен: '+String(err.message).slice(0,125))}
}
async function refreshLiveBeforePayment(){
 await refreshService();
 if(!accepting){
  notify('Приём временно недоступен: не отправляйте средства');
  return false;
 }
 return true;
}
el('send').addEventListener('click',()=>void payment());
function label(text){el('tx-progress').textContent=text}
async function check(){
 if(sourceRoute==='polygon-usdc'){
  label('Polygon USDC пока не отслеживается. Не отправляйте средства на адрес обменника.');return;
 }
 if(checking)return;
 const hash=cleanHash(el('tx-hash').value);
 if(!hashOk(hash)){label('Введите корректный BSC Transaction Hash');return}
 checking=true;el('check-tx').disabled=true;
 el('tx-links').replaceChildren();
 label('Проверяем реальную BSC-транзакцию...');
 try{
  const deposit=await getDeposit(hash);
  if(deposit.pending){
   label('Транзакция ещё не включена в блок. Повторите проверку.');
   steps(0);return;
  }
  currentHash=hash;
  try{localStorage.setItem('baby-mtt-last-tx',hash)}catch{}
  addLink('Посмотреть депозит в BscScan','https://bscscan.com/tx/'+hash);
  if(!deposit.confirmed){
   label('Подтверждения BSC: '+deposit.confirmations+'/12. Пока ожидаем.');
   steps(0);return;
  }
  label('Подтверждено '+deposit.amountUsdt+' USDT в BSC. Запрашиваем статус финансового процессора.');
  steps(1);
  if(!apiBase){label('Депозит подтверждён в BSC. Онлайн-статус процессора недоступен — обратитесь в поддержку с хешем.');return}
  const response=await api('/api/tx/'+encodeURIComponent(hash));
  if(!response.ok||!response.deposit)throw Error('Operation not indexed yet');
  const info=response.deposit;
  const phase=stages[info.state]??1;
  steps(phase);
  label((statusText[info.state]||'Обработка')+(info.customerMtt?' · '+info.customerMtt+' MTT':''));
  if(hashOk(info.bridgeTx))addLink('BSC → Bridge','https://bscscan.com/tx/'+info.bridgeTx);
  if(hashOk(info.bridgePayoutTx))addLink('Bridge → MTT Network','https://explorer.mtt.network/tx/'+info.bridgePayoutTx);
  if(hashOk(info.routerTx))addLink('Покупка в MTT Network','https://explorer.mtt.network/tx/'+info.routerTx);
  if(hashOk(info.payoutTx))addLink('Выплата MTT','https://explorer.mtt.network/tx/'+info.payoutTx);
 }catch(err){
  label('Не удалось получить полный статус: '+String(err.message).slice(0,90)+'. Не отправляйте USDT повторно.');
 }finally{checking=false;el('check-tx').disabled=false}
}
el('check-tx').addEventListener('click',()=>void check());
try{
 const saved=localStorage.getItem('baby-mtt-last-tx');
 if(hashOk(saved)){el('tx-hash').value=saved;currentHash=saved}
}catch{}
renderSourceRoute();
await initializeBackend();
await quote();
setInterval(()=>void quote(),30000);
setInterval(()=>void refreshService(),30000);
setInterval(()=>{if(sourceRoute==='bsc-usdt'&&!document.hidden&&currentHash&&$('.tab.selected')?.dataset.tab==='status')void check()},30000);
el('wallet-hint').textContent=window.ethereum?.request
 ?'Ваш EVM-кошелёк подключается через кнопку. Подтвердите перевод самостоятельно.'
 :'Встроенный EVM-кошелёк не обнаружен. При открытом приёме скопируйте адрес и отправьте USDT из своего кошелька.';
