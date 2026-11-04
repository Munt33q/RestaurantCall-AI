// Reconstructed from blueprint signed-event transport contracts. All commands are mocked.
import test from 'node:test';import assert from 'node:assert/strict';import {handleLiveVoiceEvent,type VoiceDependencies} from '../lib/live-voice-transport';
function fixture(){const commands:any[]=[];let opened=0;const deps:VoiceDependencies={connectionId:'app',number:'+12025550101',socketUrl:'wss://fixture.test/ws',secretRef:'fixture-ref',open:async()=>{opened++;},admitted:async()=>true,token:async()=>'fixture-token',ended:async()=>{},command:async(id,action,body)=>{commands.push({id,action,body});}};const event={event_type:'call.answered',payload:{call_control_id:'call',connection_id:'app',to:deps.number,from:'+12025550123'}};return {deps,event,commands,opened:()=>opened};}
test('foreign app, outbound initiated and unadmitted directionless answers issue no commands',async()=>{
 for(const change of [{connection_id:'other'},{direction:'outgoing'},{to:'+12025550999'}]){const f=fixture();await handleLiveVoiceEvent({...f.event,payload:{...f.event.payload,...change}},f.deps);assert.equal(f.commands.length,0);assert.equal(f.opened(),0);}
 const f=fixture();f.deps.admitted=async()=>false;await handleLiveVoiceEvent(f.event,f.deps);assert.equal(f.commands.length,0);
});
test('accepted relay start uses Bella Flux and omits unsupported events; IDs are retry stable',async()=>{
 const f=fixture();await handleLiveVoiceEvent(f.event,f.deps);await handleLiveVoiceEvent(f.event,f.deps);const b=f.commands[0].body;
 assert.match(b.voice,/ElevenLabs/);assert.equal(b.transcription_engine_config.transcription_model,'deepgram/flux');assert.equal('events' in b,false);assert.equal(b.interruptible,'speech');assert.equal(f.commands[0].body.command_id,f.commands[1].body.command_id);
});
test('acceptance filter admits no customer session and outage waits for scoped playback end',async()=>{
 const f=fixture();f.deps.acceptancePhone='+12025550999';await handleLiveVoiceEvent(f.event,f.deps);assert.equal(f.opened(),0);assert.equal(f.commands[0].action,'speak');
 await handleLiveVoiceEvent({event_type:'call.speak.ended',payload:{call_control_id:'call',connection_id:'app',client_state:f.commands[0].body.client_state}},f.deps);assert.equal(f.commands[1].action,'hangup');
});
