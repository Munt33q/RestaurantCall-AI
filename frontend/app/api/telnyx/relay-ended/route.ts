import {waitUntil} from '@vercel/functions';import {runRecoveryJobs} from '@/lib/engagement/recovery-worker';
import {verifyRelayToken} from '@/lib/relay-token';
import {finishCallSession} from '@/lib/operations';
import {phasePrompt} from '@/lib/voice-intents';
import {issueLiveRelayToken} from '@/lib/relay-session';
import {relayVoiceXml} from '@/lib/relay-xml';
import {verifyTelnyxWebhook} from '@/lib/telnyx';
import {voiceContext} from '@/lib/repository';
import {voiceXml} from '@/lib/voice-xml';
export async function POST(request:Request){
 const raw=await request.text();if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});
 const form=new URLSearchParams(raw),callId=form.get('CallSid')||form.get('CallControlId');if(!callId)return new Response('Missing call',{status:400});
 const ended=verifyRelayToken(new URL(request.url).searchParams.get('endedToken')??'');
 if(!ended||ended.callId!==callId||ended.mode!=='live')return new Response('Invalid ended relay',{status:401});
 const state=await voiceContext(callId);
 if(state&&state.phase!=='complete'&&!state.relayEndRequested&&process.env.RELAY_ENABLED==='true'&&process.env.RELAY_WEBSOCKET_URL&&!['completed','failed','busy','no-answer'].includes(form.get('CallStatus')??'')){
  const greeting='We are reconnected. Your draft is saved. '+phasePrompt(state);
  try{const token=await issueLiveRelayToken(callId,ended.nonce);return new Response(relayVoiceXml(process.env.RELAY_WEBSOCKET_URL,token,new URL(request.url).origin,greeting),{headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}});}catch{}
 }
 await finishCallSession(callId,state?.phase==='complete'?'order_submitted':'call_ended_without_order');
 if(process.env.DRAFT_RECOVERY_ENABLED==='true')waitUntil(runRecoveryJobs());
 const message=state?.phase==='complete'?'Thank you for your order. Goodbye.':'The voice connection ended. Your draft has not been submitted. Please call again so we can help you finish.';
 return new Response(voiceXml(message,new URL(request.url).origin,0,true),{headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}});
}
