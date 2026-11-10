import test from 'node:test';
import assert from 'node:assert/strict';
import {SNAPSHOT,parseUsdt,formatWei,calculateQuote} from '../docs/assets/quote.js';
test('exact USDT decimals and display',()=>{
  assert.equal(parseUsdt('1,10'),1100000000000000000n);
  assert.equal(formatWei(parseUsdt('1.1'),2),'1,10');
});
test('quote produces positive MTT output without double spending',()=>{
  const q=calculateQuote(parseUsdt('1.1'));
  assert.ok(q.amountOut>40000n*10n**18n);
  assert.ok(q.amountOut<60000n*10n**18n);
  assert.equal(q.source,'historical_snapshot');
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
