const token=process.env.TELEGRAM_BOT_TOKEN;
const appUrl=process.env.MINIAPP_URL||'https://tradeain8n.github.io/mtt-exchange-miniapp/';
const expectedId=8456005459;
if(!token)throw Error('TELEGRAM_BOT_TOKEN GitHub Secret is missing');
if(!appUrl.startsWith('https://'))throw Error('Telegram Mini App requires HTTPS');
if(new URL(appUrl).hostname!=='tradeain8n.github.io')throw Error('Unexpected Mini App host');
async function api(method,body){
  const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  const data=await r.json();
  if(!data.ok)throw Error('Telegram method '+method+' failed: '+String(data.description).slice(0,100));
  return data.result;
}
const me=await api('getMe',{});
if(me.id!==expectedId)throw Error('The secret belongs to the wrong Telegram bot');
await api('setChatMenuButton',{menu_button:{
  type:'web_app',text:'Тест 1 USDT',web_app:{url:appUrl}
}});
await api('setMyCommands',{commands:[
  {command:'start',description:'Открыть MTT Exchange'},
  {command:'help',description:'Как работает автоматический обмен'}
]});
await api('setMyShortDescription',{short_description:
  'MTT Exchange 💱 — демо обмена USDT (BSC) на MTT Network в Telegram.'});
await api('setMyDescription',{description:
  'MTT Exchange — Telegram Mini App для автоматического обмена USDT (BSC) → MTT Network. Открыт одноразовый пилот на 1 USDT для зарегистрированного адреса: прямой BSC Transfer, Bridge, Router и выплата MTT. Остальные суммы не обрабатываются автоматически.'});
const menu=await api('getChatMenuButton',{});
const commands=await api('getMyCommands',{});
const webhook=await api('getWebhookInfo',{});
if(menu.type!=='web_app'||menu.web_app?.url!==appUrl){
  throw Error('Telegram menu configuration could not be verified');
}
if(!commands.some(x=>x.command==='start')||!commands.some(x=>x.command==='help')){
  throw Error('Telegram commands were not saved');
}
console.log('BOT_MENU_VERIFIED',JSON.stringify({
  bot_id:me.id,username:me.username,
  menu_url:menu.web_app.url,
  commands:commands.map(x=>x.command),
  webhook_configured:Boolean(webhook.url)
}));
