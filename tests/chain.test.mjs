import test from 'node:test';
import assert from 'node:assert/strict';
import {CENTRAL,USDT_BSC,createTransferData,verifiedDeposit,
 getDeposit,hashOk,sendViaWallet} from '../docs/assets/chain.js';
import {parseUsdt} from '../docs/assets/quote.js';

const H='0x'+'a'.repeat(64);
const FROM='0x136e104e88916152a9C7bdDA9d5FaBaaEf63088a';
const amount=parseUsdt('1.5');
const input=createTransferData(amount);
const pad=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
const tx={hash:H,from:FROM,to:USDT_BSC,input};
const receipt={
 transactionHash:H,status:'0x1',blockNumber:'0x64',
 logs:[{address:USDT_BSC,topics:[
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  pad(FROM),pad(CENTRAL)],data:'0x'+amount.toString(16)}]
};
test('customer can deposit variable USDT amounts, not tied to pilot wallet',()=>{
 assert.equal(createTransferData(parseUsdt('1.5')).length,138);
 const validated=verifiedDeposit(tx,receipt,112);
 assert.equal(validated.amountUsdt,'1,500000');
 assert.equal(validated.confirmations,13);
 assert.equal(validated.confirmed,true);
});
test('reject forged token, wrong transfer amount, stale or failed transaction',()=>{
 assert.throws(()=>verifiedDeposit({...tx,to:CENTRAL},receipt,112),/контракт/);
 assert.throws(()=>verifiedDeposit({...tx,input:createTransferData(parseUsdt('20'))},receipt,112),/Transfer/);
 assert.throws(()=>verifiedDeposit(tx,{...receipt,status:'0x0'},112),/неуспешна/);
 assert.equal(hashOk(H),true);
 assert.equal(hashOk('0x123'),false);
});
test('BSC RPC mocks return real receipt and confirmations',async()=>{
 const mocks={
  eth_getTransactionByHash:tx,eth_getTransactionReceipt:receipt,
  eth_blockNumber:'0x72'
 };
 const mock=async(url,options)=>({ok:true,json:async()=>({
  result:mocks[JSON.parse(options.body).method]
 })});
 const result=await getDeposit(H,{fetcher:mock});
 assert.equal(result.confirmations,15);
});
test('wallet only requests direct ERC20 transfer on chain 56',async()=>{
 const requested=[];
 const provider={request:async ({method,params})=>{
  requested.push(method);
  if(method==='eth_requestAccounts')return [FROM];
  if(method==='eth_chainId')return '0x38';
  if(method==='eth_sendTransaction'){
   assert.equal(params[0].to,USDT_BSC);
   assert.equal(params[0].data,createTransferData(amount));
   return H;
  }
 }};
 assert.equal(await sendViaWallet(provider,'1.5'),H);
 assert.deepEqual(requested,['eth_requestAccounts','eth_chainId','eth_sendTransaction']);
});
