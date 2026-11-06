// Reconstructed regression tests; no real provider requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runNotificationJobs} from '../lib/operations';

for(const scenario of ['withdrawn consent','changed channel','SMS opt-out'] as const){
 test(`recovery: queued notification cannot bypass ${scenario}`,async()=>{
  process.env.RESTAURANT_ID='recovery-restaurant';
  process.env.OUTBOUND_UPDATES_ENABLED='true';
  process.env.SMS_DELIVERY_ENABLED='true';
  process.env.TELNYX_API_KEY='fixture';
  process.env.TELNYX_PHONE_NUMBER='+12025550101';
  process.env.PUBLIC_APP_URL='https://example.test';
  const channel=scenario==='SMS opt-out'?'sms':'call';
  const job={id:'job',order_id:'order',channel,kind:'ready',consent_at:new Date(),status:'dispatching'};
  const order={id:'order',restaurant_id:'recovery-restaurant',customer_phone:'+12025550123',status:'ready',callback_stages:['ready'],payment_method:'cash',total_cents:1200,notification_consent_at:scenario==='withdrawn consent'?null:new Date(),notification_channel:scenario==='changed channel'?'none':channel};
  let posts=0,suppressed=false;
  const sql:any=async(strings:TemplateStringsArray,...values:unknown[])=>{
   const q=strings.join('?');
   if(q.includes('FROM notification_jobs WHERE')&&q.includes("status='pending'"))return [job];
   if(q.includes('FROM orders WHERE'))return [order];
   if(q.includes('FROM messaging_preferences'))return [{sms_opted_out:scenario==='SMS opt-out'}];
   if(q.includes('SELECT count'))return [{n:0}];
   if(q.includes('UPDATE notification_jobs SET status=')&&(values[0]==='suppressed'||q.includes("status='suppressed'")))suppressed=true;
   return [];
  };
  sql.json=JSON.stringify;sql.begin=async(fn:any)=>fn(sql);
  const transport:typeof fetch=async()=>{posts++;throw Error('Unexpected provider dispatch');};
  await runNotificationJobs(undefined,transport,sql);
  assert.equal(posts,0);assert.equal(suppressed,true);
 });
}
