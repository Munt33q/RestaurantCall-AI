// Phase 3 runtime contract harness. Real Neon SDK; WebSocket platform bridge is simulated.
import test from 'node:test';import assert from 'node:assert/strict';
import relay from '../../relay/index';import monitor from '../../monitor/index';
import {mintRelayToken,relayPublicJwk} from '../lib/relay-token';
const tick=()=>new Promise(r=>setTimeout(r,20));
class Socket extends EventTarget{readyState=1;sent:any[]=[];closed:number|undefined;send(s:string){this.sent.push(JSON.parse(s));}close(code:number){this.closed=code;this.readyState=3;this.dispatchEvent(new Event('close'));}receive(m:unknown){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(m)}));}}
test('relay handler verifies JWT, setup identity, duplicate nonce and full review playback',async()=>{
 process.env.STAFF_SESSION_SECRET='phase3-fixture-signing-secret';const old=global.fetch,bridge=Symbol.for('neon.websocket.bridge');let socket:Socket;const actions:string[]=[];
 (globalThis as any)[bridge]={upgrade:()=>{socket=new Socket();return {socket,response:new Response('simulated upgrade')};}};
 global.fetch=async(url,options)=>{if(String(url).endsWith('/api/relay/keys'))return Response.json({keys:[relayPublicJwk()]});const body=JSON.parse(options!.body as string);actions.push(body.action);if(body.action==='connect')return Response.json({state:{},turn:0,phase:'ordering'});if(body.action==='prepare')return Response.json({speech:body.speech,turn:0,preparedToken:'fixture'});if(body.action==='commit')return Response.json({reply:'Your total is ten dollars. Say confirm.',turn:1,deliveryId:'review',requiresReadback:true,phase:'confirm'});return Response.json({ok:true});};
 const request=(token:string)=>new Request('https://fixture.test/ws?token='+token,{headers:{Upgrade:'websocket'}});
 try{
 assert.equal((await relay.fetch(request('forged'))).status,401);
 const token=mintRelayToken('fixture-call');assert.equal((await relay.fetch(request(token))).status,200);assert.equal((await relay.fetch(request(token))).status,409);
 socket!.receive({type:'setup',callControlId:'wrong-call'});assert.equal(socket!.closed,1008);
 await relay.fetch(request(mintRelayToken('fixture-call')));socket!.receive({type:'prompt',voicePrompt:'hello',last:true});assert.equal(socket!.closed,1008);
 await relay.fetch(request(mintRelayToken('fixture-call')));socket!.receive({type:'setup',callControlId:'fixture-call'});socket!.receive({type:'prompt',voicePrompt:'hello',last:true});await tick();assert.equal(socket!.sent[0].type,'text');
 socket!.receive({type:'info',name:'tokensPlayed',value:'Your total'});socket!.receive({type:'info',name:'agentSpeaking',value:'off'});await tick();assert.equal(actions.filter(a=>a==='ack').length,0);
 socket!.receive({type:'info',name:'tokensPlayed',value:' is ten dollars. Say confirm.'});socket!.receive({type:'info',name:'agentSpeaking',value:'off'});await tick();assert.equal(actions.filter(a=>a==='ack').length,1);
 socket!.receive({type:'interrupt',utteranceUntilInterrupt:'Your total'});await tick();assert.equal(actions.at(-1),'interrupt');socket!.close(1000);
 }finally{global.fetch=old;delete (globalThis as any)[bridge];}
});
function invocation(secret?:string,name='model-health-every-minute'){
 return new Request('https://fixture.test/monitor',{method:'POST',headers:{'Content-Type':'application/json','x-neon-trigger-invocation-id':'fixture-invocation',...(secret?{Authorization:'Bearer '+secret}:{})},body:JSON.stringify({version:1,invocation_id:'fixture-invocation',trigger:{id:'fixture-trigger',type:'schedule',name},data:{scheduled_at:new Date().toISOString()}})});
}
test('monitor requires trusted trigger metadata, matching invocation ID and expected schedule name',async()=>{
 const old=global.fetch;let network=0;global.fetch=async()=>{network++;return Response.json({ok:true});};
 try{
 const valid=invocation();const untrusted=new Request(valid,{headers:{'Content-Type':'application/json'}});
 assert.equal((await monitor.fetch(untrusted)).status,401);assert.equal(network,0);
 const wrongId=new Request(invocation(),{headers:{'Content-Type':'application/json','x-neon-trigger-invocation-id':'other-id'}});assert.equal((await monitor.fetch(wrongId)).status,401);
 assert.equal((await monitor.fetch(invocation(undefined,'other-trigger'))).status,401);assert.equal(network,0);
 // Neon dev forwards this fixture header. Production gateway strips client x-neon-* headers.
 assert.equal((await monitor.fetch(invocation())).status,200);assert.equal(network,1);
 }finally{global.fetch=old;}
});
