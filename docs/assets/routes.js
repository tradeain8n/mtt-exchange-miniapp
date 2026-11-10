// Funding routes are deliberately separate from settlement capability.
// No Polygon deposit address or payment permissions are exposed until a verified processor exists.
export const ROUTES=Object.freeze({
 'bsc-usdt':Object.freeze({
  chainId:56,symbol:'USDT',decimals:18,
  contract:'0x55d398326f99059fF775485246999027B3197955',liveFlow:true
 }),
 'polygon-usdc':Object.freeze({
  chainId:137,symbol:'USDC',decimals:6,
  contract:'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  bridgedContract:'0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  liveFlow:false
 })
});

export function classifyPolygonUsdc(contract){
 if(typeof contract!=='string')return 'unsupported';
 const address=contract.toLowerCase();
 if(address===ROUTES['polygon-usdc'].contract.toLowerCase())return 'native';
 if(address===ROUTES['polygon-usdc'].bridgedContract.toLowerCase())return 'bridged';
 return 'unsupported';
}

export function routeCanAccept(key,health){
 const route=ROUTES[key];
 if(!route?.liveFlow||health?.ok!==true||health.accepting!==true)return false;
 if(health.chainId!==route.chainId||
  typeof health.usdtContract!=='string'||
  health.usdtContract.toLowerCase()!==route.contract.toLowerCase())return false;
 return typeof health.central==='string'&&/^0x[0-9a-f]{40}$/i.test(health.central);
}
