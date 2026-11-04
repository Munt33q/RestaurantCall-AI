import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {telnyxApi,TelnyxApiError} from '@/lib/telnyx-api';
import {client} from '@/lib/db/client';
import {restaurantId} from '@/lib/repository';
import {liveVoiceProfile} from '@/lib/live-voice-profile';
import {handleLiveVoiceEvent} from '@/lib/live-voice-transport';
import {signRelayPayload} from '@/lib/relay-token';
import {invalidRelayProbeToken} from '@/lib/voice-diagnostic';
import {voiceSelfProbe} from '@/lib/voice-self-probe';
export const dynamic='force-dynamic';export const maxDuration=60;
async function allPages(path:string){
 const rows:any[]=[];for(let page=1;page<=100;page++){
  const result=await telnyxApi(path+'?page[size]=100&page[number]='+page);rows.push(...(result.data??[]));
  if(!result.meta?.total_pages||page>=result.meta.total_pages)return rows;
 }throw Error('Provider listing exceeds preparation limit');
}
// Read-only readiness inspection. It never returns credentials or changes routing.
export async function GET(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 try{
 const [number,secrets]=await Promise.all([telnyxApi('/phone_numbers/3083500286304585102'),telnyxApi('/integration_secrets')]);
 return Response.json({number:number.data.phone_number,connectionId:number.data.connection_id,
  voiceSecretIdentifiers:(secrets.data??[]).map((s:any)=>s.identifier),xiConfigured:!!process.env.XI_API_KEY,
  released:process.env.LIVE_VOICE_ENABLED==='true'&&!process.env.LIVE_VOICE_ACCEPTANCE_PHONE,voice:liveVoiceProfile().name,voiceId:liveVoiceProfile().id,transport:'app-owned-conversation-relay',
  acceptanceRequired:['selected ElevenLabs voice on real call','played-text and end-of-playout events','uninterrupted review then explicit confirmation','production test-marked order visible in kitchen']},
  {headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Provider inspection failed'},{status:503});}
}
// Fixed preparation only: no phone purchases, arbitrary provider requests, or routing changes.
export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const body=await request.json().catch(()=>null);
 if(body?.action==='self-probe'){
  try{return Response.json(await voiceSelfProbe({number:process.env.TELNYX_PHONE_NUMBER??'',applicationId:process.env.LIVE_VOICE_APPLICATION_ID??'',sourceApplicationId:process.env.TELNYX_TEXML_APPLICATION_ID??'',restaurant:restaurantId(),socketUrl:process.env.RELAY_WEBSOCKET_URL??'',secretRef:process.env.ELEVENLABS_TELNYX_SECRET_REF??''}));}
  catch(error){return Response.json({error:error instanceof Error?error.message:'unknown',providerErrors:error instanceof TelnyxApiError?error.providerErrors:[]},{status:503});}
 }
 if(body?.action==='diagnose'){
  // Reproduce request validation only on an already ended acceptance call.
  // No live call, cart mutation, fallback speech, or valid relay token is used.
  const [call]=await client()`SELECT s.provider_call_id,s.caller_phone,d.state_json->'relayGrant' AS grant FROM call_sessions s JOIN draft_carts d ON d.session_id=s.id
  WHERE s.restaurant_id=${restaurantId()} AND s.state='ended' AND s.created_at>now()-interval '4 hours'
  AND s.ended_at<now()-interval '1 minute' AND d.state_json ? 'relayGrant' AND d.state_json->>'isAcceptanceTest'='true' ORDER BY s.created_at DESC LIMIT 1`;
  if(!call)return new Response('No ended acceptance call is available',{status:409});
  let requestSummary;try{
   await handleLiveVoiceEvent({event_type:'call.answered',payload:{call_control_id:call.provider_call_id,connection_id:process.env.LIVE_VOICE_APPLICATION_ID,from:call.caller_phone,to:process.env.TELNYX_PHONE_NUMBER}},{
    connectionId:process.env.LIVE_VOICE_APPLICATION_ID??'',number:process.env.TELNYX_PHONE_NUMBER??'',socketUrl:process.env.RELAY_WEBSOCKET_URL??'',secretRef:process.env.ELEVENLABS_TELNYX_SECRET_REF??'',
    acceptancePhone:process.env.LIVE_VOICE_ACCEPTANCE_PHONE?.trim(),
    open:async()=>{},admitted:async()=>true,token:async()=>invalidRelayProbeToken(signRelayPayload(call.grant)),ended:async()=>{},
    command:async(id,action,payload)=>{if(action==='conversation_relay_start'){requestSummary={urlLength:String(payload.url).length,greetingLength:String(payload.greeting).length};await telnyxApi('/calls/'+encodeURIComponent(id)+'/actions/'+action,'POST',payload);}}
   });return Response.json({endedCall:true,providerAccepted:true,liveCallStarted:false});
  }catch(error){return Response.json({endedCall:true,requestSummary,error:error instanceof Error?error.message:'unknown',providerErrors:error instanceof TelnyxApiError?error.providerErrors:[]});}
 }
 if(body?.action==='stage-acceptance'||body?.action==='rollback'){
  const appId=process.env.LIVE_VOICE_APPLICATION_ID?.trim();
  if(!appId||process.env.LIVE_VOICE_ENABLED!=='true'||!/^\+[1-9]\d{7,14}$/.test(process.env.LIVE_VOICE_ACCEPTANCE_PHONE??''))return new Response('Controlled acceptance is not configured',{status:409});
  try{
   return await client().begin(async tx=>{
   const configId='voice-preparation:'+restaurantId();await tx`SELECT pg_advisory_xact_lock(hashtext(${configId}))`;
   const [config]=await tx`SELECT provider FROM webhook_events WHERE event_id=${configId}`;
   if(config?.provider!==appId)return new Response('Application does not match saved preparation',{status:409});
   const number=(await telnyxApi('/phone_numbers/3083500286304585102')).data;
   if(number.phone_number!=='+15044979015')return new Response('Phone number mismatch',{status:409});
   const previous='3084387354371163718',desired=body.action==='rollback'?previous:appId;
   if(![previous,appId].includes(number.connection_id))return new Response('Number routing changed concurrently; no update applied',{status:409});
   if(number.connection_id!==desired)await telnyxApi('/phone_numbers/3083500286304585102','PATCH',{connection_id:desired});
   const verified=(await telnyxApi('/phone_numbers/3083500286304585102')).data;
   if(verified.connection_id!==desired)throw Error('Routing update did not verify');
   return Response.json({number:verified.phone_number,connectionId:verified.connection_id,acceptanceOnly:body.action!=='rollback',publicRealOrders:false});
   });
  }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Routing unavailable'},{status:503});}
 }
 if(body?.action!=='prepare')return new Response('Invalid action',{status:400});
 const xiKey=process.env.XI_API_KEY?.trim(),base=process.env.PUBLIC_APP_URL?.trim();
 if(!xiKey||!base)return new Response('Voice preparation is not configured',{status:503});
 try{
 const result=await client().begin(async tx=>{
 const configId='voice-preparation:'+restaurantId();
 await tx`SELECT pg_advisory_xact_lock(hashtext(${configId}))`;
 const identifier='restaurantcall-sarah-live';const secrets=await allPages('/integration_secrets');
 if(!secrets.some((s:any)=>s.identifier===identifier)){
  try{await telnyxApi('/integration_secrets','POST',{identifier,type:'bearer',token:xiKey});}
  catch(error){if(!(await allPages('/integration_secrets')).some((s:any)=>s.identifier===identifier))throw error;}
 }
 const name='RestaurantCall Sarah Live';const hook=base.replace(/\/$/,'')+'/api/telnyx/live-voice';
 const [saved]=await tx`SELECT provider FROM webhook_events WHERE event_id=${configId}`;
 const matches=saved?[(await telnyxApi('/call_control_applications/'+encodeURIComponent(saved.provider))).data]:(await allPages('/call_control_applications')).filter((a:any)=>a.application_name===name);
 if(matches.length>1)throw Error('Multiple matching voice applications; no application selected');
 let app=matches[0];
 if(app&&app.webhook_event_url!==hook)throw Error('Existing application webhook does not match; no change applied');
 if(!app){
  try{app=(await telnyxApi('/call_control_applications','POST',{application_name:name,webhook_event_url:hook,webhook_api_version:'2',active:true})).data;}
  catch(error){const recovered=(await allPages('/call_control_applications')).filter((a:any)=>a.application_name===name&&a.webhook_event_url===hook);if(recovered.length!==1)throw error;app=recovered[0];}
 }
 if(typeof app?.id!=='string'||!app.id)throw Error('Provider did not return an application ID');
 await tx`INSERT INTO webhook_events(event_id,provider) VALUES(${configId},${app.id}) ON CONFLICT(event_id) DO NOTHING`;
 return {prepared:true,applicationId:app.id,secretRef:identifier,numberRoutingChanged:false,released:false};
 });
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('LIVE_VOICE_PREPARATION_FAILURE',{reason:error instanceof Error?error.message:'unknown'});return Response.json({ok:false,error:error instanceof Error?error.message:'Preparation failed'},{status:503});}
}
