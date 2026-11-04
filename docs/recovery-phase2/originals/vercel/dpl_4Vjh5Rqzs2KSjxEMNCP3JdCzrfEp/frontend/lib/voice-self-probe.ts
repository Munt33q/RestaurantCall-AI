import crypto from 'node:crypto';import {client} from './db/client';import {telnyxApi,TelnyxApiError} from './telnyx-api';import {signRelayPayload} from './relay-token';import {handleLiveVoiceEvent} from './live-voice-transport';
export const VOICE_SELF_PROBE_STATE=Buffer.from('restaurantcall:owned-line-self-probe').toString('base64');
type Config={number:string;applicationId:string;sourceApplicationId:string;restaurant:string;socketUrl:string;secretRef:string};
export async function voiceSelfProbe(c:Config,deps?:{sql:any;api:typeof telnyxApi}){
 if(c.number!=='+15044979015')throw Error('OWNED_LINE_ONLY');
 const sql=deps?.sql??client(),api=deps?.api??telnyxApi;
 const [prepared]=await sql`SELECT provider FROM webhook_events WHERE event_id=${'voice-preparation:'+c.restaurant}`;
 if(prepared?.provider!==c.applicationId)throw Error('DIAGNOSTIC_APPLICATION_MISMATCH');
 const number=(await api('/phone_numbers/3083500286304585102')).data;
 if(number.phone_number!==c.number||number.connection_id!=='3084387354371163718')throw Error('SELF_PROBE_REQUIRES_OWNED_DEMO_ROUTE');
 const original=(await api('/texml_applications/'+encodeURIComponent(c.sourceApplicationId))).data;
 const app=(await api('/call_control_applications/'+encodeURIComponent(c.applicationId))).data;
 if(!app.outbound?.outbound_voice_profile_id){const profile=original.outbound?.outbound_voice_profile_id;
  if(!profile)throw Error('DIAGNOSTIC_OUTBOUND_PROFILE_UNAVAILABLE');
  await api('/call_control_applications/'+encodeURIComponent(c.applicationId),'PATCH',{outbound:{outbound_voice_profile_id:profile,channel_limit:1}});
 }
 const claim=await sql`INSERT INTO webhook_events(event_id,provider) VALUES(${'voice-self-probe:'+c.restaurant+':'+Math.floor(Date.now()/60000)},'owned-line-diagnostic') ON CONFLICT DO NOTHING RETURNING event_id`;
 if(!claim.length)throw Error('SELF_PROBE_RATE_LIMITED');
 let callId:string|undefined;const result:any={destination:c.number,previewOnly:true,answered:false,providerAccepted:false,cleanupRequested:false};
 try{
  const dial=await api('/calls','POST',{connection_id:c.applicationId,from:c.number,to:c.number,command_id:'self-probe-'+crypto.randomUUID(),timeout_secs:10,time_limit_secs:30,client_state:VOICE_SELF_PROBE_STATE});
  if(typeof dial.data?.call_control_id!=='string')throw Error('SELF_PROBE_CALL_RESPONSE_UNCERTAIN');callId=dial.data.call_control_id;
  result.callId=callId;
  for(let attempt=0;attempt<10;attempt++){
   const [answered]=await sql`SELECT provider FROM webhook_events WHERE event_id=${'voice-event:'+c.restaurant+':'+callId+':call.answered'}`;
   if(answered?.provider==='voice-done'){result.answered=true;break;}
   await new Promise(resolve=>setTimeout(resolve,750));
  }
  if(!result.answered)return result;
  // preview is three characters longer than live; a 33-character random nonce
  // preserves the original URL length while retaining strong randomness.
  const token=signRelayPayload({aud:'restaurant-call-relay',callId,mode:'preview',nonce:crypto.randomBytes(24).toString('base64url')+'x',exp:Date.now()+300000});
  try{
   await handleLiveVoiceEvent({event_type:'call.answered',payload:{call_control_id:callId,connection_id:c.applicationId,from:c.number,to:c.number}},{
    connectionId:c.applicationId,number:c.number,socketUrl:c.socketUrl,secretRef:c.secretRef,acceptancePhone:c.number,
    open:async()=>{},admitted:async()=>true,token:async()=>token,ended:async()=>{},
    command:async(id,action,body)=>{if(action==='conversation_relay_start'){result.requestSummary={urlLength:String(body.url).length,greetingLength:String(body.greeting).length};await api('/calls/'+encodeURIComponent(id)+'/actions/'+action,'POST',body);}}
   });result.providerAccepted=true;
  }catch(error){result.error=error instanceof Error?error.message:'unknown';result.providerErrors=error instanceof TelnyxApiError?error.providerErrors:[];}
  return result;
 }finally{
  if(callId){try{await api('/calls/'+encodeURIComponent(callId)+'/actions/hangup','POST',{command_id:'self-probe-stop-'+crypto.randomUUID()});result.cleanupRequested=true;}catch{result.cleanupRequested=false;console.error('VOICE_SELF_PROBE_CLEANUP_UNCERTAIN');}}
 }
}
