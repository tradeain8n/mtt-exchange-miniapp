import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT,directTransferData,topicAddress,validateDeposit,
  validateDepositHash,findRecentDeposit,txHashOk,sendViaInjectedProvider,
  inspectMttRecipient,checkPilotSlot} from '../docs/assets/pilot-status.js';

const H='0x'+'a'.repeat(64);
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const log={
 address:PILOT.usdtBsc,
 topics:[topic,topicAddress(PILOT.sender),topicAddress(PILOT.central)],
 data:'0x'+(10n**18n).toString(16)
};
const receipt={transactionHash:H,status:'0x1',blockNumber:'0x'+(PILOT.activationBlock+20).toString(16),logs:[log]};
const tx={hash:H,from:PILOT.sender,to:PILOT.usdtBsc,input:directTransferData()};
const block='0x'+(PILOT.activationBlock+28).toString(16);
function mockRpc(map){
 return async (url,request)=>{
  const method=JSON.parse(request.body).method;
  return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:map[method]})};
 };
}

test('signed customer direct transfer of exactly 1 USDT is accepted after six confirmations',()=>{
 const result=validateDeposit(tx,receipt,PILOT.activationBlock+28);
 assert.equal(result.confirmed,true);
 assert.equal(result.confirmations,9);
 assert.equal(result.hash,H);
});
test('wrong amount, recipient, smart wallet relayer and pre-activation deposit are rejected',()=>{
 const h=PILOT.activationBlock;
 assert.throws(()=>validateDeposit(tx,{...receipt,logs:[{...log,data:'0x'+(15n*10n**17n).toString(16)}]},h+30),/1 USDT/);
 assert.throws(()=>validateDeposit({...tx,from:PILOT.central},receipt,h+30),/напрямую/);
 assert.throws(()=>validateDeposit({...tx,input:'0x1234'},receipt,h+30),/USDT.transfer/);
 assert.throws(()=>validateDeposit(tx,{...receipt,blockNumber:'0x'+h.toString(16)},h+30),/до активации/);
 assert.equal(txHashOk('0x1'),false);
});
test('BSC hash lookup verifies real transaction and gets creation timestamp',async()=>{
 const requestMap={
  eth_getTransactionByHash:tx,
  eth_getTransactionReceipt:receipt,
  eth_blockNumber:block,
  eth_getBlockByNumber:{timestamp:'0x65f1a2b3'}
 };
 const data=await validateDepositHash(H,{fetcher:mockRpc(requestMap)});
 assert.equal(data.confirmed,true);
 assert.equal(data.timestamp,0x65f1a2b3);
});
test('recent deposit scan requires exact from/to/topics and amount',async()=>{
 let getLogs=0;
 const fetcher=async(url,request)=>{
  const {method}=JSON.parse(request.body);
  const values={
   eth_blockNumber:'0x'+(PILOT.activationBlock+30).toString(16),
   eth_getLogs:[{...log,blockNumber:'0x'+(PILOT.activationBlock+20).toString(16),transactionHash:H}],
   eth_getTransactionByHash:tx,
   eth_getTransactionReceipt:receipt,
   eth_getBlockByNumber:{timestamp:'0x65f1a2b3'}
  };
  return {ok:true,json:async()=>({result:values[method]})};
 };
 const result=await findRecentDeposit({fetcher});
 assert.equal(result.hash,H);
});
test('wallet sends only from registered sender and only on BSC chain',async()=>{
 const calls=[];
 const wallet={request:async ({method,params})=>{
  calls.push(method);
  if(method==='eth_requestAccounts')return [PILOT.sender];
  if(method==='eth_chainId')return '0x38';
  if(method==='eth_sendTransaction'){
   assert.equal(params[0].to,PILOT.usdtBsc);
   assert.equal(params[0].data,directTransferData());
   return H;
  }
 }};
 assert.equal(await sendViaInjectedProvider(wallet),H);
 assert.deepEqual(calls,['eth_requestAccounts','eth_chainId','eth_sendTransaction']);
 await assert.rejects(()=>sendViaInjectedProvider({request:async()=>[PILOT.central]}),/другой/);
});
test('MTT payout evidence requires central sender, client recipient, and later timestamp',async()=>{
 const timestamp='2026-11-10T16:59:00Z';
 const payment={hash:H,from:{hash:PILOT.central},to:{hash:PILOT.sender},
   value:(35000n*10n**18n).toString(),status:'ok',timestamp};
 const fetcher=async (url,request)=>{
  if(request.method==='GET')return {ok:true,json:async()=>({items:[payment]})};
  const {method}=JSON.parse(request.body);
  return {ok:true,json:async()=>({result:method==='eth_chainId'?'0x1ae0':'0x0'})};
 };
 const before=await inspectMttRecipient({fetcher,since:Date.parse(timestamp)/1000-60});
 assert.equal(before.payout.hash,H);
 const after=await inspectMttRecipient({fetcher,since:Date.parse(timestamp)/1000+60});
 assert.equal(after.payout,null);
});

test('pilot slot blocks a second USDT transfer and expires safely',async()=>{
  const before=Date.parse(PILOT.expiresAt)-3600000;
  const fetcher=async(url,request)=>{
    const {method}=JSON.parse(request.body);
    return {ok:true,json:async()=>({result:method==='eth_blockNumber'
      ?'0x'+(PILOT.activationBlock+26).toString(16):[]})};
  };
  assert.equal((await checkPilotSlot({fetcher,now:before})).available,true);
  const existing=async(url,request)=>{
    const {method}=JSON.parse(request.body);
    return {ok:true,json:async()=>({result:method==='eth_blockNumber'
      ?'0x'+(PILOT.activationBlock+26).toString(16):[log]})};
  };
  assert.equal((await checkPilotSlot({fetcher:existing,now:before})).available,false);
  assert.equal((await checkPilotSlot({fetcher,now:Date.parse(PILOT.expiresAt)+1})).available,false);
});
