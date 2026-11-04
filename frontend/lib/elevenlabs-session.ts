import crypto from 'node:crypto';
import {client} from './db/client';
import {restaurantId} from './repository';

export function validElevenLabsConversationId(value:string){
 return /^conv_[A-Za-z0-9]{8,128}$/.test(value);
}

export async function bindElevenLabsConversation(input:{conversationId:string;providerCallId:string}){
 if(!validElevenLabsConversationId(input.conversationId)||!input.providerCallId||input.providerCallId.length>256)throw Error('Invalid conversation binding');
 return client().begin(async tx=>{
  const [session]=await tx`SELECT id,caller_phone FROM call_sessions WHERE restaurant_id=${restaurantId()} AND provider_call_id=${input.providerCallId} AND state<>'ended' AND expires_at>now() FOR UPDATE`;
  if(!session)throw Error('Active call session not found');
  const [existing]=await tx`SELECT id FROM call_sessions WHERE restaurant_id=${restaurantId()} AND elevenlabs_conversation_id=${input.conversationId} AND id<>${session.id}`;
  if(existing)throw Error('Conversation is already bound');
  await tx`UPDATE call_sessions SET elevenlabs_conversation_id=${input.conversationId},updated_at=now() WHERE id=${session.id}`;
  return {sessionId:session.id,conversationId:input.conversationId,callerPhone:session.caller_phone};
 });
}

export function bindingRequestId(conversationId:string,providerCallId:string){
 return crypto.createHash('sha256').update(`${conversationId}:${providerCallId}`).digest('hex');
}
