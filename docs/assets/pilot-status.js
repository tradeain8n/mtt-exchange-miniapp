/**
 * Browser-safe chain observer for the *single* authorized Telegram pilot.
 * It never signs, stores private keys, or requests access to private GitHub.
 */
export const PILOT=Object.freeze({
  central:'0x976802182265f48ff30A2Bd64f489166f5D3D5aE',
  sender:'0x136e104e88916152a9C7bdDA9d5FaBaaEf63088a',
  usdtBsc:'0x55d398326f99059fF775485246999027B3197955',
  bridge:'0x36e999c652c0C433eDefba6dA98eaB7Dbd17b550',
  chainId:56,
  activationBlock:132808814,
  confirmations:6
});
const BSC_RPC='https://bsc-rpc.publicnode.com';
const MTT_RPC='https://evm-rpc.mtt.network/';
const MTT_EXPLORER='https://explorer.mtt.network/api/v2/';
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const WEI=10n**18n;
const lower=x=>String(x||'').toLowerCase();
export const txHashOk=hash=>/^0x[0-9a-f]{64}$/i.test(hash||'');
export const topicAddress=address=>'0x'+lower(address).slice(2).padStart(64,'0');
export const directTransferData=()=> '0xa9059cbb'+lower(PILOT.central).slice(2).padStart(64,'0')+WEI.toString(16).padStart(64,'0');

export async function rpc(url,method,params=[],fetcher=fetch){
  const response=await fetcher(url,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('RPC HTTP '+response.status);
  const result=await response.json();
  if(result.error)throw Error('RPC '+method+' unavailable');
  return result.result;
}
function exactTransfer(log){
  return lower(log?.address)===lower(PILOT.usdtBsc)
    &&lower(log?.topics?.[0])===TRANSFER_TOPIC
    &&lower(log?.topics?.[1])===topicAddress(PILOT.sender)
    &&lower(log?.topics?.[2])===topicAddress(PILOT.central)
    &&BigInt(log?.data||'0x0')===WEI;
}
export function validateDeposit(tx,receipt,head){
  if(!txHashOk(tx?.hash)||lower(tx.hash)!==lower(receipt?.transactionHash))
    throw Error('Неверный хеш транзакции');
  const block=Number.parseInt(receipt?.blockNumber||'0x0',16);
  if(block<=PILOT.activationBlock)throw Error('Депозит создан до активации пилота');
  if(lower(tx?.from)!==lower(PILOT.sender)||lower(tx?.to)!==lower(PILOT.usdtBsc))
    throw Error('Транзакция должна быть напрямую отправлена клиентом в контракт USDT');
  if(lower(tx?.input||tx?.data)!==directTransferData())throw Error('Нужен прямой вызов USDT.transfer ровно на 1 USDT');
  if(lower(receipt?.status)!=='0x1')throw Error('Транзакция не подтверждена успешно');
  const matches=(receipt?.logs||[]).filter(exactTransfer);
  if(matches.length!==1)throw Error('Не найден единственный перевод ровно 1 USDT');
  const confirmations=Math.max(0,Number(head)-block+1);
  return {hash:tx.hash,block,confirmations,
    confirmed:confirmations>=PILOT.confirmations};
}
export async function validateDepositHash(hash,{fetcher=fetch}={}){
  if(!txHashOk(hash))throw Error('Введите BSC-хеш формата 0x… (64 символа)');
  const [tx,receipt,head]=await Promise.all([
    rpc(BSC_RPC,'eth_getTransactionByHash',[hash],fetcher),
    rpc(BSC_RPC,'eth_getTransactionReceipt',[hash],fetcher),
    rpc(BSC_RPC,'eth_blockNumber',[],fetcher)
  ]);
  if(!tx||!receipt)return {hash,pending:true,confirmed:false,confirmations:0};
  const result=validateDeposit(tx,receipt,Number.parseInt(head,16));
  const block=await rpc(BSC_RPC,'eth_getBlockByNumber',[receipt.blockNumber,false],fetcher);
  return {...result,timestamp:block?.timestamp?Number.parseInt(block.timestamp,16):null};
}
export async function findRecentDeposit({fetcher=fetch,windowBlocks=1800}={}){
  const head=Number.parseInt(await rpc(BSC_RPC,'eth_blockNumber',[],fetcher),16);
  const end=head-PILOT.confirmations+1;
  const start=Math.max(PILOT.activationBlock+1,end-windowBlocks+1);
  if(start>end)return null;
  const results=[];
  for(let from=start;from<=end;from+=900){
    const to=Math.min(from+899,end);
    const logs=await rpc(BSC_RPC,'eth_getLogs',[{
      fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),
      address:PILOT.usdtBsc,
      topics:[TRANSFER_TOPIC,topicAddress(PILOT.sender),topicAddress(PILOT.central)]
    }],fetcher);
    results.push(...(logs||[]).filter(exactTransfer));
  }
  const hashes=[...new Set(results.map(log=>lower(log.transactionHash)))];
  if(hashes.length>1)throw Error('Найдено несколько депозитов — нужна ручная сверка');
  return hashes.length?validateDepositHash(hashes[0],{fetcher}):null;
}
export async function inspectMttRecipient({fetcher=fetch,since=null}={}){
  const [chain,balance]=await Promise.all([
    rpc(MTT_RPC,'eth_chainId',[],fetcher),
    rpc(MTT_RPC,'eth_getBalance',[PILOT.sender,'latest'],fetcher)
  ]);
  if(BigInt(chain)!==6880n)throw Error('Неверная сеть MTT Network');
  const result={balanceWei:BigInt(balance),payout:null};
  try{
    const url=MTT_EXPLORER+'addresses/'+PILOT.sender+'/transactions';
    const res=await fetcher(url,{method:'GET',signal:AbortSignal.timeout(12000)});
    if(!res.ok)return result;
    const data=await res.json();
    const candidate=(data.items||[]).find(tx=>{
      const epoch=Date.parse(tx.timestamp||'')/1000;
      return lower(tx.from?.hash||tx.from)===lower(PILOT.central)
        &&lower(tx.to?.hash||tx.to)===lower(PILOT.sender)
        &&BigInt(tx.value||'0')>0n
        &&(tx.status==='ok'||tx.status==='success'||tx.result==='success')
        &&Number.isFinite(epoch)&&Number.isFinite(since)&&since>0
        &&epoch>=since;
    });
    if(candidate)result.payout={hash:candidate.hash,amountWei:BigInt(candidate.value)};
  }catch{/* Explorer is advisory, balance and deposit remain independently verifiable. */}
  return result;
}
export async function sendViaInjectedProvider(ethereum){
  if(!ethereum?.request)throw Error('В Telegram нет подключённого кошелька. Переведите 1 USDT в своём кошельке.');
  const accounts=await ethereum.request({method:'eth_requestAccounts'});
  if(!Array.isArray(accounts)||lower(accounts[0])!==lower(PILOT.sender))
    throw Error('Подключён другой кошелёк. Требуется зарегистрированный тестовый адрес.');
  let chain=await ethereum.request({method:'eth_chainId'});
  if(BigInt(chain)!==56n){
    await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
    chain=await ethereum.request({method:'eth_chainId'});
  }
  if(BigInt(chain)!==56n)throw Error('Выберите BNB Smart Chain в кошельке.');
  const hash=await ethereum.request({method:'eth_sendTransaction',params:[{
    from:PILOT.sender,to:PILOT.usdtBsc,value:'0x0',
    data:directTransferData()
  }]});
  if(!txHashOk(hash))throw Error('Кошелёк не вернул BSC-хеш');
  return hash;
}
