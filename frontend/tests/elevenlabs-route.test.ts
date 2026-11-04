import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/elevenlabs/tools/route';

test('ElevenLabs tool route fails closed when disabled or unauthorized',async()=>{
 const oldEnabled=process.env.ELEVENLABS_WEBHOOKS_ENABLED,oldKey=process.env.ELEVENLABS_TOOL_API_KEY;
 try{
  delete process.env.ELEVENLABS_WEBHOOKS_ENABLED;process.env.ELEVENLABS_TOOL_API_KEY='phase5-test-key-that-is-long-enough-123456';
  let response=await POST(new Request('https://synthetic.test/api/elevenlabs/tools',{method:'POST',body:'{}'}));assert.equal(response.status,503);
  process.env.ELEVENLABS_WEBHOOKS_ENABLED='true';
  response=await POST(new Request('https://synthetic.test/api/elevenlabs/tools',{method:'POST',body:'{}'}));assert.equal(response.status,401);
 }finally{
  if(oldEnabled===undefined)delete process.env.ELEVENLABS_WEBHOOKS_ENABLED;else process.env.ELEVENLABS_WEBHOOKS_ENABLED=oldEnabled;
  if(oldKey===undefined)delete process.env.ELEVENLABS_TOOL_API_KEY;else process.env.ELEVENLABS_TOOL_API_KEY=oldKey;
 }
});
