import {verifyTelnyxWebhook} from '@/lib/telnyx';
import {boundedText} from '@/lib/elevenlabs-security';
import {telephoneConfig} from '@/lib/telephone-checkout-config';
import {validateTelephoneEvent,applyTelephoneEvent} from '@/lib/telephone-checkout';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:Request){
 try{telephoneConfig();}catch{return Response.json({error:'Telephone confirmation is not enabled'},{status:503});}
 let raw:string;try{raw=await boundedText(request,65536);}catch{return new Response('Invalid body',{status:413});}
 if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});
 let body;try{body=JSON.parse(raw);}catch{return new Response('Invalid event',{status:400});}
 const event=validateTelephoneEvent(body);if(!event)return new Response('Invalid event',{status:400});
 try{return Response.json(await applyTelephoneEvent(event),{headers:{'Cache-Control':'no-store'}});}
 catch{console.error('TELEPHONE_CHECKOUT_UNAVAILABLE');return new Response('Confirmation unavailable; no success asserted',{status:503});}
}
