// Illustrative, immutable reserve snapshot. Never use as an executable quote.
export const SNAPSHOT = Object.freeze({
  block: 22708828,
  capturedAt: '2026-11-10',
  usdtWei: 359838025095212724162n,
  wmttWei: 16763215249411104165279683n,
  botFeeBps: 100n,
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
  const amountOut=amountPoolWeighted*wmttWei/(usdtWei*10000n+amountPoolWeighted);
  const ideal=amountNet*wmttWei/usdtWei;
  const impactBps=ideal>0n?(ideal-amountOut)*10000n/ideal:0n;
  return {amountIn:amountWei,amountOut,impactBps,botFeeWei:amountWei-amountNet,
    ratePerUsdt:amountOut*UNIT/amountWei,source:'historical_snapshot',block:reserves.block};
}
