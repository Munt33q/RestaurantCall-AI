import {verifyTelnyxWebhook} from '@/lib/telnyx';
import {applyMessagingEvent} from '@/lib/provider-events';
export async function POST(request:Request){const raw=await request.text();if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});try{return Response.json(await applyMessagingEvent(JSON.parse(raw)));}catch{return new Response('Processing unavailable',{status:503});}}
