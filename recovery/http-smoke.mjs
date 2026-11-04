// Reconstructed runtime verification. Requires a disposable database named recovery_*.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const postgresModule=require('postgres'),postgres=postgresModule.default??postgresModule;
let input='';for await(const part of process.stdin)input+=part;
const {uri}=JSON.parse(input);assert.match(new URL(uri).pathname,/^\/recovery_[a-z0-9_]+$/);
const sql=postgres(uri,{max:1,prepare:false});
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const address=socket.address();assert.ok(address&&typeof address==='object');const port=address.port;
await new Promise(resolve=>socket.close(resolve));
const origin=`http://127.0.0.1:${port}`,restaurant=crypto.randomUUID(),name='Recovery HTTP Fixture';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const password=crypto.randomBytes(24).toString('hex');
const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:uri,DIRECT_DATABASE_URL:uri,RESTAURANT_ID:restaurant,PUBLIC_APP_URL:origin,STAFF_SESSION_SECRET:crypto.randomBytes(48).toString('hex'),DEMO_STAFF_USERNAME:'recovery',DEMO_STAFF_PASSWORD:password,TELNYX_PUBLIC_KEY:publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'),RELAY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false'};
for(const key of Object.keys(env))if(/^(AI_|TELNYX_API_KEY$|STRIPE_|XI_)/.test(key))delete env[key];
const child=spawn(process.execPath,[fileURLToPath(new URL('../frontend/node_modules/next/dist/bin/next',import.meta.url)),'start','-p',String(port),'-H','127.0.0.1'],{cwd:fileURLToPath(new URL('../frontend/',import.meta.url)),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let serverLog='';child.stdout.on('data',b=>{serverLog+=b;});child.stderr.on('data',b=>{serverLog+=b;});
try{
 await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${restaurant},${name},825)`;
 await sql`INSERT INTO menu_items(restaurant_id,name,category,price_cents,stock_qty,item_number) VALUES(${restaurant},'Classic Burger','Mains',1299,10,1),(${restaurant},'French Fries','Sides',499,10,2)`;
 let ready=false;for(let i=0;i<120;i++){
  try{if((await fetch(origin+'/api/orders',{redirect:'manual',signal:AbortSignal.timeout(1000)})).status===401){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.equal(ready,true,'Local server did not start');
 const statuses={};
 statuses.ordersUnauthenticated=(await fetch(origin+'/api/orders')).status;assert.equal(statuses.ordersUnauthenticated,401);
 statuses.relayUnauthenticated=(await fetch(origin+'/api/relay/action',{method:'POST',body:'{}'})).status;assert.equal(statuses.relayUnauthenticated,401);
 statuses.voiceUnsigned=(await fetch(origin+'/api/telnyx/voice',{method:'POST',body:'CallSid=unsigned'})).status;assert.equal(statuses.voiceUnsigned,401);
 statuses.loginForeignOrigin=(await fetch(origin+'/api/login',{method:'POST',headers:{Origin:'https://foreign.example.test','Content-Type':'application/json'},body:'{}'})).status;assert.equal(statuses.loginForeignOrigin,403);
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'recovery',password}),redirect:'manual'});
 statuses.login=login.status;assert.equal(login.status,303);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const call='http-recovery-'+crypto.randomUUID();
 async function signed(path,fields){
  const body=new URLSearchParams({CallSid:call,From:'+12025550123',...fields}).toString(),timestamp=String(Math.floor(Date.now()/1000));
  const signature=crypto.sign(null,Buffer.from(`${timestamp}|${body}`),privateKey).toString('base64');
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','telnyx-signature-ed25519':signature,'telnyx-timestamp':timestamp},body});
  assert.equal(response.status,200,`Local ${path} failed`);return response.text();
 }
 await signed('/api/telnyx/voice',{});
 let turn=0;
 for(const speech of ['add Classic Burger','add French Fries','done','Recovery Fixture','yes','cash','none','no notes'])await signed('/api/telnyx/gather?turn='+turn++,{SpeechResult:speech});
 const board=async()=>{const response=await fetch(origin+'/api/orders',{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json();};
 assert.equal((await board()).length,0);
 const replies=await Promise.all([0,1,2].map(()=>signed('/api/telnyx/gather?turn='+turn,{SpeechResult:'confirm'})));
 assert.equal(new Set(replies).size,1);const orders=await board();assert.equal(orders.length,1);assert.equal(orders[0].items.length,2);assert.equal(orders[0].totalCents,1946);
 const stocks=await sql`SELECT stock_qty FROM menu_items WHERE restaurant_id=${restaurant}`;assert.deepEqual(stocks.map(r=>r.stock_qty),[9,9]);
 const health=await fetch(origin+'/api/health');const healthBody=await health.json();assert.equal(health.status,503);assert.equal(healthBody.databaseReady,true);assert.equal(healthBody.restaurantReady,true);
 console.log(JSON.stringify({ok:true,statuses,signedVoiceAndGather:true,concurrentConfirmationCopies:3,ordersCreated:1,distinctItems:2,totalCents:1946,stockReservedOnce:true,health:{status:health.status,databaseReady:healthBody.databaseReady,restaurantReady:healthBody.restaurantReady,providerCredentialsConfigured:false}}));
}catch(error){
 console.error('Local recovery smoke verification failed:',error.message);
 console.error(serverLog.replaceAll(uri,'[redacted database URL]').replaceAll(password,'[redacted test password]').slice(-6000));
 process.exitCode=1;
}finally{
 child.kill();await sql.end();
}
