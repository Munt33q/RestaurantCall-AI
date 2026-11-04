// Reconstructed from blueprint credential-safe provider diagnostics.
import test from 'node:test';import assert from 'node:assert/strict';import {telnyxApi,TelnyxApiError} from '../lib/telnyx-api';
test('provider field diagnostics retain pointers but scrub credentials, bodies and URLs',async()=>{
 const old=global.fetch,oldKey=process.env.TELNYX_API_KEY;process.env.TELNYX_API_KEY='fixture-secret-123456789';
 global.fetch=async()=>Response.json({errors:[{code:'10015',title:'Invalid',detail:'fixture-secret-123456789 body-private-123456789 https://fixture.test/path?token=secret abcdefghi.abcdefghijk.abcdefghijk',source:{pointer:'/events'}}]},{status:422});
 try{await assert.rejects(()=>telnyxApi('/fixture','POST',{payload:'body-private-123456789'}),(e:any)=>{assert.ok(e instanceof TelnyxApiError);const text=JSON.stringify(e.providerErrors);assert.match(text,/\/events/);assert.doesNotMatch(text,/fixture-secret|body-private|fixture\.test|abcdefghijk/);return true;});}finally{global.fetch=old;if(oldKey===undefined)delete process.env.TELNYX_API_KEY;else process.env.TELNYX_API_KEY=oldKey;}
});
