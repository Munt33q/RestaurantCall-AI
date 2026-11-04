import {recoveryEnabled} from '@/lib/engagement/recovery-store';
import {issueLiveRelayToken} from '@/lib/relay-session';
import {relayVoiceXml} from '@/lib/relay-xml';
import { openVoiceSession } from '@/lib/repository';
import { verifyTelnyxWebhook } from '@/lib/telnyx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const raw=await request.text();
 if(!process.env.TELNYX_PUBLIC_KEY?.trim())return new Response('Telnyx webhook verification is not configured',{status:503});
 if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});
 const form=new URLSearchParams(raw);const id=form.get('CallSid')||form.get('CallControlId');
 if(!id)return new Response('Missing call identifier',{status:400});
 try{const base=process.env.PUBLIC_APP_URL?.trim()||new URL(request.url).origin;let xml=await openVoiceSession(id,form.get('From')??undefined,base);if(process.env.RELAY_ENABLED==='true'&&process.env.RELAY_WEBSOCKET_URL?.trim())xml=relayVoiceXml(process.env.RELAY_WEBSOCKET_URL.trim(),await issueLiveRelayToken(id),base,recoveryEnabled()?"RestaurantCall AI. How can I help you today? If you have a saved-draft recovery code, say resume followed by the eight digits.":undefined);return new Response(xml,{headers:{'content-type':'application/xml','cache-control':'no-store'}});}
 catch{console.error('Voice session could not be opened');return new Response('Ordering temporarily unavailable',{status:503});}
}
