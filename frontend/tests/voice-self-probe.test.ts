// Reconstructed from blueprint diagnostics; all SQL and telephone commands are mocked.
import test from 'node:test';import assert from 'node:assert/strict';import {voiceSelfProbe} from '../lib/voice-self-probe';
const config={number:'+15044979015',applicationId:'app',sourceApplicationId:'original',restaurant:'tenant',socketUrl:'wss://fixture.test/ws',secretRef:'fixture-ref'};
test('unowned destination and unprepared application cause zero provider traffic',async()=>{let calls=0;const deps={sql:async()=>[],api:async()=>{calls++;return {data:{}};}};await assert.rejects(()=>voiceSelfProbe({...config,number:'+12025550123'},deps),/OWNED_LINE_ONLY/);await assert.rejects(()=>voiceSelfProbe(config,deps),/DIAGNOSTIC_APPLICATION_MISMATCH/);assert.equal(calls,0);});
test('owned-line probe uses preview authority and always hangs up after a relay failure',async()=>{
 process.env.STAFF_SESSION_SECRET='fixture-signing-secret';const commands:any[]=[];
 const sql=async(strings:TemplateStringsArray)=>strings.join('').includes('voice-preparation')?[]:[{provider:'app'}];
 const db=async(strings:TemplateStringsArray,...values:any[])=>String(values[0]??'').startsWith('voice-preparation:')?[{provider:'app'}]:strings.join('').includes('SELECT provider')?[{provider:'voice-done'}]:[{event_id:'claimed'}];
 const api:any=async(path:string,method='GET',body?:any)=>{commands.push({path,method,body});if(path.startsWith('/phone_numbers/'))return {data:{phone_number:config.number,connection_id:'3084387354371163718'}};if(path.includes('applications/'))return {data:{outbound:{outbound_voice_profile_id:'fixture-profile'}}};if(path==='/calls')return {data:{call_control_id:'fixture-call'}};if(path.endsWith('conversation_relay_start'))throw Error('fixture rejection');return {data:{}};};
 const r=await voiceSelfProbe(config,{sql:db,api});assert.equal(r.cleanupRequested,true);assert.equal(r.providerAccepted,false);assert.match(commands.at(-1).path,/hangup$/);
 const grant=commands.find(c=>c.path.endsWith('conversation_relay_start')).body.url;const payload=JSON.parse(Buffer.from(new URL(grant).searchParams.get('token')!.split('.')[1],'base64url').toString());assert.equal(payload.mode,'preview');
});
