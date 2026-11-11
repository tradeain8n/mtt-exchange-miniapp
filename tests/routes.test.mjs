import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES,classifyPolygonUsdc,routeCanAccept} from '../docs/assets/routes.js';
import {CENTRAL} from '../docs/assets/chain.js';

const valid={ok:true,accepting:true,chainId:56,
 usdtContract:ROUTES['bsc-usdt'].contract,central:CENTRAL};

test('native Polygon USDC differs from bridged USDC.e and has six decimals',()=>{
 const polygon=ROUTES['polygon-usdc'];
 assert.equal(polygon.chainId,137);
 assert.equal(polygon.decimals,6);
 assert.equal(classifyPolygonUsdc(polygon.contract.toUpperCase()),'native');
 assert.equal(classifyPolygonUsdc(polygon.bridgedContract),'bridged');
 assert.equal(classifyPolygonUsdc(ROUTES['bsc-usdt'].contract),'unsupported');
});

test('Polygon USDC can never pass the BSC USDT payment gate',()=>{
 assert.equal(routeCanAccept('polygon-usdc',valid),false);
 assert.equal(routeCanAccept('polygon-usdc',{...valid,chainId:137,usdtContract:ROUTES['polygon-usdc'].contract}),false);
});

test('BSC USDT payment requires exact chain, token, healthy backend and central address',()=>{
 assert.equal(routeCanAccept('bsc-usdt',valid),true);
 for(const bad of [
  null,{...valid,ok:false},{...valid,accepting:false},
  {...valid,chainId:137},{...valid,usdtContract:ROUTES['polygon-usdc'].contract},
  {...valid,central:null},{...valid,central:'not-an-address'},
  {...valid,central:'0x'+'1'.repeat(40)}
 ])assert.equal(routeCanAccept('bsc-usdt',bad),false);
});

test('Mini App routes Polygon only to its own signed checkout and never BSC payment',()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../docs/assets/main.js',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../docs/assets/polygon_checkout.js',import.meta.url),'utf8');
 assert.match(html,/option value="polygon-usdc"/);
 assert.match(html,/id="service-closed-title"/);
 assert.match(html,/id="polygon-create" class="primary" disabled/);
 assert.match(html,/id="polygon-pay" class="primary" disabled/);
 assert.match(js,/polygonRouteCanAccept\(state\)/);
 assert.match(js,/sourceRoute==='polygon-usdc'/);
 assert.match(js,/\/api\/polygon\/quote/);
 assert.match(js,/sourceRoute!=='bsc-usdt'/);
 assert.match(checkout,/polygonOrderValid\(order\)/);
 assert.match(checkout,/isRouteActive\(\)/);
 assert.match(checkout,/isQuoteFresh\(\)/);
});
