import test from 'node:test';
import assert from 'node:assert/strict';
import {mintRelayToken,verifyRelayToken,relayPublicJwk} from '../lib/relay-token';
import {RelayController} from '../lib/relay/controller';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('relay credentials are scoped to one call, expire, and cannot be forged',()=>{
 process.env.STAFF_SESSION_SECRET='test-session-secret';const token=mintRelayToken('call-one');
 assert.equal(verifyRelayToken(token)?.callId,'call-one');assert.equal(verifyRelayToken(token+'x'),null);
 assert.equal(verifyRelayToken(token,Date.now()+31*60*1000),null);assert.equal(relayPublicJwk().kty,'OKP');assert.equal('d' in relayPublicJwk(),false);
});
test('interruption discards a stale reply and partial prompts never commit',async()=>{
 const sent:any[]=[];let resolvePrepare:any;let commits=0;
 const controller=new RelayController({send:m=>sent.push(m),prepare:async()=>new Promise(r=>{resolvePrepare=r;}),commit:async()=>{commits++;return {reply:'old answer',turn:1};},ack:async()=>{},interrupt:async()=>{}});
 await controller.handle({type:'prompt',voicePrompt:'I want a burger',last:false});assert.equal(commits,0);
 void controller.handle({type:'prompt',voicePrompt:'I want a burger',last:true});await tick();
 await controller.handle({type:'interrupt',utteranceUntilInterrupt:''});resolvePrepare({speech:'I want a burger',turn:0});await tick();
 assert.equal(commits,0);assert.deepEqual(sent,[]);
});
test('a final transcript is processed once and playback acknowledgment follows actual end of speech',async()=>{
 const sent:any[]=[];let commits=0;let acks=0;
 const controller=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'hello',turn:0}),commit:async()=>{commits++;return {reply:'Which burger?',turn:1,deliveryId:'delivery-one'};},ack:async()=>{acks++;},interrupt:async()=>{}});
 await controller.handle({type:'prompt',voicePrompt:'hello',last:true});await controller.handle({type:'prompt',voicePrompt:'hello',last:true});assert.equal(commits,1);assert.equal(acks,0);
 await controller.handle({type:'info',name:'tokensPlayed',value:'Which burger?'});assert.equal(acks,0);
 await controller.handle({type:'info',name:'agentSpeaking',value:'off'});assert.equal(acks,1);assert.equal(sent[0].type,'text');
});
test('an interrupted readback is not acknowledged as completed',async()=>{
 let acks=0;const controller=new RelayController({send:()=>{},prepare:async()=>({speech:'cash',turn:0}),commit:async()=>({reply:'Your total is ten dollars. Say confirm.',turn:1,deliveryId:'review'}),ack:async()=>{acks++;},interrupt:async()=>{}});
 await controller.handle({type:'prompt',voicePrompt:'cash',last:true});await controller.handle({type:'info',name:'tokensPlayed',value:'Your total'});await controller.handle({type:'interrupt',utteranceUntilInterrupt:'Your total'});await controller.handle({type:'info',name:'agentSpeaking',value:'off'});assert.equal(acks,0);
});
test('final submission is blocked until the complete current review was played',async()=>{
 const {gateRelayCheckout}=await import('../lib/relay/checkout');const {decideTurn,initialState}=await import('../lib/voice-engine');
 const menu=[{id:'burger',name:'Burger',itemNumber:1,priceCents:1000,isAvailable:true,stockQty:5}];
 let r=decideTurn(initialState(),'item 1',menu,0);r=decideTurn(r.state,'done',menu,0);r=decideTurn(r.state,'Alice',menu,0);r=decideTurn(r.state,'yes',menu,0);r=decideTurn(r.state,'cash',menu,0);r=decideTurn(r.state,'none',menu,0);r=decideTurn(r.state,'no notes',menu,0);
 const blocked=gateRelayCheckout(decideTurn(r.state,'confirm',menu,0),false,menu,0);assert.equal(blocked.submit,false);assert.equal(blocked.state.phase,'confirm');assert.match(blocked.reply,/Total including tax/);
 assert.equal(gateRelayCheckout(decideTurn(r.state,'confirm',menu,0),true,menu,0).submit,true);
});
test('relay XML keeps listening during playback and never uses Gather',async()=>{
 const {relayVoiceXml}=await import('../lib/relay-xml');const xml=relayVoiceXml('wss://relay.example/ws','token','https://app.example');
 assert.match(xml,/<ConversationRelay/);assert.match(xml,/interruptible="speech"/);assert.match(xml,/partialPrompts="true"/);assert.match(xml,/events="speaker-events tokens-played"/);assert.doesNotMatch(xml,/<Gather/);assert.match(xml,/relay-ended\?endedToken=token/);assert.match(relayVoiceXml('wss://relay.example/ws','token','https://app.example','Your draft is saved.'),/welcomeGreeting="Your draft is saved\."/);
});
test('barge-in dispatches invalidation immediately while commit is pending',async()=>{
 let resolveCommit:any;let interrupted=0;const sent:any[]=[];
 const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'order',turn:0}),commit:async()=>new Promise(r=>{resolveCommit=r;}),ack:async()=>{},interrupt:async()=>{interrupted++;}});
 const running=c.handle({type:'prompt',voicePrompt:'order',last:true});await tick();await c.handle({type:'interrupt'});assert.equal(interrupted,1);resolveCommit({reply:'stale',turn:1,deliveryId:'old'});await running;assert.deepEqual(sent,[]);
});
test('a repeated final cannot add twice after a speaker event or delay',async()=>{
 let commits=0;const c=new RelayController({send:()=>{},prepare:async()=>({speech:'item one',turn:0}),commit:async()=>{commits++;return {reply:'Added one.',turn:1,phase:'ordering'};},ack:async()=>{},interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'item one',last:true});await c.handle({type:'info',name:'clientSpeaking',value:'on'});await c.handle({type:'prompt',voicePrompt:'item one',last:true});assert.equal(commits,1);
});
test('old completion cannot end a newer interrupted conversation',async()=>{
 let resolveAck:any;const sent:any[]=[];const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'confirm',turn:0}),commit:async()=>({reply:'Confirmed.',turn:1,deliveryId:'one',finished:true}),ack:async()=>new Promise<void>(r=>{resolveAck=r;}),interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'confirm',last:true});await c.handle({type:'info',name:'tokensPlayed',value:'Confirmed.'});const done=c.handle({type:'info',name:'agentSpeaking',value:'off'});await tick();await c.handle({type:'interrupt'});resolveAck();await done;assert.equal(sent.filter(m=>(m as any).type==='end').length,0);
});
test('the same phrase can be retried after preparation fails or is interrupted',async()=>{
 let attempts=0,commits=0;let resolveFirst:any;
 const c=new RelayController({send:()=>{},prepare:async()=>{attempts++;if(attempts===1)throw new Error('temporary');if(attempts===2)return new Promise(r=>{resolveFirst=r;});return {speech:'cash',turn:0};},commit:async()=>{commits++;return {reply:'Review.',turn:1};},ack:async()=>{},interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'cash',last:true});
 const canceled=c.handle({type:'prompt',voicePrompt:'cash',last:true});await tick();await c.handle({type:'interrupt'});
 assert.equal(attempts,2);resolveFirst({speech:'cash',turn:0});await canceled;
 await c.handle({type:'prompt',voicePrompt:'cash',last:true});assert.equal(attempts,3);assert.equal(commits,1);
});
