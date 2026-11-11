import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePolygonUsdcAmount,encodePolygonUsdcTransfer,polygonOrderValid} from '../docs/assets/polygon_checkout.js';
import {ROUTES,polygonRouteCanAccept,routeCanAccept} from '../docs/assets/routes.js';
import {CENTRAL} from '../docs/assets/chain.js';

test('Polygon USDC amount is exact 6-decimal 3–20 range, no floating rounding',()=>{
 assert.equal(parsePolygonUsdcAmount('3'),3000000n);
 assert.equal(parsePolygonUsdcAmount('20'),20000000n);
 assert.equal(parsePolygonUsdcAmount('19.123456'),19123456n);
 for(const x of ['2.99','20.000001','20.123','3.1234567','3.1e0','0','03','3,5'])
  assert.throws(()=>parsePolygonUsdcAmount(x));
});
test('direct ERC20 transaction is encoded for SideShift deposit, not central wallet',()=>{
 const dest='0x'+'1'.repeat(40);
 const data=encodePolygonUsdcTransfer(dest,'3.000001');
 assert.match(data,/^0xa9059cbb[0-9a-f]{128}$/);
 assert.equal(BigInt('0x'+data.slice(-64)),3000001n);
 assert.equal('0x'+data.slice(34,74),dest);
 assert.throws(()=>encodePolygonUsdcTransfer('INVALID','3'));
});
test('only exact Polygon route readiness enables customer order creation',()=>{
 const good={accepting:true,network:'polygon',chainId:137,
  token:ROUTES['polygon-usdc'].contract,payoutNetwork:'MTT',minUsdc:'3',maxUsdc:'20'};
 assert.equal(polygonRouteCanAccept(good),true);
 for(const bad of [
  null,{...good,accepting:false},{...good,chainId:56},
  {...good,token:ROUTES['polygon-usdc'].bridgedContract},
  {...good,minUsdc:'1'},{...good,payoutNetwork:'BSC'},
  {...good,network:'ethereum'}
 ])assert.equal(polygonRouteCanAccept(bad),false);
 assert.equal(routeCanAccept('polygon-usdc',good),false);
 assert.equal(routeCanAccept('bsc-usdt',{
  accepting:true,ok:true,chainId:56,
  usdtContract:ROUTES['bsc-usdt'].contract,central:CENTRAL
 }),true);
});
test('client never sees expired, unknown token or non-waiting deposit address',()=>{
 const active={state:'waiting',depositAddress:'0x'+'1'.repeat(40),
  depositToken:ROUTES['polygon-usdc'].contract,depositNetwork:'polygon',
  depositAmount:'5',expiresAt:new Date(Date.now()+240000).toISOString()};
 assert.equal(polygonOrderValid(active),true);
 assert.equal(polygonOrderValid({...active,state:'expired'}),false);
 assert.equal(polygonOrderValid({...active,depositToken:ROUTES['polygon-usdc'].bridgedContract}),false);
 assert.equal(polygonOrderValid({...active,depositAmount:'21'}),false);
 assert.equal(polygonOrderValid({...active,expiresAt:new Date(Date.now()-60000).toISOString()}),false);
 assert.equal(polygonOrderValid({...active,depositAddress:CENTRAL}),false);
});
test('UI routes to signed order APIs and cannot use BSC send for Polygon',()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const main=readFileSync(new URL('../docs/assets/main.js',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../docs/assets/polygon_checkout.js',import.meta.url),'utf8');
 assert.match(html,/id="polygon-create" class="primary" disabled/);
 assert.match(html,/id="polygon-pay" class="primary" disabled/);
 assert.match(html,/id="polygon-order" class="hidden"/);
 assert.match(main,/polygonRouteCanAccept\(state\)/);
 assert.match(main,/sourceRoute!=='bsc-usdt'/);
 assert.match(checkout,/personal_sign/);
 assert.match(checkout,/eth_sendTransaction/);
 assert.match(checkout,/wallet_switchEthereumChain/);
 assert.match(checkout,/\/api\/polygon\/challenge/);
 assert.match(checkout,/\/api\/polygon\/orders/);
 assert.match(checkout,/isQuoteFresh\(\)/);
});
