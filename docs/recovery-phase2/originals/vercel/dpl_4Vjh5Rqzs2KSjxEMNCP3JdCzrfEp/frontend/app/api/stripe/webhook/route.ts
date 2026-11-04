import Stripe from 'stripe';
import {waitUntil} from '@vercel/functions';import {processBackgroundJobs} from '@/lib/background-jobs';
import {applyStripeEvent} from '@/lib/repository';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){
 const key=process.env.STRIPE_SECRET_KEY?.trim(),secret=process.env.STRIPE_WEBHOOK_SECRET?.trim(),signature=request.headers.get('stripe-signature');
 if(!key||!secret)return new Response('Stripe webhook not configured',{status:503});
 if(!signature)return new Response('Missing signature',{status:400});
 let event:Stripe.Event;
 try{event=new Stripe(key).webhooks.constructEvent(await request.text(),signature,secret);}catch{return new Response('Invalid signature',{status:400});}
 try{const result=await applyStripeEvent(event);waitUntil(processBackgroundJobs());return Response.json({received:true,...result});}catch{console.error('Stripe event processing failed');return new Response('Webhook processing failed; retry later',{status:503});}
}
