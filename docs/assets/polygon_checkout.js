import {ROUTES} from './routes.js';
import {CENTRAL} from './chain.js';

export function parsePolygonUsdcAmount(text){
 if(typeof text!=='string'||! /^(?:[3-9]|1[0-9]|20)(?:\.[0-9]{1,6})?$/.test(text))
  throw Error('Допустимо от 3 до 20 USDC, до 6 знаков после запятой');
 const [whole,frac='']=text.split('.');
 const wei=BigInt(whole)*1000000n+BigInt(frac.padEnd(6,'0')||'0');
 if(wei<3000000n||wei>20000000n)throw Error('Сумма должна быть 3–20 USDC');
 return wei;
}
export function encodePolygonUsdcTransfer(to,amount){
 if(!/^0x[0-9a-f]{40}$/i.test(to||''))throw Error('Неверный адрес депозита');
 const wei=parsePolygonUsdcAmount(amount);
 return '0xa9059cbb'+to.slice(2).toLowerCase().padStart(64,'0')+
  wei.toString(16).padStart(64,'0');
}
export function polygonOrderValid(order){
 try{
  return Boolean(order&&order.state==='waiting'&&
   /^0x[0-9a-f]{40}$/i.test(order.depositAddress||'')&&
   order.depositAddress.toLowerCase()!==CENTRAL.toLowerCase()&&
   order.depositToken?.toLowerCase()===ROUTES['polygon-usdc'].contract.toLowerCase()&&
   order.depositNetwork==='polygon'&&
   parsePolygonUsdcAmount(order.depositAmount)>=3000000n&&
   Number.isFinite(Date.parse(order.expiresAt))&&
   Date.parse(order.expiresAt)>Date.now()+10000);
 }catch{return false}
}
const STATUSES={
 creating:'Создание заявки',quoted:'Котировка получена',waiting:'Ожидание USDC в Polygon',
 pending:'Депозит обнаружен',processing:'SideShift конвертирует USDC',
 settled:'USDT отправлены в сеть BSC',settlement_verified:'USDT в BSC проверены',
 completed:'Выплата MTT завершена',manual_review:'Требуется ручная проверка — не отправляйте повторно',
 refunded:'Возврат подтверждён',expired:'Срок заявки истёк — не используйте старый адрес'
};

export function setupPolygonCheckout({el,notify,getApiBase,isRouteActive,isQuoteFresh,getSourceRoute,getAmount}){
 const btn=el('polygon-create'),pay=el('polygon-pay');
 const orderSection=el('polygon-order');
 let order=null,access=null,busy=false;
 const saved=()=>{
  try{
   const v=JSON.parse(localStorage.getItem('baby-mtt-polygon-order')||'null');
   return v&&/^[a-f0-9]{32}$/.test(v.id)&&/^[a-f0-9]{64}$/.test(v.viewerToken)?v:null;
  }catch{return null}
 };
 const persist=value=>{
  try{localStorage.setItem('baby-mtt-polygon-order',JSON.stringify(value))}catch{}
 };
 async function request(path,{method='GET',body,token}={}){
  const base=getApiBase();
  if(!base)throw Error('Финансовый backend недоступен');
  const options={method,cache:'no-store',signal:AbortSignal.timeout(12000),headers:{}};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
  if(token)options.headers.authorization='Bearer '+token;
  const response=await fetch(base+path,options);
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok)throw Error(data?.error||'Backend ответил '+response.status);
  return data;
 }
 function setOrder(item,token){
  order=item;access=token;refreshPresentation();
 }
 function refreshPresentation(){
  const isPolygon=getSourceRoute()==='polygon-usdc';
  const canPay=isPolygon&&isRouteActive()&&!busy&&
   polygonOrderValid(order)&&window.ethereum?.request;
  const hasDeposit=isPolygon&&polygonOrderValid(order);
  orderSection.classList.toggle('hidden',!hasDeposit);
  el('polygon-order-address').textContent=hasDeposit?order.depositAddress:'';
  el('polygon-order-details').textContent=hasDeposit
   ?'Ровно '+order.depositAmount+' USDC Circle · Polygon 137. Выплата на '+order.payoutAddress+'. Ожидаемые USDT BSC: '+(order.settleUsdt||'—')
   :'';
  el('polygon-order-expiry').textContent=hasDeposit
   ?'Адрес действует до '+new Date(order.expiresAt).toLocaleString('ru-RU')+'. Не переводите после окончания срока.':'';
  pay.disabled=!canPay;
  btn.disabled=!isPolygon||!isRouteActive()||!isQuoteFresh()||busy||!window.ethereum?.request||
   !el('polygon-agree').checked||hasDeposit;
  const target=el('polygon-status');
  target.textContent=order
   ?(STATUSES[order.state]||'Проверка статуса')+
    (order.providerStatus?' · SideShift: '+order.providerStatus:'')
   :'Заявка ещё не создана';
  el('polygon-order-links').replaceChildren();
  if(order?.shiftId&&/^[a-z0-9-]{12,64}$/i.test(order.shiftId)){
   const a=document.createElement('a');
   a.href='https://sideshift.ai/orders/'+order.shiftId;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent='Открыть заявку SideShift';
   el('polygon-order-links').append(a);
  }
  for(const [name,url] of [
   ['Транзакция USDC Polygon',order?.depositHash&&'https://polygonscan.com/tx/'+order.depositHash],
   ['Поступление USDT BSC',order?.settleHash&&'https://bscscan.com/tx/'+order.settleHash]
  ]){
   if(typeof url!=='string'||!/\/tx\/0x[0-9a-f]{64}$/i.test(url))continue;
   const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent=name;el('polygon-order-links').append(a);
  }
 }
 async function refresh(){
  const memory=saved();if(!memory)return;
  try{
   const data=await request('/api/polygon/orders/'+memory.id,{token:memory.viewerToken});
   setOrder(data.order,memory.viewerToken);
  }catch{
   order=null;access=null;refreshPresentation();
   if(getSourceRoute()==='polygon-usdc')
    el('polygon-status').textContent='Статус не подтверждён. Не повторяйте перевод; попробуйте позже.';
  }
 }
 async function create(){
  if(getSourceRoute()!=='polygon-usdc'||!isRouteActive()||!isQuoteFresh()||busy)return;
  busy=true;refreshPresentation();
  try{
   const raw=getAmount().trim().replace(',','.');
   parsePolygonUsdcAmount(raw);
   if(!window.ethereum?.request)throw Error('Откройте приложение в браузере EVM-кошелька');
   const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
   const address=accounts?.[0];
   if(!/^0x[0-9a-f]{40}$/i.test(address||''))throw Error('Кошелёк не подключён');
   // Recheck that the provider has not paused while the wallet was connecting.
   const info=await request('/api/polygon/health');
   if(info.route?.accepting!==true)throw Error('Новые депозиты временно закрыты');
   const challenge=await request('/api/polygon/challenge',{
    method:'POST',body:{address,amount:raw}
   });
   const signature=await window.ethereum.request({
    method:'personal_sign',params:[challenge.message,address]
   });
   const registered=await request('/api/polygon/orders',{
    method:'POST',body:{address,amount:raw,nonce:challenge.nonce,signature}
   });
   if(!registered.order||!/^[a-f0-9]{64}$/.test(registered.viewerToken||''))
    throw Error('Ответ заявки некорректен — не переводите USDC');
   persist({id:registered.order.id,viewerToken:registered.viewerToken});
   setOrder(registered.order,registered.viewerToken);
   notify('Заявка SideShift создана. Проверьте адрес, сумму и срок действия.');
  }catch(e){notify('Заявка не создана: '+String(e.message).slice(0,140))}
  finally{busy=false;refreshPresentation()}
 }
 async function send(){
  if(busy||!isRouteActive()||!polygonOrderValid(order)||!access)return;
  busy=true;refreshPresentation();
  try{
   const latest=await request('/api/polygon/orders/'+order.id,{token:access});
   setOrder(latest.order,access);
   if(!polygonOrderValid(latest.order))throw Error('Заявка истекла или изменила состояние');
   const address=latest.order.payoutAddress;
   const accounts=await window.ethereum.request({method:'eth_accounts'});
   if(!accounts?.some(a=>a.toLowerCase()===address.toLowerCase()))
    throw Error('Подключите тот же кошелёк, который подписал заявку');
   const chain=await window.ethereum.request({method:'eth_chainId'});
   if(parseInt(chain,16)!==137){
    await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x89'}]});
   }
   const afterChain=await window.ethereum.request({method:'eth_chainId'});
   const afterAccounts=await window.ethereum.request({method:'eth_accounts'});
   if(parseInt(afterChain,16)!==137||
    !afterAccounts?.some(a=>a.toLowerCase()===address.toLowerCase()))
    throw Error('Сеть Polygon или адрес кошелька изменились');
   if(!isRouteActive()||!polygonOrderValid(order))
    throw Error('Приём был закрыт или срок заявки истёк. Не отправляйте USDC');
   if(!confirm('Отправить РОВНО '+latest.order.depositAmount+
    ' USDC Polygon на индивидуальный адрес SideShift? После истечения срока переводить нельзя.'))return;
   const data=encodePolygonUsdcTransfer(latest.order.depositAddress,latest.order.depositAmount);
   const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[{
    from:address,to:ROUTES['polygon-usdc'].contract,data,value:'0x0'
   }]});
   if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('Транзакция отправлена, но хеш не получен');
   notify('Транзакция USDC отправлена. Не повторяйте перевод. Хеш: '+hash.slice(0,16)+'…');
  }catch(e){notify('Перевод не выполнен или не подтверждён: '+String(e.message).slice(0,130))}
  finally{busy=false;refreshPresentation()}
 }
 btn.addEventListener('click',()=>void create());
 pay.addEventListener('click',()=>void send());
 el('polygon-agree').addEventListener('change',refreshPresentation);
 el('polygon-copy-address').addEventListener('click',async()=>{
  if(!polygonOrderValid(order))return;
  try{await navigator.clipboard.writeText(order.depositAddress);notify('Адрес SideShift скопирован')}
  catch{notify('Не удалось скопировать адрес')}
 });
 el('polygon-check-order').addEventListener('click',()=>void refresh());
 refreshPresentation();
 return {refresh,refreshPresentation,getOrder:()=>order};
}
