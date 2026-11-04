import {customerOrder} from '@/lib/operations';import Stripe from 'stripe';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:{token:string}}){const o=await customerOrder(params.token);if(!o)return new Response('Link invalid or expired',{status:404});const back=new URL('/track/'+encodeURIComponent(params.token),request.url);
 if(o.status!=='awaiting_payment'||o.payment_status!=='pending'||!o.checkout_session_id)return Response.redirect(back,303);
 const key=process.env.STRIPE_SECRET_KEY?.trim();if(!key)return new Response('Payment temporarily unavailable',{status:503});
 try{const session=await new Stripe(key,{timeout:7000,maxNetworkRetries:0}).checkout.sessions.retrieve(o.checkout_session_id);if(session.status!=='open'||!session.url)return Response.redirect(back,303);const url=new URL(session.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')return new Response('Invalid checkout destination',{status:502});return new Response(null,{status:303,headers:{Location:url.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch{return new Response('Payment temporarily unavailable',{status:503});}}
