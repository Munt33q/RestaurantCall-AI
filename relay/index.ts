import {voiceCopy} from '../frontend/lib/voice-copy';
import {relayDigits} from '../frontend/lib/relay/languages';
import {upgradeWebSocket} from '@neon/functions';
import crypto from 'node:crypto';
import {RelayController,type RelayReply} from '../frontend/lib/relay/controller';
const APP_URL=process.env.APP_URL??'https://restaurant-call-ai.vercel.app';
let cachedKey:any=null;let keyFetched=0;const active=new Map<string,WebSocket>();
async function authenticate(token:string){
 try{
  if(token.length>4000)return null;const [h,p,s,...extra]=token.split('.');if(extra.length||!h||!p||!s)return null;
  const header=JSON.parse(Buffer.from(h,'base64url').toString()),grant=JSON.parse(Buffer.from(p,'base64url').toString());
  if(header.alg!=='EdDSA'||grant.aud!=='restaurant-call-relay'||!['live','preview'].includes(grant.mode)||typeof grant.callId!=='string'||grant.callId.length>256||typeof grant.nonce!=='string'||typeof grant.exp!=='number'||grant.exp<Date.now()||grant.exp>Date.now()+31*60*1000)return null;
  if(!cachedKey||Date.now()-keyFetched>60000){const response=await fetch(APP_URL+'/api/relay/keys',{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)return null;const jwks=await response.json();cachedKey=jwks.keys.find((k:any)=>k.kid===header.kid);keyFetched=Date.now();}
  if(!cachedKey||!crypto.verify(null,Buffer.from(h+'.'+p),crypto.createPublicKey({key:cachedKey,format:'jwk'}),Buffer.from(s,'base64url')))return null;
  return grant;
 }catch{return null;}
}
export default {async fetch(request:Request){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({ok:true,transport:'conversation-relay',build:'duplex-v1'});
 if(url.pathname!=='/ws')return new Response('Not found',{status:404});
 const token=url.searchParams.get('token')??'';const grant=await authenticate(token);if(!grant)return new Response('Unauthorized',{status:401});
 if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 if(active.has(grant.nonce)||active.size>=10)return new Response('Connection unavailable',{status:409});
 const connectionId=crypto.randomUUID();
 async function action(action:string,body:any={},signal?:AbortSignal){const response=await fetch(APP_URL+'/api/relay/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,connectionId,...body}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(22000)]):AbortSignal.timeout(22000),redirect:'error'});if(!response.ok){console.error('RELAY_APP_REQUEST_FAILED',{action,status:response.status,host:new URL(APP_URL).hostname});throw new Error(`relay_api_${response.status}`);}return response.json();}
 let connected:any;try{connected=await action('connect');}catch(error){console.error('RELAY_CONNECT_FAILED',{error:error instanceof Error&&/^relay_api_\d{3}$/.test(error.message)?error.message:error instanceof Error?error.name:'unknown',host:new URL(APP_URL).hostname});return new Response('Ordering backend unavailable',{status:503});}
 const {socket,response}=upgradeWebSocket(request);active.set(grant.nonce,socket);
 let state=connected.state,turn=connected.turn,phase=connected.phase,languageSelectionRequired=connected.languageSelectionRequired===true,activeLanguage=connected.state?.languagePreference?.language??'en',history:any[]=[],setup=false,lastActivity=Date.now(),digits='',digitTimer:ReturnType<typeof setTimeout>|undefined;
 const send=(m:unknown)=>{if(socket.readyState===1)socket.send(JSON.stringify(m));};
 const controller=new RelayController({
  send,diagnostic:reason=>console.warn('VOICE_PLAYBACK_REJECTED',{reason}),
  prepare:async(speech,signal)=>{const result=await action('prepare',{speech,state,turn,history},signal);return result;},
  commit:async prepared=>{const result=await action('commit',{preparedToken:prepared.preparedToken}) as RelayReply&{phase?:string};turn=result.turn;phase=result.phase??phase;activeLanguage=result.languagePreference?.language??activeLanguage;languageSelectionRequired=result.languageSelectionRequired===true;if(result.state)state=result.state;history=[...history,{role:'user',content:prepared.speech},{role:'assistant',content:result.reply}].slice(-6);return result;},
  ack:async(deliveryId,playedText)=>{const acknowledgement=await action('ack',{deliveryId,playedText});if(acknowledgement.ok!==true)throw Error('Playback acknowledgement rejected');if(state?.relayDeliveryId===deliveryId&&state.relayRequiresReadback)state.relayReviewReady=true;},
  interrupt:async(heard,deliveryId)=>{await action('interrupt',{heard,deliveryId});if(deliveryId&&state?.relayDeliveryId===deliveryId){state.relayReviewReady=false;state.lastReply=heard;const last=history.at(-1);if(last?.role==='assistant')last.content=heard||'[interrupted before playback]';}}
 });
 function flushDigits(){clearTimeout(digitTimer);const value=digits;digits='';const speech=relayDigits(value,phase,languageSelectionRequired);if(speech)void controller.handle({type:'prompt',voicePrompt:speech,last:true});}
 const idle=setInterval(()=>{if(Date.now()>grant.exp){send({type:'end',handoffData:'{"reason":"session_expired"}'});socket.close(1000,'Session expired');}else if(Date.now()-lastActivity>65000){send({type:'text',token:voiceCopy(activeLanguage,'idle'),last:true});setTimeout(()=>{send({type:'end'});socket.close(1000,'Idle');},6000);lastActivity=Date.now();}},5000);
 socket.addEventListener('message',event=>{
  if(typeof event.data!=='string'||event.data.length>20000){socket.close(1009,'Invalid frame');return;}
  lastActivity=Date.now();let message:any;try{message=JSON.parse(event.data);}catch{socket.close(1008,'Invalid JSON');return;}
  if(message.type==='setup'){
   if(setup||![message.callSid,message.callControlId].includes(grant.callId)){socket.close(1008,'Call mismatch');return;}setup=true;if(connected.state?.languagePreference?.confirmed&&activeLanguage!=='en')send({type:'language',ttsLanguage:activeLanguage,transcriptionLanguage:activeLanguage});return;
  }
  if(!setup){socket.close(1008,'Setup required');return;}
  if(message.type==='dtmf'){
   void controller.handle({type:'interrupt'});const digit=String(message.digit??'');if(digit==='#'){flushDigits();return;}if(!/^\d$/.test(digit))return;digits+=digit;if(digits.length>=2)flushDigits();else{clearTimeout(digitTimer);digitTimer=setTimeout(flushDigits,1800);}return;
  }
  if(message.type==='error'){console.error('Conversation Relay provider error',String(message.description??'').slice(0,160));return;}
  void controller.handle(message).catch(()=>{send({type:'text',token:voiceCopy(activeLanguage,'outage'),last:true});});
 });
 socket.addEventListener('close',()=>{controller.close();clearInterval(idle);clearTimeout(digitTimer);active.delete(grant.nonce);});
 socket.addEventListener('error',()=>{controller.close();clearInterval(idle);clearTimeout(digitTimer);active.delete(grant.nonce);});
 return response;
}};
