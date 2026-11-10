import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp,verifyTelegramInitData} from '../src/server.mjs';
const TOKEN='test:local-only-not-a-real-secret';
const now=1750000100;
function signed(data){
 const check=Object.entries(data).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=createHmac('sha256','WebAppData').update(TOKEN).digest();
 const hash=createHmac('sha256',secret).update(check).digest('hex');
 return new URLSearchParams({...data,hash}).toString();
}
test('Telegram initData checks HMAC and expiry',()=>{
 const valid=signed({auth_date:String(now-50),query_id:'AAEE',user:'{"id":123}'});
 assert.equal(verifyTelegramInitData(valid,TOKEN,now),true);
 assert.equal(verifyTelegramInitData(valid+'x',TOKEN,now),false);
 const old=signed({auth_date:String(now-8000)});
 assert.equal(verifyTelegramInitData(old,TOKEN,now),false);
});
test('duplicate Telegram parameters are rejected',()=>{
 const value=signed({auth_date:String(now)});
 assert.equal(verifyTelegramInitData(value+'&auth_date='+now,TOKEN,now),false);
});
test('sandbox endpoint exposes no real executable operations',async()=>{
 const server=createApp();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const health=await fetch(base+'/api/health');
  assert.equal(health.status,200);
  assert.equal((await health.json()).mode,'sandbox');
  const status=await fetch(base+'/api/execute',{method:'POST'});
  assert.equal(status.status,404);
  const webhook=await fetch(base+'/api/telegram/webhook',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'
  });
  assert.equal(webhook.status,503);
  const home=await fetch(base+'/');
  assert.equal(home.status,200);
  assert.match(await home.text(),/MTT EXCHANGE/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
