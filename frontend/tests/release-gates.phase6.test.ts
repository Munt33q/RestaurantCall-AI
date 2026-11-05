import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueStatus} from '../lib/operations';
import {notificationGate} from '../lib/notification-contract';

function recorder(){
 const queries:string[]=[];
 const tx=async(strings:TemplateStringsArray)=>{queries.push(strings.join('?'));return [];};
 return {tx,queries};
}

test('ready callbacks are created only after the order reaches completed',async()=>{
 process.env.SMS_DELIVERY_ENABLED='false';
 const base={is_test:false,restaurant_id:'restaurant',id:'order',notification_consent_at:new Date(),notification_channel:'call'};
 const ready=recorder();
 await enqueueStatus(ready.tx,{...base,status:'ready'});
 assert.equal(ready.queries.length,0);
 const completed=recorder();
 await enqueueStatus(completed.tx,{...base,status:'completed'});
 assert.equal(completed.queries.length,1);
 assert.match(completed.queries[0],/notification_jobs/);
});

test('disabled SMS is blocked at the provider submission gate',async()=>{
 process.env.SMS_DELIVERY_ENABLED='false';
 process.env.SMS_REGISTRATION_VERIFIED='false';
 process.env.SMS_SENDER_VERIFIED='false';
 assert.match(notificationGate({channel:'sms',consent:true,optedOut:false,smsEnabled:false,callsEnabled:false,phone:'+12025550123',kind:'ready',orderStatus:'ready'})??'',/disabled/);
});
