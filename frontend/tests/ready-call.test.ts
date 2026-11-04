import test from 'node:test';
import assert from 'node:assert/strict';
import {readyCall, type ReadyCallStore} from '../lib/ready-call';
function store(): ReadyCallStore {const attempts=new Set<string>();return {claim:async(id)=>{if(attempts.has(id))return false;attempts.add(id);return true;},save:async()=>{}};}
const input={requestId:'d3c1b18d-1d20-4e50-9126-40a4870d20e7',to:'+12025550100',orderNumber:'2'};
const config={apiKey:'test-secret',applicationId:'1234567890',from:'+15044979015'};
test('never repeats an uncertain outbound attempt',async()=>{
 const ledger=store();let requests=0;
 const transport:typeof fetch=async(_url,init)=>{requests++;const b=JSON.parse(String(init?.body));assert.equal(b.To,input.to);assert.equal(b.From,config.from);assert.match(b.Texml,/voice="Polly.Joanna-Neural"/);assert.match(b.Texml,/order number 2 is ready for pickup/);assert.match(b.Texml,/<Hangup\/>/);throw new Error('connection lost');};
 await assert.rejects(readyCall(input,config,ledger,transport),/connection lost/);
 await assert.rejects(readyCall(input,config,ledger,transport),/already attempted/);assert.equal(requests,1);
});
test('rejects invalid numbers and XML injection before dialing',async()=>{
 let touched=false;const ledger:ReadyCallStore={claim:async()=>{touched=true;return true;},save:async()=>{}};
 for(const bad of [{...input,to:'sip:someone@example.com'},{...input,orderNumber:'2</Say><Dial>911</Dial>'}])await assert.rejects(readyCall(bad,config,ledger),/Invalid/);
 assert.equal(touched,false);
});
test('records provider acceptance without claiming delivery',async()=>{
 let saved:any;const ledger=store();ledger.save=async value=>{saved=value;};
 const result=await readyCall(input,config,ledger,async()=>Response.json({call_sid:'provider-call',status:'queued'}));
 assert.equal(result.status,'queued');assert.equal(saved.callSid,'provider-call');assert.equal(saved.to,input.to);
});
