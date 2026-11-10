import {parseUsdt,formatWei} from './quote.js';
export const BSC_RPC='https://bsc-rpc.publicnode.com';
export const CENTRAL='0x976802182265f48ff30A2Bd64f489166f5D3D5aE';
export const USDT_BSC='0x55d398326f99059fF775485246999027B3197955';
export const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const lower=s=>String(s||'').toLowerCase();
const topicAddr=s=>'0x'+lower(s).slice(2).padStart(64,'0');
export const hashOk=s=>/^0x[0-9a-f]{64}$/i.test(s||'');
export const createTransferData=(amount)=>{
 if(typeof amount!=='bigint'||amount<=0n)throw Error('Amount invalid');
 return '0xa9059cbb'+lower(CENTRAL).slice(2).padStart(64,'0')+amount.toString(16).padStart(64,'0');
};
export async function rpc(url,method,params=[],fetcher=fetch){
 const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('RPC unavailable');
 const payload=await response.json();
 if(payload.error)throw Error('RPC error');
 return payload.result;
}
export function verifiedDeposit(tx,receipt,head){
 if(!hashOk(tx?.hash)||lower(tx.hash)!==lower(receipt?.transactionHash)||lower(receipt?.status)!=='0x1')
  throw Error('Транзакция отсутствует или неуспешна');
 if(lower(tx.to)!==lower(USDT_BSC))throw Error('Неверный контракт USDT');
 const input=lower(tx.input||tx.data||'');
 if(input.length!==138||!input.startsWith('0xa9059cbb')||'0x'+input.slice(34,74)!==lower(CENTRAL))
  throw Error('Нужен прямой перевод USDT на адрес обменника');
 const amount=BigInt('0x'+input.slice(74));
 if(amount<10n**18n||amount>20n*10n**18n)throw Error('Сумма вне диапазона обслуживания');
 const logs=(receipt.logs||[]).filter(log=>{
  try{return lower(log.address)===lower(USDT_BSC)
   &&lower(log.topics[0])===TRANSFER_TOPIC
   &&lower(log.topics[1])===topicAddr(tx.from)
   &&lower(log.topics[2])===topicAddr(CENTRAL)
   &&BigInt(log.data)===amount;}catch{return false}
 });
 if(logs.length!==1)throw Error('Не найден единственный подходящий USDT Transfer');
 const block=Number.parseInt(receipt.blockNumber,16);
 const confirmations=Math.max(0,head-block+1);
 return {hash:tx.hash,sender:tx.from,block,confirmations,
  amountUsdt:formatWei(amount,6),confirmed:confirmations>=12};
}
export async function getDeposit(hash,{fetcher=fetch}={}){
 if(!hashOk(hash))throw Error('Некорректный BSC Transaction Hash');
 const [tx,receipt,head]=await Promise.all([
  rpc(BSC_RPC,'eth_getTransactionByHash',[hash],fetcher),
  rpc(BSC_RPC,'eth_getTransactionReceipt',[hash],fetcher),
  rpc(BSC_RPC,'eth_blockNumber',[],fetcher)
 ]);
 if(!tx||!receipt)return {hash,pending:true,confirmed:false,confirmations:0};
 return verifiedDeposit(tx,receipt,Number(BigInt(head)));
}
export async function sendViaWallet(ethereum,amountText){
 if(!ethereum?.request)throw Error('Нет доступного EVM-кошелька в Telegram');
 const amount=parseUsdt(amountText);
 if(amount<10n**18n||amount>20n*10n**18n)throw Error('Поддерживается 1–20 USDT');
 const accounts=await ethereum.request({method:'eth_requestAccounts'});
 if(!Array.isArray(accounts)||!/^0x[0-9a-f]{40}$/i.test(accounts[0]||''))throw Error('Кошелёк не подключён');
 let network=await ethereum.request({method:'eth_chainId'});
 if(BigInt(network)!==56n){
  await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
  network=await ethereum.request({method:'eth_chainId'});
 }
 if(BigInt(network)!==56n)throw Error('Требуется сеть BNB Smart Chain');
 const hash=await ethereum.request({method:'eth_sendTransaction',params:[{
  from:accounts[0],to:USDT_BSC,value:'0x0',data:createTransferData(amount)
 }]});
 if(!hashOk(hash))throw Error('Кошелёк не вернул BSC-хеш');
 return hash;
}
