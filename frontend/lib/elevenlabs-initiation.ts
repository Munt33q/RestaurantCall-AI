import {client} from './db/client';
import {restaurantId} from './repository';
import {validElevenLabsConversationId} from './elevenlabs-session';
import {callToolKey} from './elevenlabs-security';
import {telephoneEnabled,telephoneHandoffSecret} from './telephone-checkout-config';

export type Initiation={conversation_id:string;agent_id:string;caller_id:string;called_number:string;call_sid:string;call_id?:string};
export function validateInitiation(body:unknown,controlledOnly=true):Initiation{
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid initiation');
 const b=body as Record<string,unknown>;
 if(typeof b.conversation_id!=='string'||!validElevenLabsConversationId(b.conversation_id))throw Error('Invalid conversation');
 if(typeof b.agent_id!=='string'||b.agent_id!==process.env.ELEVENLABS_AGENT_ID?.trim())throw Error('Unexpected agent');
 if(typeof b.called_number!=='string'||b.called_number!==process.env.ELEVENLABS_INBOUND_NUMBER?.trim()||!/^\+[1-9]\d{7,14}$/.test(b.called_number))throw Error('Unexpected destination');
 if(typeof b.caller_id!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.caller_id)||b.caller_id===b.called_number)throw Error('Valid inbound caller required');
 if(controlledOnly&&process.env.VERCEL_ENV==='preview'&&!process.env.ELEVENLABS_ACCEPTANCE_CALLERS?.split(',').map(x=>x.trim()).includes(b.caller_id))throw Error('Preview accepts only controlled caller numbers');
 if(typeof b.call_sid!=='string'||!b.call_sid.trim()||b.call_sid.length>256||/[\x00-\x20]/.test(b.call_sid))throw Error('Provider call identifier required');
 if(b.call_id!==undefined&&(typeof b.call_id!=='string'||!b.call_id||b.call_id.length>256||/[\x00-\x20]/.test(b.call_id)))throw Error('Invalid SIP call identifier');
 return b as Initiation;
}
// Only the authenticated provider initiation route calls this function. No model identity fields.
export async function initiateElevenLabsCall(body:Initiation){
 const key=callToolKey(body.conversation_id,body.call_sid),rid=restaurantId();
 await client().begin(async tx=>{
  await tx`INSERT INTO call_sessions(restaurant_id,provider_call_id,caller_phone,elevenlabs_conversation_id,elevenlabs_agent_id,elevenlabs_called_number,elevenlabs_binding_source,expires_at) VALUES(${rid},${body.call_sid},${body.caller_id},${body.conversation_id},${body.agent_id},${body.called_number},'provider_initiation',now()+interval '30 minutes') ON CONFLICT DO NOTHING`;
  const [s]=await tx`SELECT * FROM call_sessions WHERE provider_call_id=${body.call_sid} FOR UPDATE`;
  if(!s||s.restaurant_id!==rid||s.caller_phone!==body.caller_id||s.elevenlabs_conversation_id!==body.conversation_id||s.elevenlabs_agent_id!==body.agent_id||s.elevenlabs_called_number!==body.called_number||s.elevenlabs_binding_source!=='provider_initiation'||s.state!=='active'||s.ended_at||new Date(s.expires_at).getTime()<=Date.now())throw Error('Call identity conflict or expired call');
  await tx`INSERT INTO draft_carts(session_id) VALUES(${s.id}) ON CONFLICT DO NOTHING`;
 });
 const dynamic_variables:Record<string,string>={secret__restaurant_session:key};
 if(telephoneEnabled()){
  try{dynamic_variables.secret__restaurant_handoff=telephoneHandoffSecret(body.conversation_id,body.call_sid);}catch{/* Unconfigured telephone handoff retains the web fallback. */}
 }
 return {type:'conversation_initiation_client_data',dynamic_variables};
}
