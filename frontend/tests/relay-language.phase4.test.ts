// Actual Neon relay module; only the socket platform and app HTTP are simulated.
import test from 'node:test';import assert from 'node:assert/strict';
import relay from '../../relay/index';import {mintRelayToken,relayPublicJwk} from '../lib/relay-token';
class Socket extends EventTarget{readyState=1;sent:any[]=[];send(s:string){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}receive(m:unknown){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(m)}));}}
test('phase4 relay keypad selection sends STT and TTS switch before translated speech',async()=>{
 process.env.STAFF_SESSION_SECRET='phase4-synthetic-relay-signing-secret';const old=global.fetch,bridge=Symbol.for('neon.websocket.bridge');let socket:Socket;let selected='en',turn=0;const prepared:string[]=[];
 (globalThis as any)[bridge]={upgrade:()=>{socket=new Socket();return {socket,response:new Response('synthetic upgrade')};}};
 global.fetch=async(url,options)=>{
  if(String(url).endsWith('/api/relay/keys'))return Response.json({keys:[relayPublicJwk()]});
  const body=JSON.parse(String(options?.body));if(body.action==='connect')return Response.json({state:{},turn:0,phase:'ordering',languageSelectionRequired:true});
  if(body.action==='prepare'){prepared.push(body.speech);return Response.json({speech:body.speech,turn,preparedToken:'fixture'});}
  if(body.action==='commit')return Response.json({reply:'Synthetic language acknowledgement',turn:++turn,deliveryId:'fixture-'+turn,phase:'ordering',languagePreference:{language:selected,confirmed:true,revision:1},languageSelectionRequired:false});
  return Response.json({ok:true});
 };
 try{for(const [index,language] of ['en','es','ar','ur','hi'].entries()){
  selected=language;turn=0;prepared.length=0;const token=mintRelayToken('phase4-synthetic-call');await relay.fetch(new Request('https://synthetic.test/ws?token='+token,{headers:{Upgrade:'websocket'}}));socket!.receive({type:'setup',callControlId:'phase4-synthetic-call'});
  socket!.receive({type:'dtmf',digit:String(index+1)});socket!.receive({type:'dtmf',digit:'#'});
  for(let i=0;i<100&&!socket!.sent.some(m=>m.type==='text');i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(prepared[0],['English','Spanish','Arabic','Urdu','Hindi'][index]);
  if(language!=='en'){assert.deepEqual(socket!.sent[0],{type:'language',ttsLanguage:language,transcriptionLanguage:language});assert.equal(socket!.sent[1].type,'text');}
  socket!.receive({type:'dtmf',digit:'4'});socket!.receive({type:'dtmf',digit:'#'});for(let i=0;i<100&&prepared.length<2;i++)await new Promise(r=>setTimeout(r,5));assert.equal(prepared[1],'item 4');socket!.close();
 }}finally{global.fetch=old;socket!?.close();delete (globalThis as any)[bridge];}
});
