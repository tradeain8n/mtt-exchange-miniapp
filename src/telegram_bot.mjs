import {timingSafeEqual} from 'node:crypto';

export const MINIAPP_URL='https://tradeain8n.github.io/mtt-exchange-miniapp/';
const BOT_ID=8456005459;

export function validateWebhookSecret(actual, expected){
  if(typeof actual!=='string'||typeof expected!=='string'||!expected||expected.length>256)return false;
  const got=Buffer.from(actual,'utf8');
  const want=Buffer.from(expected,'utf8');
  return got.length===want.length&&timingSafeEqual(got,want);
}

export function buildBotMessage(update){
  if(!update||!Number.isSafeInteger(update.update_id)||!update.message)return null;
  const message=update.message;
  if(message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id))return null;
  const command=typeof message.text==='string' ? message.text.trim().split(/\s+/)[0].toLowerCase():'';
  if(!/^\/(start|help)(?:@[a-z0-9_]+)?$/.test(command))return null;
  const isHelp=command.startsWith('/help');
  return {
    chat_id:message.chat.id,
    text:isHelp
      ? 'MTT Exchange — демо автоматического обмена USDT (BSC) → MTT Network.\n\nСейчас это тестовый интерфейс: реальные депозиты и выплаты отключены. Используйте кнопку ниже, чтобы попробовать калькулятор и симуляцию.'
      : 'MTT Exchange 💱\n\nОткройте Mini App для расчёта USDT → MTT и демонстрации беззаявочного обмена.\n\n⚠️ Сейчас доступен только sandbox, реальные средства не отправляйте.',
    reply_markup:{inline_keyboard:[[{
      text:'Открыть MTT Exchange',
      web_app:{url:MINIAPP_URL}
    }]]},
    disable_web_page_preview:true
  };
}

export async function processBotUpdate(update,{token,post=fetch}={}){
  if(typeof token!=='string'||!token.startsWith(BOT_ID+':'))throw Error('Expected Telegram bot token is missing');
  const reply=buildBotMessage(update);
  if(!reply)return {handled:false};
  const response=await post('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(reply),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('Telegram message HTTP failure');
  const data=await response.json();
  if(data.ok!==true)throw Error('Telegram message rejected');
  return {handled:true};
}
