import {createServer} from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SNAPSHOT,calculateQuote,parseUsdt,formatWei} from '../docs/assets/quote.js';
import {validateWebhookSecret,processBotUpdate} from './telegram_bot.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../docs');
const ORIGIN=process.env.APP_ORIGIN||'https://tradeain8n.github.io';
const TOKEN=process.env.TELEGRAM_BOT_TOKEN||'';
const RPC=process.env.MTT_RPC_URL||'https://evm-rpc.mtt.network/';
const PAIR='0xd177f36436C7C85E4a0bBEcF10A3A331E97Dd4c0';
const USDT='0x78a39b9101983D2009Ff14773E8e47Ca3a23BBfD';
const WMTT='0xD0CA95e52995F55e62A1670E16A13DAdb76379A9';
const TYPE={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.json':'application/json;charset=utf-8','.webmanifest':'application/manifest+json'};
const LIMIT=8*1024;let lastPool=null;
export function verifyTelegramInitData(input,botToken,now=Math.floor(Date.now()/1000)){
  if(!botToken||typeof input!=='string'||input.length>4096)return false;
  const params=new URLSearchParams(input);
  const provided=params.get('hash'),timestamp=Number(params.get('auth_date'));
  if(!provided||!/^[0-9a-f]{64}$/i.test(provided)||!Number.isInteger(timestamp)||now-timestamp>3600||timestamp-now>60)return false;
  params.delete('hash');
  // Validate duplicate parameters rather than silently normalizing them.
  const unique=new Set();
  for(const [key] of params){if(unique.has(key))return false;unique.add(key)}
  const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();
  const expected=createHmac('sha256',secret).update(dataCheck).digest();
  const actual=Buffer.from(provided,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
async function rpc(method,params=[]){
  const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',method,params,id:1}),signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('RPC_HTTP_'+response.status);
  const payload=await response.json();
  if(payload.error||!payload.result)throw Error('RPC_ERROR');
  return payload.result;
}
const balancePayload=owner=>'0x70a08231'+owner.slice(2).toLowerCase().padStart(64,'0');
export async function reserves(){
  if(lastPool&&Date.now()-lastPool.at<25000)return lastPool.data;
  const chain=await rpc('eth_chainId');
  if(BigInt(chain)!==6880n)throw Error('WRONG_CHAIN');
  const [block,usdt,wmtt]=await Promise.all([
    rpc('eth_blockNumber'),rpc('eth_call',[{to:USDT,data:balancePayload(PAIR)},'latest']),
    rpc('eth_call',[{to:WMTT,data:balancePayload(PAIR)},'latest'])]);
  const data={usdtWei:BigInt(usdt),wmttWei:BigInt(wmtt),
    botFeeBps:0n,poolFeeBps:250n,block:Number(BigInt(block))};
  if(data.usdtWei<=0n||data.wmttWei<=0n)throw Error('EMPTY_RESERVES');
  lastPool={at:Date.now(),data};return data;
}
function json(res,status,obj,origin){
  res.writeHead(status,{'content-type':'application/json;charset=utf-8','cache-control':'no-store',
    'access-control-allow-origin':origin===ORIGIN?ORIGIN:'null','vary':'origin','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(obj));
}
async function readBody(req){
  let text='';
  for await(const chunk of req){
    text+=chunk.toString('utf8');
    if(text.length>LIMIT)throw Error('Request body too large');
  }
  return JSON.parse(text);
}
async function route(req,res){
  const origin=req.headers.origin||'';
  const url=new URL(req.url||'/', 'http://localhost');
  if(url.pathname==='/api/telegram/webhook'){
    if(req.method!=='POST'){res.writeHead(405);return res.end()}
    const secret=process.env.TELEGRAM_WEBHOOK_SECRET||'';
    if(!TOKEN||!secret)return json(res,503,{ok:false,error:'webhook_not_configured'},origin);
    if(!validateWebhookSecret(req.headers['x-telegram-bot-api-secret-token'],secret)){
      return json(res,401,{ok:false,error:'webhook_unauthorized'},origin);
    }
    let update;
    try{update=await readBody(req);}catch{
      return json(res,400,{ok:false,error:'invalid_json'},origin);
    }
    const answer=await processBotUpdate(update,{token:TOKEN});
    return json(res,200,{ok:true,handled:answer.handled},origin);
  }
  if(url.pathname.startsWith('/api/')){
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'access-control-allow-origin':origin===ORIGIN?ORIGIN:'null',
        'access-control-allow-methods':'GET, POST, OPTIONS',
        'access-control-allow-headers':'content-type','vary':'origin'});return res.end();
    }
    if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,mode:'sandbox',version:'0.1.0'},origin);
    if(url.pathname==='/api/quote'&&req.method==='GET'){
      try{
        const amount=parseUsdt(url.searchParams.get('amount')||'1');
        let pool=SNAPSHOT,source='snapshot';
        try{pool=await reserves();source='mtt_direct_pool_reserves';}catch{}
        const q=calculateQuote(amount,pool);
        return json(res,200,{ok:true,quote:{
          amount_in:formatWei(q.amountIn,4),amount_out:formatWei(q.amountOut,4),
          impact_bps:Number(q.impactBps),block:q.block,source,
          simulation_only:true,expires_at:null
        },warning:'No transactions can be executed by this MVP'},origin);
      }catch(err){return json(res,400,{ok:false,error:String(err.message).slice(0,100)},origin)}
    }
    if(url.pathname==='/api/session'&&req.method==='POST'){
      if(origin!==ORIGIN)return json(res,403,{ok:false,error:'origin_denied'},origin);
      try{
        const data=await readBody(req);
        if(!TOKEN)return json(res,503,{ok:false,error:'bot_token_not_configured'},origin);
        if(!verifyTelegramInitData(data.initData,TOKEN))return json(res,401,{ok:false,error:'telegram_initdata_invalid'},origin);
        return json(res,200,{ok:true,authenticated:true},origin);
      }catch{return json(res,400,{ok:false,error:'invalid_request'},origin)}
    }
    return json(res,404,{ok:false,error:'unknown_endpoint'},origin);
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end()}
  let pathname;
  try{pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end()}
  if(pathname==='/'||pathname==='/index.html')pathname='/index.html';
  if(pathname.includes('\0')||pathname.split('/').some(s=>s==='..'||s.startsWith('.'))){
    res.writeHead(403);return res.end();
  }
  const file=path.resolve(publicRoot,'.'+pathname);
  if(file!==publicRoot&&!file.startsWith(publicRoot+path.sep)){res.writeHead(403);return res.end()}
  try{
    if(!(await stat(file)).isFile())throw Error('not-file');
    const body=await readFile(file);
    res.writeHead(200,{'content-type':TYPE[path.extname(file)]||'application/octet-stream',
      'x-content-type-options':'nosniff','cache-control':'public,max-age=90'});
    if(req.method==='HEAD')res.end();else res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
}
export function createApp(){return createServer((req,res)=>route(req,res).catch(()=>json(res,500,{ok:false,error:'internal_error'},req.headers.origin||'')))}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8787);
  createApp().listen(port,'0.0.0.0',()=>console.log('MTT Exchange sandbox http://localhost:'+port));
}
