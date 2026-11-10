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
  for(const invalid of ['','-1','0.01','21','1e8','1.1234567','Infinity','0']){
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

test('live reserve reader validates network and decodes onchain V2 pair response',async()=>{
  const encode=n=>n.toString(16).padStart(64,'0');
  const reserves='0x'+encode(SNAPSHOT.usdtWei)+encode(SNAPSHOT.wmttWei)+encode(1794321946n);
  const fakeFetch=async(url,init)=>{
    assert.equal(new URL(url).hostname,'evm-rpc.mtt.network');
    const {method}=JSON.parse(init.body);
    const values={'eth_chainId':'0x1ae0','eth_call':reserves,'eth_blockNumber':'0x15a3fa1'};
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:values[method]})};
  };
  const data=await fetchLiveReserves(fakeFetch);
  assert.equal(data.usdtWei,SNAPSHOT.usdtWei);
  assert.equal(data.wmttWei,SNAPSHOT.wmttWei);
  assert.equal(data.live,true);
  assert.equal(calculateQuote(parseUsdt('1'),data).amountOut,calculateQuote(parseUsdt('1')).amountOut);
});

test('direct pool quote matches on-chain Router getAmountsOut at observed reserves',()=>{
  const pool={...SNAPSHOT,usdtWei:383475212044373142837n,wmttWei:15188106589039093340415064n};
  const input=parseUsdt('1');
  const weight=input*975n;
  const routerExpected=weight*pool.wmttWei/(pool.usdtWei*1000n+weight);
  assert.equal(routerExpected,38518391875939280018766n);
  assert.equal(calculateQuote(input,pool).amountOut,routerExpected*9000n/10000n);
});
