// Illustrative, immutable reserve snapshot. Direct pool route without Quick Swap bot.
// Never use this historical snapshot as an executable quote.
export const SNAPSHOT = Object.freeze({
  block: 22708828,
  capturedAt: '2026-11-10',
  usdtWei: 359838025095212724162n,
  wmttWei: 16763215249411104165279683n,
  botFeeBps: 0n,
  poolFeeBps: 250n
});
const UNIT=10n**18n;
export function parseUsdt(value) {
  const normalized=String(value).trim().replace(',','.');
  if(!/^\d{1,5}(\.\d{0,6})?$/.test(normalized)) throw Error('Укажите корректную сумму USDT');
  const [whole,frac='']=normalized.split('.');
  const amount=BigInt(whole)*UNIT+BigInt((frac+'0'.repeat(18)).slice(0,18));
  if(amount<UNIT/10n || amount>20n*UNIT)throw Error('В демо доступно от 0,1 до 20 USDT');
  return amount;
}
export function formatWei(value,digits=2) {
  const factor=10n**BigInt(18-digits);
  const rounded=(value+factor/2n)/factor;
  const whole=rounded/(10n**BigInt(digits));
  const frac=(rounded%(10n**BigInt(digits))).toString().padStart(digits,'0');
  const readable=whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  return digits?readable+','+frac:readable;
}
export function calculateQuote(amountWei, reserves=SNAPSHOT) {
  if(typeof amountWei!=='bigint' || amountWei<=0n)throw Error('Сумма должна быть положительной');
  const {usdtWei,wmttWei,botFeeBps,poolFeeBps}=reserves;
  if(usdtWei<=0n || wmttWei<=0n)throw Error('Недоступные резервы');
  const amountNet=amountWei*(10000n-botFeeBps)/10000n;
  const amountPoolWeighted=amountNet*(10000n-poolFeeBps);
  const poolOutput=amountPoolWeighted*wmttWei/(usdtWei*10000n+amountPoolWeighted);
  // The customer-visible output is inclusive of our pricing; actual route is Bridge 1:1 then direct AMM.
  const amountOut=poolOutput*9000n/10000n;
  const ideal=amountNet*wmttWei/usdtWei;
  const impactBps=ideal>0n?(ideal-poolOutput)*10000n/ideal:0n;
  return {amountIn:amountWei,amountOut,impactBps,
    ratePerUsdt:amountOut*UNIT/amountWei,source:'quoted_customer_total',block:reserves.block};
}

// Public on-chain liquidity data only. No user funds, authentication or transaction signing.
export async function fetchLiveReserves(fetcher=fetch){
  async function call(method,params=[]){
    const response=await fetcher('https://evm-rpc.mtt.network/',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',method,params,id:1}),
      signal:AbortSignal.timeout(9000)
    });
    if(!response.ok)throw Error('MTT RPC unavailable');
    const data=await response.json();
    if(data.error||typeof data.result!=='string')throw Error('MTT RPC invalid result');
    return data.result;
  }
  const chain=await call('eth_chainId');
  if(BigInt(chain)!==6880n)throw Error('Wrong MTT network');
  const pair='0xd177f36436C7C85E4a0bBEcF10A3A331E97Dd4c0';
  const [raw,block]=await Promise.all([
    call('eth_call',[{to:pair,data:'0x0902f1ac'},'latest']),
    call('eth_blockNumber')
  ]);
  if(raw.length<194)throw Error('Unexpected pool reserves format');
  const usdtWei=BigInt('0x'+raw.slice(2,66));
  const wmttWei=BigInt('0x'+raw.slice(66,130));
  if(usdtWei<=0n||wmttWei<=0n)throw Error('Empty liquidity pool');
  return {...SNAPSHOT,usdtWei,wmttWei,block:Number(BigInt(block)),live:true};
}
