import {boundedText,verifyElevenLabsSignature} from '@/lib/elevenlabs-security';
import {validElevenLabsConversationId} from '@/lib/elevenlabs-session';
import {restaurantId} from '@/lib/repository';
import {client} from '@/lib/db/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_SESSION_BINDING_ENABLED!=='true')return Response.json({error:'Disabled'},{status:503,headers});
 let raw:string;try{raw=await boundedText(request,1024*1024);}catch{return Response.json({error:'Invalid webhook body'},{status:413,headers});}
 if(!verifyElevenLabsSignature(raw,request.headers.get('elevenlabs-signature'),process.env.ELEVENLABS_POST_CALL_SECRET))return Response.json({error:'Unauthorized'},{status:401,headers});
 let event:any;try{event=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400,headers});}
 const data=event?.data;
 if(!['post_call_transcription','call_initiation_failure'].includes(event?.type)||data?.agent_id!==process.env.ELEVENLABS_AGENT_ID?.trim()||typeof data?.conversation_id!=='string'||!validElevenLabsConversationId(data.conversation_id)||event.type==='post_call_transcription'&&!['done','failed'].includes(data.status))return Response.json({ignored:true},{headers});
 try{
  // Do not store/log transcript, audio, analysis, secret dynamic variables or raw provider payload.
  const rows=await client()`UPDATE call_sessions SET state='ended',ended_at=COALESCE(ended_at,now()),outcome=COALESCE(outcome,${event.type==='call_initiation_failure'||data.status==='failed'?'elevenlabs_failed':'elevenlabs_completed'}),updated_at=now() WHERE restaurant_id=${restaurantId()} AND elevenlabs_conversation_id=${data.conversation_id} AND elevenlabs_agent_id=${data.agent_id} AND elevenlabs_binding_source='provider_initiation' AND ended_at IS NULL RETURNING id`;
  return Response.json({received:true,closed:rows.length>0},{headers});
 }catch{return Response.json({error:'Session update unavailable'},{status:503,headers});}
}
