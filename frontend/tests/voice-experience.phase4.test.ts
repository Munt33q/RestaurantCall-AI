import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayController} from '../lib/relay/controller';
import {directSpeech} from '../lib/voice-intents';
import {decideTurn,initialState} from '../lib/voice-engine';
import {gateRelayCheckout} from '../lib/relay/checkout';

const frame=(voicePrompt:string)=>({type:'prompt',voicePrompt,last:true});
const info=(name:string,value:string)=>({type:'info',name,value});
function fixture(){
 let commits=0,acks=0;const sent:any[]=[];
 const c=new RelayController({send:m=>sent.push(m),prepare:async speech=>({speech,turn:commits}),
  commit:async()=>{commits++;return commits===1?{reply:'Full review. Say confirm.',turn:1,deliveryId:'review',phase:'confirm',requiresReadback:true}:{reply:'Order 1042 confirmed. Pay at pickup.',turn:2,deliveryId:'receipt',phase:'complete',finished:true};},
  ack:async()=>{acks++;},interrupt:async()=>{}});
 return {c,sent,get commits(){return commits;},get acks(){return acks;}};
}
test('phase4: repeated affirmative advances after full review without clientSpeaking event',async()=>{
 const f=fixture();await f.c.handle(frame('confirm'));
 await f.c.handle(info('tokensPlayed','Full review. Say confirm.'));await f.c.handle(info('agentSpeaking','off'));
 await f.c.handle(frame('confirm'));assert.equal(f.commits,2);assert.match(f.sent.at(-1).token,/1042/);f.c.close();
});
test('phase4: final playback tokens arriving after speaker-off still acknowledge the review',async()=>{
 const f=fixture();await f.c.handle(frame('confirm'));await f.c.handle(info('agentSpeaking','off'));
 assert.equal(f.acks,0);await f.c.handle(info('tokensPlayed','Full review. Say confirm.'));
 assert.equal(f.acks,1);await f.c.handle(frame('confirm'));assert.equal(f.commits,2);f.c.close();
});
test('phase4: speaker-off without complete tokens never acknowledges a review',async()=>{
 const f=fixture();await f.c.handle(frame('confirm'));await f.c.handle(info('tokensPlayed','Full review.'));
 await f.c.handle(info('agentSpeaking','off'));assert.equal(f.acks,0);f.c.close();
});
test('phase4: explicit final affirmatives are phase-bound and negations stay blocked',()=>{
 for(const speech of ['yes','confirm','place it',"that's correct",'go ahead'])assert.equal(directSpeech(speech,{phase:'confirm'}),'confirm',speech);
 for(const speech of ['do not place it','is that correct','yes but change the fries','not correct'])assert.notEqual(directSpeech(speech,{phase:'confirm'}),'confirm',speech);
 assert.notEqual(directSpeech('place it',{phase:'payment'}),'confirm');
});
test('phase4: duplicate simultaneous confirmations consume only one acknowledged review boundary',async()=>{
 const f=fixture();await f.c.handle(frame('confirm'));await f.c.handle(info('tokensPlayed','Full review. Say confirm.'));await f.c.handle(info('agentSpeaking','off'));
 await Promise.all([f.c.handle(frame('confirm')),f.c.handle(frame('confirm')),f.c.handle(frame('confirm'))]);assert.equal(f.commits,2);f.c.close();
});
test('phase4: failed backend acknowledgement cannot end a call or grant readiness',async()=>{
 const reasons:string[]=[],sent:any[]=[];let commits=0;
 const c=new RelayController({send:m=>sent.push(m),prepare:async speech=>({speech,turn:commits}),commit:async()=>{commits++;return {reply:'Receipt.',turn:commits,deliveryId:'receipt',finished:true};},ack:async()=>{throw Error('Backend rejected playback');},interrupt:async()=>{},diagnostic:r=>reasons.push(r)});
 await c.handle(frame('confirm'));await c.handle(info('tokensPlayed','Receipt.'));await c.handle(info('agentSpeaking','off'));assert.equal(sent.some(m=>m.type==='end'),false);assert.deepEqual(reasons,['playback_ack_failed']);c.close();
});
test('phase4: missing and mismatched playback receive distinct non-sensitive diagnostics',async()=>{
 for(const [played,reason] of [['','playback_tokens_missing'],['Partial review','playback_incomplete_or_mismatched']]){
  const reasons:string[]=[];let acks=0;const c=new RelayController({send:()=>{},prepare:async speech=>({speech,turn:0}),commit:async()=>({reply:'Full review.',requiresReadback:true,deliveryId:'r',turn:1}),ack:async()=>{acks++;},interrupt:async()=>{},diagnostic:r=>reasons.push(r)});
  await c.handle(frame('confirm'));if(played)await c.handle(info('tokensPlayed',played));await c.handle(info('agentSpeaking','off'));assert.equal(acks,0);assert.deepEqual(reasons,[reason]);c.close();
 }
});
test('phase4: interrupted review cannot be revived by delayed playback tokens',async()=>{
 const f=fixture();await f.c.handle(frame('confirm'));await f.c.handle(info('tokensPlayed','Full review.'));await f.c.handle({type:'interrupt'});await f.c.handle(info('agentSpeaking','off'));await f.c.handle(info('tokensPlayed',' Say confirm.'));assert.equal(f.acks,0);f.c.close();
});
test('phase4: unavailable playback evidence triggers a new tracked review on caller retry',async()=>{
 const now=Date.now;let time=100;Date.now=()=>time;let commits=0,interrupts=0,acks=0;
 const c=new RelayController({send:()=>{},prepare:async speech=>({speech,turn:commits}),commit:async()=>({reply:'Full review.',turn:++commits,deliveryId:String(commits),requiresReadback:true,phase:'confirm'}),ack:async()=>{acks++;},interrupt:async()=>{interrupts++;}});
 try{await c.handle(frame('confirm'));await c.handle(info('tokensPlayed','Full'));time+=2000;await c.handle(frame('confirm'));assert.equal(commits,2);assert.equal(interrupts,1);await c.handle(info('tokensPlayed','Full review.'));await c.handle(info('agentSpeaking','off'));assert.equal(acks,1);}finally{Date.now=now;c.close();}
});
test('phase4: missing review and unrecognized intent have separate rejection reasons',()=>{
 const menu=[{id:'b',name:'Burger',itemNumber:1,priceCents:1000,isAvailable:true,stockQty:10}];
 const review=decideTurn({...initialState(),items:[{menuItemId:'b',quantity:1}],phase:'notes',customerName:'Alex',paymentMethod:'cash'},'no notes',menu,825);
 const unknown=decideTurn(review.state,'maybe',menu,825);assert.equal(unknown.checkoutRejection,'unrecognized_confirmation');
 const blocked=gateRelayCheckout(decideTurn(review.state,'place it',menu,825),false,menu,825);assert.equal(blocked.checkoutRejection,'missing_playback_evidence');assert.equal(blocked.submit,false);assert.equal(blocked.reviewRequired,true);
 const allowed=gateRelayCheckout(decideTurn(review.state,'place it',menu,825),true,menu,825);assert.equal(allowed.submit,true);
});
test('phase4: completed-order retries preserve the original receipt after an interrupted receipt',()=>{
 const r=decideTurn({...initialState(),phase:'complete',orderReceipt:'Order 1042 confirmed. Pay cash at pickup.',lastReply:'Order'},'yes',[],825);assert.equal(r.reply,'Order 1042 confirmed. Pay cash at pickup.');assert.equal(r.submit,false);assert.equal(r.state.phase,'complete');
});
test('phase4: a queued final from before interruption cannot commit after the pending write',async()=>{
 let resolveCommit:(value:any)=>void=()=>{};let commits=0;const prepared:string[]=[];
 const c=new RelayController({send:()=>{},prepare:async speech=>{prepared.push(speech);return {speech,turn:commits};},commit:async()=>{commits++;return new Promise(r=>{resolveCommit=r;});},ack:async()=>{},interrupt:async()=>{}});
 const first=c.handle(frame('first'));await new Promise(r=>setTimeout(r,0));const queued=c.handle(frame('stale second'));await c.handle({type:'interrupt'});resolveCommit({reply:'Old reply',turn:1,deliveryId:'old'});await first;await queued;assert.deepEqual(prepared,['first']);assert.equal(commits,1);c.close();
});
