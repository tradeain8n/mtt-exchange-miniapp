import test from 'node:test';
import assert from 'node:assert/strict';
import {SNAPSHOT,parseUsdt,formatWei,calculateQuote,fetchLiveReserves} from '../docs/assets/quote.js';
test('exact USDT decimals and display',()=>{
  assert.equal(parseUsdt('1,10'),1100000000000000000n);
  assert.equal(formatWei(parseUsdt('1.1'),2),'1,10');
});
test('quote produces positive MTT output without double spending',()=>{
  const q=calculateQuote(parseUsdt('1.1'));
  assert.ok(q.amountOut>30000n*10n**18n);
  assert.ok(q.amountOut<60000n*10n**18n);
  assert.equal(q.source,'quoted_customer_total');
  assert.equal(q.block,SNAPSHOT.block);
});
test('larger trade increases price impact',()=>{
  const small=calculateQuote(parseUsdt('1'));
  const large=calculateQuote(parseUsdt('20'));
  assert.ok(large.impactBps>small.impactBps);
});
test('invalid input cannot become a quote',()=>{
  for(const invalid of ['','-1','0.01','0.5','21','1e8','1.1234567','Infinity','0']){
    assert.throws(()=>parseUsdt(invalid));
  }
});

test('displayed customer quote is net of the configured spread, not gross provider output',()=>{
  const amount=parseUsdt('1');
  const q=calculateQuote(amount);
  const net=amount;
  const w=net*9750n;
  const gross=w*SNAPSHOT.wmttWei/(SNAPSHOT.usdtWei*10000n+w);
  assert.equal(q.amountOut,gross*9000n/10000n);
});

const USDT='0x78a39b9101983D2009Ff14773E8e47Ca3a23BBfD';
const WMTT='0xD0CA95e52995F55e62A1670E16A13DAdb76379A9';
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const addressWord=a=>'0x'+'0'.repeat(24)+a.slice(2).toLowerCase();
function poolMock({token0=USDT,token1=WMTT,reserve0=SNAPSHOT.usdtWei,
 reserve1=SNAPSHOT.wmttWei,chain='0x1ae0'}={}){
 const calls=[];
 const fetcher=async(url,init)=>{
  assert.equal(new URL(url).hostname,'evm-rpc.mtt.network');
  const {method,params}=JSON.parse(init.body);
  calls.push({method,params});
  let result;
  if(method==='eth_chainId')result=chain;
  else if(method==='eth_blockNumber')result='0x15a3fa1';
  else if(method==='eth_call'){
   assert.equal(params[1],'0x15a3fa1','all pool reads must use the same block');
   const selectors={
    '0x0902f1ac':'0x'+word(reserve0)+word(reserve1)+word(1794321946n),
    '0x0dfe1681':addressWord(token0),
    '0xd21220a7':addressWord(token1)
   };
   result=selectors[params[0].data];
   assert.ok(result,'unexpected selector');
  }else throw Error('Unexpected RPC method '+method);
  return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};
 };
 return {fetcher,calls};
}

test('live reserves validate MTT network, pool assets and consistent block tag',async()=>{
 const mock=poolMock();
 const data=await fetchLiveReserves(mock.fetcher);
 assert.equal(data.usdtWei,SNAPSHOT.usdtWei);
 assert.equal(data.wmttWei,SNAPSHOT.wmttWei);
 assert.equal(data.live,true);
 assert.equal(data.block,Number(0x15a3fa1));
 assert.equal(mock.calls.filter(x=>x.method==='eth_call').length,3);
 assert.equal(calculateQuote(parseUsdt('1'),data).amountOut,calculateQuote(parseUsdt('1')).amountOut);
});
test('live reserves decode reversed token ordering correctly',async()=>{
 const data=await fetchLiveReserves(poolMock({
  token0:WMTT,token1:USDT,reserve0:SNAPSHOT.wmttWei,reserve1:SNAPSHOT.usdtWei
 }).fetcher);
 assert.equal(data.usdtWei,SNAPSHOT.usdtWei);
 assert.equal(data.wmttWei,SNAPSHOT.wmttWei);
});
test('unknown pool token or wrong chain must fail closed',async()=>{
 await assert.rejects(fetchLiveReserves(poolMock({
  token0:'0x'+'1'.repeat(40)
 }).fetcher),/Unexpected MTT pair assets/);
 await assert.rejects(fetchLiveReserves(poolMock({chain:'0x38'}).fetcher),/Wrong MTT network/);
});

test('direct pool quote matches on-chain Router getAmountsOut at observed reserves',()=>{
  const pool={...SNAPSHOT,usdtWei:383475212044373142837n,wmttWei:15188106589039093340415064n};
  const input=parseUsdt('1');
  const weight=input*975n;
  const routerExpected=weight*pool.wmttWei/(pool.usdtWei*1000n+weight);
  assert.equal(routerExpected,38518391875939280018766n);
  assert.equal(calculateQuote(input,pool).amountOut,routerExpected*9000n/10000n);
});
