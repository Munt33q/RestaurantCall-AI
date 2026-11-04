import {verifyTelnyxWebhook} from '@/lib/telnyx';
import {handleLiveVoiceEvent} from '@/lib/live-voice-transport';
import {telnyxApi,TelnyxApiError} from '@/lib/telnyx-api';
import {openVoiceSession} from '@/lib/repository';
import {issueLiveRelayToken} from '@/lib/relay-session';
import {applyCallStatus} from '@/lib/provider-events';
import {client} from '@/lib/db/client';
import {restaurantId} from '@/lib/repository';
import {onceVoiceEvent} from '@/lib/voice-event-replay';
import {recordModelEvents} from '@/lib/model-monitor';
import {VOICE_SELF_PROBE_STATE} from '@/lib/voice-self-probe';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
export async function POST(request:Request){
 const raw=await request.text();
 if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});
 if(process.env.LIVE_VOICE_ENABLED!=='true')return new Response('Live voice transport is not released',{status:503});
 let body;try{body=JSON.parse(raw);}catch{return new Response('Invalid event',{status:400});}
 if(!body?.data?.payload)return new Response('Invalid event',{status:400});
 const event=body.data,p=event.payload;
 if(p.connection_id!==process.env.LIVE_VOICE_APPLICATION_ID)return Response.json({ignored:true});
 if(typeof p.call_control_id!=='string'||!p.call_control_id||p.call_control_id.length>256)return new Response('Invalid call',{status:400});
 if(!['call.initiated','call.answered','call.hangup','call.conversation.ended','call.speak.ended'].includes(event.event_type))return Response.json({ignored:true});
 const started=Date.now();
 const selfProbe=p.client_state===VOICE_SELF_PROBE_STATE&&p.from===process.env.TELNYX_PHONE_NUMBER&&p.to===process.env.TELNYX_PHONE_NUMBER;
 try{
 const result=await onceVoiceEvent<Record<string,unknown>>(`voice-event:${restaurantId()}:${p.call_control_id}:${event.event_type}`,()=>selfProbe?Promise.resolve({diagnostic:true}):handleLiveVoiceEvent(event,{
  connectionId:process.env.LIVE_VOICE_APPLICATION_ID??'',number:process.env.TELNYX_PHONE_NUMBER??'',socketUrl:process.env.RELAY_WEBSOCKET_URL??'',secretRef:process.env.ELEVENLABS_TELNYX_SECRET_REF??'',
  acceptancePhone:process.env.LIVE_VOICE_ACCEPTANCE_PHONE?.trim()||undefined,
  admitted:async(id,phone)=>{const [session]=await client()`SELECT id FROM call_sessions WHERE provider_call_id=${id} AND restaurant_id=${restaurantId()} AND caller_phone=${phone} AND state<>'ended' AND expires_at>now()`;return !!session;},
  open:async(id,phone)=>{await openVoiceSession(id,phone,process.env.PUBLIC_APP_URL!);if(process.env.LIVE_VOICE_ACCEPTANCE_PHONE?.trim()===phone){await client()`UPDATE draft_carts d SET state_json=jsonb_set(d.state_json,'{isAcceptanceTest}','true'::jsonb),updated_at=now() FROM call_sessions s WHERE s.id=d.session_id AND s.provider_call_id=${id} AND s.restaurant_id=${restaurantId()}`;}},token:id=>issueLiveRelayToken(id,undefined,'call-control'),
  command:async(id,action,payload)=>{await telnyxApi('/calls/'+encodeURIComponent(id)+'/actions/'+action,'POST',payload);},
  ended:async(id,status)=>{
   await applyCallStatus(new URLSearchParams({CallControlId:id,CallStatus:status}));
   const [outcome]=await client()`SELECT o.id AS order_id,d.state_json->>'relayCompletionPlayed' AS receipt_played,
   d.state_json->>'phase' AS phase,jsonb_array_length(COALESCE(d.state_json->'items','[]'::jsonb)) AS item_count
   FROM call_sessions s JOIN draft_carts d ON d.session_id=s.id LEFT JOIN orders o ON o.session_id=s.id
   WHERE s.restaurant_id=${restaurantId()} AND s.provider_call_id=${id}`;
   if(outcome?.order_id&&outcome.receipt_played==='true')await recordModelEvents([{provider:'voice-transport',model:'conversation-relay',ok:true,ms:Date.now()-started},{provider:'voice-funnel',model:'checkout',ok:true,ms:0}]);
   else if(outcome&&!outcome.order_id&&outcome.item_count>0&&['name','payment','payment_link','notification','notes','confirm'].includes(outcome.phase))await recordModelEvents([{provider:'voice-funnel',model:'checkout',ok:false,ms:0,error:'checkout_abandoned'}]);
  }
 }));
 if(!selfProbe&&!('duplicate' in result)&&event.event_type==='call.conversation.ended'&&p.reason==='customer_disconnect')await recordModelEvents([{provider:'voice-transport',model:'conversation-relay',ok:false,ms:Date.now()-started,error:'relay_disconnected'}]);
 return Response.json(result);
 }catch(error){const reason=error instanceof Error?error.message:'unknown';console.error('LIVE_VOICE_FAILURE',{reason,providerErrors:error instanceof TelnyxApiError?error.providerErrors:undefined});
 if(reason!=='VOICE_EVENT_IN_PROGRESS')await recordModelEvents([{provider:'voice-transport',model:'conversation-relay',ok:false,ms:Date.now()-started,error:reason}]);
 return new Response('Voice transport unavailable',{status:503});}
}
