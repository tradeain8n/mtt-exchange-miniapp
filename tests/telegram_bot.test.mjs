
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWebhookSecret,buildBotMessage,processBotUpdate,MINIAPP_URL} from '../src/telegram_bot.mjs';

const token='8456005459:THIS_IS_ONLY_A_SYNTHETIC_TEST_SECRET_12345';
const update=(text,chatType='private')=>({
  update_id:108,message:{chat:{id:123456,type:chatType},text}
});

test('Telegram webhook secret check is strict',()=>{
  assert.equal(validateWebhookSecret('test-secret','test-secret'),true);
  assert.equal(validateWebhookSecret('invalid','test-secret'),false);
  assert.equal(validateWebhookSecret(undefined,'test-secret'),false);
  assert.equal(validateWebhookSecret('',''),false);
});

test('/start and /help produce a sandbox Mini App inline keyboard',()=>{
  for(const command of ['/start','/help','/start@babymttbot']){
    const msg=buildBotMessage(update(command));
    assert.equal(msg.chat_id,123456);
    assert.match(msg.text,/sandbox|тестовый|демо/i);
    assert.equal(msg.reply_markup.inline_keyboard[0][0].web_app.url,MINIAPP_URL);
  }
});
test('group chat and unrelated updates are ignored',()=>{
  assert.equal(buildBotMessage(update('/start','supergroup')),null);
  assert.equal(buildBotMessage(update('/balance')),null);
  assert.equal(buildBotMessage({update_id:123}),null);
  assert.equal(buildBotMessage({message:update('/start').message}),null);
});

test('approved private /start sends exactly one sanitized Telegram API call',async()=>{
  const posts=[];
  const mockFetch=async (url,request)=>{
    posts.push({url,request});
    return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};
  };
  const result=await processBotUpdate(update('/start'),{token,post:mockFetch});
  assert.deepEqual(result,{handled:true});
  assert.equal(posts.length,1);
  assert.match(posts[0].url,/\/sendMessage$/);
  const body=JSON.parse(posts[0].request.body);
  assert.equal(body.chat_id,123456);
  assert.equal(body.reply_markup.inline_keyboard[0][0].web_app.url,MINIAPP_URL);
});

test('unsupported content causes no Telegram API calls',async()=>{
  let called=false;
  const result=await processBotUpdate(update('ordinary chat'),{
    token,post:async()=>{called=true;throw Error('unexpected')}
  });
  assert.equal(result.handled,false);
  assert.equal(called,false);
});
