// Local production-build browser test with synthetic signed Telnyx events.
// The provider adapter is mocked only in this process. No deployed webhook or
// real provider receives these events. This is NOT provider acceptance.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const privateState=JSON.parse(readFileSync(path.join(process.env.TEMP!,'restaurant-phase6-private.json'),'utf8'));
assert.equal(privateState.disposableConfirmed,true);assert.equal(privateState.branchId,'br-misty-shadow-b8v5hmz2');
assert.match(new URL(privateState.uri).pathname,/^\/recovery_phase6_/);
const base='http://localhost:3238',evidence=path.resolve('../docs/telephone/evidence');
for(const k of ['AI_API_KEY','DEEPSEEK_API_KEY','XI_API_KEY','ELEVENLABS_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','TELNYX_TEXML_APPLICATION_ID','TELNYX_MESSAGING_PROFILE_ID'])process.env[k]='';
const keys=crypto.generateKeyPairSync('ed25519');
Object.assign(process.env,{
 NODE_ENV:'test',VERCEL_ENV:'preview',VERCEL_URL:'',DATABASE_URL:privateState.uri,DIRECT_DATABASE_URL:privateState.uri,
 RESTAURANT_ID:crypto.randomUUID(),STAFF_SESSION_SECRET:crypto.randomBytes(32).toString('hex'),
 DEMO_STAFF_USERNAME:'telephone-fixture',DEMO_STAFF_PASSWORD:crypto.randomBytes(24).toString('hex'),
 PUBLIC_APP_URL:base,AI_FALLBACK_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RELAY_ENABLED:'false',
 ELEVENLABS_WEBHOOKS_ENABLED:'true',ELEVENLABS_CHECKOUT_ENABLED:'true',ELEVENLABS_SESSION_BINDING_ENABLED:'true',
 RESTAURANT_ORDERING_ENABLED:'true',CASH_ONLY_CHECKOUT_ENABLED:'true',TELNYX_VOICE_CONFIRMATION_ENABLED:'true',
 ELEVENLABS_AGENT_ID:'agent_telephone_browser',ELEVENLABS_INBOUND_NUMBER:'+12025550101',ELEVENLABS_ACCEPTANCE_CALLERS:'+12025550123',
 ELEVENLABS_TOOL_API_KEY:crypto.randomBytes(32).toString('hex'),ELEVENLABS_SESSION_BINDING_KEY:crypto.randomBytes(32).toString('hex'),CUSTOMER_CHECKOUT_SECRET:crypto.randomBytes(32).toString('hex'),
 TELNYX_CONFIRMATION_APPLICATION_ID:'synthetic-browser-app',TELNYX_CONFIRMATION_DESTINATION:'+12025550110',TELNYX_CONFIRMATION_SIP_URI:'sip:confirmation@example.test',
 TELNYX_PUBLIC_KEY:keys.publicKey.export({format:'pem',type:'spki'}).toString(),TELNYX_API_KEY:'synthetic-never-use-at-provider',TELNYX_PHONE_NUMBER:'+12025550101'
});
const {client}=await import('../../frontend/lib/db/client');const sql=client();
const restaurant=process.env.RESTAURANT_ID!,item=crypto.randomUUID();
await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${restaurant},'Telephone browser synthetic — DO NOT PREPARE',825)`;
await sql`INSERT INTO menu_items(id,restaurant_id,name,category,item_number,price_cents,stock_qty) VALUES(${item},${restaurant},'Classic Burger','Mains',1,1000,20)`;
const serverLog=createWriteStream(path.join(evidence,'browser-server.log'));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3238','-H','localhost'],{env:{...process.env,NODE_ENV:'production'},windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout!.pipe(serverLog);server.stderr!.pipe(serverLog);
const result:any={source:'Playwright Chromium; local Next production build; disposable Neon',base,branch:privateState.branchId,syntheticProviderEvents:true,realProviderAcceptance:false,providerTraffic:false,checks:[],errors:[]};
const check=(s:string)=>{result.checks.push(s);console.log('PASS',s);};
const require=createRequire(import.meta.url);const {chromium}=require(path.join(process.env.USERPROFILE!,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
let browser:any,page:any;
try{
 for(let i=0;i<90;i++){try{if((await fetch(base+'/api/orders')).status===401)break;}catch{}if(i===89)throw Error('Local build did not start');await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true,executablePath:path.join(process.env.LOCALAPPDATA!,'ms-playwright/chromium-1248/chrome-win64/chrome.exe')});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',(e:any)=>result.errors.push(e.message));
 await page.goto(base+'/dashboard');await page.waitForURL('**/login');
 await page.getByLabel('Username',{exact:true}).fill(process.env.DEMO_STAFF_USERNAME);await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_STAFF_PASSWORD);await page.getByRole('button',{name:'Sign in to your workspace'}).click();await page.waitForURL('**/dashboard');
 await page.getByRole('heading',{name:'Kitchen overview'}).waitFor();check('protected dashboard and real staff login');
 const conversation='conv_browser'+crypto.randomBytes(12).toString('hex');
 const init=await fetch(base+'/api/elevenlabs/initiation',{method:'POST',headers:{authorization:'Bearer '+process.env.ELEVENLABS_SESSION_BINDING_KEY,'content-type':'application/json'},body:JSON.stringify({conversation_id:conversation,agent_id:process.env.ELEVENLABS_AGENT_ID,caller_id:'+12025550123',called_number:'+12025550101',call_sid:'sip-browser-'+crypto.randomUUID()})});assert.equal(init.status,200);const variables=(await init.json()).dynamic_variables;
 const tool=async(input:any)=>{const r=await fetch(base+'/api/elevenlabs/tools',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.ELEVENLABS_TOOL_API_KEY,'x-restaurant-session':variables.secret__restaurant_session},body:JSON.stringify({...input,conversation_id:conversation})});assert.equal(r.status,200);return r.json();};
 assert.equal((await tool({tool:'search_menu',query:'Burger'})).matches[0].id,item);
 await tool({tool:'update_cart',operation:'set',item_id:item,quantity:1});await tool({tool:'set_customer_details',customer_name:'Telephone Browser',name_confirmed:true});await tool({tool:'set_order_notes',notes:'No onions; sauce on side'});await tool({tool:'set_notification_preference',channel:'call',consent:true});
 const prepared=await tool({tool:'confirm_order'});assert.equal(prepared.code,'TELEPHONE_TRANSFER_REQUIRED');assert.equal(prepared.orderCreated,false);check('authenticated Brittany tools prepare immutable review without placing an order');
 // Browser sees an empty kitchen until independent test-customer confirmation.
 assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE restaurant_id=${restaurant}`)[0].n,0);
 const {POST}=await import('../../frontend/app/api/telnyx/phone-checkout/route');
 const commands:any[]=[],realFetch=global.fetch;
 const identity={call_control_id:'v3:browser-'+crypto.randomUUID(),call_leg_id:crypto.randomUUID(),call_session_id:crypto.randomUUID(),connection_id:process.env.TELNYX_CONFIRMATION_APPLICATION_ID};
 const send=async(event_type:string,payload:any={})=>{
  const raw=JSON.stringify({data:{id:crypto.randomUUID(),event_type,occurred_at:new Date().toISOString(),payload:{...identity,...payload}}}),time=String(Math.floor(Date.now()/1000));
  const signature=crypto.sign(null,Buffer.from(time+'|'+raw),keys.privateKey).toString('base64');
  const r=await POST(new Request(base+'/api/telnyx/phone-checkout',{method:'POST',headers:{'telnyx-signature-ed25519':signature,'telnyx-timestamp':time},body:raw}));assert.equal(r.status,200);return r.json();
 };
 let saved:any;
 global.fetch=async(input,init)=>{assert.match(String(input),/^https:\/\/api\.telnyx\.com\/v2\/calls\//);commands.push({path:String(input),body:JSON.parse(String(init?.body))});return Response.json({data:{result:'ok'}});};
 try{
  await send('call.initiated',{from:'+12025550123',to:'+12025550110',direction:'incoming',custom_headers:[{name:'X-Conversation-ID',value:conversation},{name:'X-Restaurant-Handoff',value:variables.secret__restaurant_handoff}]});await send('call.answered');assert.ok(commands.at(-1).path.endsWith('/speak'));assert.match(commands.at(-1).body.payload,/Final total \$10\.82/);
  await send('call.speak.ended',{status:'completed',client_state:commands.at(-1).body.client_state});assert.ok(commands.at(-1).path.endsWith('/speak'));
  await send('call.speak.ended',{status:'completed',client_state:commands.at(-1).body.client_state});assert.ok(commands.at(-1).path.endsWith('/gather'));
  saved=await send('call.gather.ended',{status:'valid',digits:'1',client_state:commands.at(-1).body.client_state});assert.ok(saved.orderId);
  assert.ok(commands.at(-1).body.payload.includes(saved.orderNumber.split('').join(' ')));
  await send('call.speak.ended',{status:'completed',client_state:commands.at(-1).body.client_state});assert.ok(commands.at(-1).path.endsWith('/hangup'));
 }finally{global.fetch=realFetch;}
 check('local signed contract: complete review, separate instruction, valid DTMF, atomic save and saved-number receipt');
 const ticket=page.locator('article.order').filter({hasText:'Telephone Browser'});await ticket.waitFor({timeout:25000});await ticket.getByText('No onions; sauce on side').waitFor();
 assert.ok((await ticket.innerText()).includes(saved.orderNumber));assert.ok((await ticket.innerText()).includes('$10.82'));await page.screenshot({path:path.join(evidence,'dashboard-telephone-order.png'),fullPage:true});check('dashboard polling displays actual telephone order number, authoritative total and notes');
 await ticket.getByRole('button',{name:'Start preparing'}).click();await ticket.getByRole('button',{name:'Mark ready for pickup'}).click();
 assert.equal((await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${saved.orderId}`)[0].n,0);
 await ticket.getByRole('button',{name:'Complete pickup'}).click();await page.getByRole('button',{name:/All orders/}).click();await ticket.getByText('Completed',{exact:true}).waitFor();
 const [order]=await sql`SELECT * FROM orders WHERE id=${saved.orderId}`;assert.equal(order.payment_status,'unpaid');assert.equal(order.payment_method,'cash');
 const [jobs]=await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${saved.orderId} AND kind='completed' AND channel='call' AND provider_id IS NULL`;assert.equal(jobs.n,1);
 assert.equal((await sql`SELECT count(*)::int AS n FROM payment_jobs WHERE order_id=${saved.orderId}`)[0].n,0);check('kitchen completes same cash-unpaid order; exactly one consented completion callback queued without submission');
 assert.deepEqual(result.errors,[]);result.orderNumber=saved.orderNumber;result.ok=true;
}catch(e){result.ok=false;result.error=e instanceof Error?e.message:String(e);process.exitCode=1;console.error(result.error);if(page)await page.screenshot({path:path.join(evidence,'browser-failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser?.close();server.kill();serverLog.end();await sql.end();writeFileSync(path.join(evidence,'browser-result.json'),JSON.stringify(result,null,2)+'\n');}
