const token=process.env.TELEGRAM_BOT_TOKEN||'';
const secret=process.env.TELEGRAM_WEBHOOK_SECRET||'';
const webhookUrl=process.env.BOT_WEBHOOK_URL||'';
if(!token.startsWith('8456005459:'))throw Error('Wrong or missing Telegram bot token');
if(!/^[A-Za-z0-9_-]{16,256}$/.test(secret))throw Error('Invalid webhook secret');
let url;
try{url=new URL(webhookUrl);}catch{throw Error('Missing valid BOT_WEBHOOK_URL')}
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   !url.pathname.endsWith('/api/telegram/webhook')||
   url.hostname.endsWith('github.io')||url.hostname==='localhost'){
  throw Error('Webhook must be an HTTPS backend endpoint, not GitHub Pages');
}
async function method(name,payload){
  const response=await fetch('https://api.telegram.org/bot'+token+'/'+name,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error(name+' HTTP error');
  const data=await response.json();
  if(data.ok!==true)throw Error(name+' rejected');
  return data.result;
}
const me=await method('getMe',{});
if(me.id!==8456005459)throw Error('Unexpected bot ID');
await method('setWebhook',{url:url.href,secret_token:secret,allowed_updates:['message'],drop_pending_updates:false});
const result=await method('getWebhookInfo',{});
if(result.url!==url.href)throw Error('Webhook verification failed');
console.log('TELEGRAM_WEBHOOK_VERIFIED',JSON.stringify({bot_id:me.id,host:url.hostname,active:true}));
