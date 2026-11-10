import {SNAPSHOT,parseUsdt,formatWei,calculateQuote} from './quote.js';
const tg=window.Telegram?.WebApp;
if(tg){
  tg.ready();tg.expand();
  try{tg.setHeaderColor('#080e1c');tg.setBackgroundColor('#080e1c');}catch{}
}
const el=id=>document.getElementById(id);
const qs=sel=>document.querySelector(sel);
const amount=el('amount');
let lastQuote=null,simulationRunning=false,toastTimer;
const KEY='mtt-exchange-demo-history-v1';
const notify=text=>{
  const toast=el('toast');toast.textContent=text;toast.classList.remove('hidden');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.add('hidden'),3000);
};
function calculate(){
  try{
    lastQuote=calculateQuote(parseUsdt(amount.value));
    el('result').textContent=formatWei(lastQuote.amountOut,2);
    el('per-usdt').textContent=formatWei(lastQuote.ratePerUsdt,0)+' MTT';
    el('impact').textContent=(Number(lastQuote.impactBps)/100).toFixed(2).replace('.',',')+'%';
    el('simulate').disabled=false;
  }catch(err){
    lastQuote=null;el('result').textContent='—';el('per-usdt').textContent='—';
    el('impact').textContent='—';el('simulate').disabled=true;
  }
}
amount.addEventListener('input',calculate);
function historyRead(){
  try{
    const rows=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(rows)?rows.filter(x=>x?.id&&x?.amount).slice(0,20):[];
  }catch{return []}
}
function historyWrite(row){
  try{localStorage.setItem(KEY,JSON.stringify([row,...historyRead()].slice(0,20)));}catch{}
}
const escapeHTML=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderHistory(){
  const list=historyRead();
  if(!list.length){
    el('history-content').innerHTML='<div class="empty"><div class="empty-icon">◈</div><strong>История пока пуста</strong><p>Выполните демо-обмен — он появится здесь без отправки средств.</p></div>';
    return;
  }
  el('history-content').innerHTML=list.map(row=>
    '<div class="history-item"><div class="history-item-head"><strong>'+
    escapeHTML(row.amount)+' USDT → '+escapeHTML(row.received)+' MTT</strong><span>СИМУЛЯЦИЯ</span></div>'+
    '<small>'+escapeHTML(new Date(row.date).toLocaleString('ru-RU'))+' · Историческая котировка · '+escapeHTML(row.id)+'</small></div>'
  ).join('');
}
function setTab(name){
  for(const tab of document.querySelectorAll('.tab')){
    const selected=tab.dataset.tab===name;tab.classList.toggle('selected',selected);
    tab.setAttribute('aria-selected',String(selected));
  }
  for(const pane of document.querySelectorAll('.pane'))pane.classList.toggle('hidden',pane.id!=='pane-'+name);
  if(name==='history')renderHistory();
  tg?.HapticFeedback?.selectionChanged?.();
}
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>setTab(tab.dataset.tab)));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function simulate(){
  if(simulationRunning||!lastQuote)return;
  const quote={...lastQuote};
  simulationRunning=true;el('simulate').disabled=true;
  const s=el('simulation');s.classList.remove('hidden');
  s.scrollIntoView({behavior:'smooth',block:'nearest'});
  const steps=[...s.querySelectorAll('[data-step]')];
  const texts=['Депозит обнаружен (демо)','Ожидание подтверждений (демо)','Курс рассчитан (демо)','Выплата исполнена (демо)'];
  tg?.HapticFeedback?.impactOccurred?.('light');
  for(let i=0;i<steps.length;i++){
    steps.forEach((x,j)=>{x.classList.toggle('done',j<i);x.classList.toggle('current',i===j)});
    el('sim-status-text').textContent=texts[i];
    await wait(700);
  }
  steps.forEach(x=>{x.classList.remove('current');x.classList.add('done')});
  el('sim-status-text').textContent='Демо-сценарий завершён';
  el('sim-pill').textContent='✓ DEMO';
  historyWrite({id:'DEMO-'+Date.now().toString(36),date:new Date().toISOString(),
    amount:formatWei(quote.amountIn,2),received:formatWei(quote.amountOut,2)});
  tg?.HapticFeedback?.notificationOccurred?.('success');
  notify('Демо завершено. Реальных транзакций не было.');
  simulationRunning=false;calculate();
}
el('simulate').addEventListener('click',simulate);
el('environment').textContent=tg?.initData?'TELEGRAM · SANDBOX':'WEB PREVIEW · SANDBOX';
calculate();
