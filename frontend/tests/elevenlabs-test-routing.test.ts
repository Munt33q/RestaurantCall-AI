import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/elevenlabs/test-initiation/route';
test('staging initiation gate preserves non-test callers without issuing database or tool credentials',async()=>{
 Object.assign(process.env,{VERCEL_ENV:'preview',ELEVENLABS_SESSION_BINDING_ENABLED:'true',ELEVENLABS_SESSION_BINDING_KEY:'test-routing-fixture-secret-at-least-32',ELEVENLABS_AGENT_ID:'agent_fixture',ELEVENLABS_INBOUND_NUMBER:'+12025550101',ELEVENLABS_ACCEPTANCE_CALLERS:'+12025550123'});
 const body={conversation_id:'conv_validfixture123',agent_id:'agent_fixture',caller_id:'+12025550124',called_number:'+12025550101',call_sid:'fixture-sid'};
 const request=(payload=body,key=process.env.ELEVENLABS_SESSION_BINDING_KEY)=>new Request('https://preview.test/api/elevenlabs/test-initiation',{method:'POST',headers:{authorization:'Bearer '+key},body:JSON.stringify(payload)});
 assert.equal((await POST(request(body,'invalid'))).status,401);
 const response=await POST(request());assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{type:'conversation_initiation_client_data',dynamic_variables:{}});
 assert.equal((await POST(request({...body,called_number:'+12025550102'}))).status,400);
 process.env.VERCEL_ENV='production';assert.equal((await POST(request())).status,503);
});
