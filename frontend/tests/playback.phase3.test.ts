// Phase 3 regression coverage; reconstructed, not recovered historical source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayController} from '../lib/relay/controller';

async function playback(reply:string,played:string){
 let acks=0;const sent:any[]=[];
 const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'review',turn:0}),commit:async()=>({reply,turn:1,deliveryId:'review',requiresReadback:true,finished:true}),ack:async()=>{acks++;},interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'review',last:true});
 await c.handle({type:'info',name:'tokensPlayed',value:played});
 await c.handle({type:'info',name:'agentSpeaking',value:'off'});c.close();return {acks,sent};
}
test('different Arabic playback cannot authorize a review or end the call',async()=>{
 const r=await playback('طلبك جاهز للتأكيد','لم أسمع الطلب');assert.equal(r.acks,0);assert.equal(r.sent.filter(m=>m.type==='end').length,0);
});
test('missing Hindi playback cannot authorize a review',async()=>{assert.equal((await playback('कृपया पुष्टि करें','')).acks,0);});
test('complete Unicode review is acknowledged after playback ends',async()=>{assert.equal((await playback('कृपया पुष्टि करें।','कृपया पुष्टि करें।')).acks,1);});
test('punctuation-only output cannot authorize checkout',async()=>{assert.equal((await playback('...','')).acks,0);});
