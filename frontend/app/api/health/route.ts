import {client} from '@/lib/db/client';
import {staffAuthorized} from '@/lib/auth';
import {smsDeliveryReady} from '@/lib/notification-contract';
export const dynamic='force-dynamic';
export async function GET(){
 const bindingEnabled=process.env.ELEVENLABS_SESSION_BINDING_ENABLED==='true',checkoutEnabled=process.env.ELEVENLABS_CHECKOUT_ENABLED==='true';
 const required=['DATABASE_URL','RESTAURANT_ID','STAFF_SESSION_SECRET','DEMO_STAFF_USERNAME','DEMO_STAFF_PASSWORD','PUBLIC_APP_URL'];
 if(bindingEnabled)required.push('ELEVENLABS_SESSION_BINDING_KEY','ELEVENLABS_AGENT_ID','ELEVENLABS_INBOUND_NUMBER','ELEVENLABS_TOOL_API_KEY','ELEVENLABS_POST_CALL_SECRET');
 else required.push('TELNYX_PUBLIC_KEY','TELNYX_API_KEY','TELNYX_PHONE_NUMBER');
 if(checkoutEnabled)required.push('CUSTOMER_CHECKOUT_SECRET');
 if(process.env.SMS_DELIVERY_ENABLED==='true'||process.env.OUTBOUND_UPDATES_ENABLED==='true')required.push('TELNYX_PUBLIC_KEY','TELNYX_API_KEY','TELNYX_PHONE_NUMBER');
 if(process.env.SMS_DELIVERY_ENABLED==='true')required.push('TELNYX_MESSAGING_PROFILE_ID');
 if(process.env.OUTBOUND_UPDATES_ENABLED==='true')required.push('TELNYX_TEXML_APPLICATION_ID');
 if(process.env.CASH_ONLY_CHECKOUT_ENABLED!=='true')required.push('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET');
 const missing=required.filter(k=>!process.env[k]?.trim());
 let databaseReady=false,restaurantReady=false,checkoutSchemaReady=false,databaseName:string|null=null;
 try{const [r]=await client()`SELECT current_database() AS name,to_regclass('public.payment_jobs') IS NOT NULL AS ready`;databaseReady=r.ready;databaseName=r.name;
 if(databaseReady&&process.env.RESTAURANT_ID){const rows=await client()`SELECT id FROM restaurants WHERE id::text=${process.env.RESTAURANT_ID.trim()} AND EXISTS(SELECT 1 FROM menu_items WHERE restaurant_id=restaurants.id)`;restaurantReady=!!rows.length;}}
 catch{databaseReady=false;}
 if(checkoutEnabled||bindingEnabled){try{const [r]=await client()`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='call_sessions' AND column_name='elevenlabs_binding_source') OR (table_name='draft_carts' AND column_name IN('checkout_code_hash','checkout_expires_at')))`;checkoutSchemaReady=r.n===3;}catch{checkoutSchemaReady=false;}}
 const ready=databaseReady&&restaurantReady&&!missing.length&&(!(bindingEnabled||checkoutEnabled)||checkoutSchemaReady);
 const result:any={status:ready?'ready':'degraded',databaseReady,restaurantReady,missing};
 if(staffAuthorized()){result.databaseName=databaseName;result.releaseConfiguration={bindingEnabled,checkoutEnabled,checkoutSchemaReady,cashOnly:process.env.CASH_ONLY_CHECKOUT_ENABLED==='true',orderingEnabled:process.env.RESTAURANT_ORDERING_ENABLED==='true',smsReady:smsDeliveryReady(),outboundCallsEnabled:process.env.OUTBOUND_UPDATES_ENABLED==='true',providerAcceptance:'Requires separately authorized real provider testing'};try{result.jobs=await client()`SELECT j.status,j.last_error AS error,count(*)::int AS count FROM payment_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id::text=${process.env.RESTAURANT_ID?.trim()??''} GROUP BY j.status,j.last_error`;}catch{result.jobs=[];}}
 return Response.json(result,{status:ready?200:503,headers:{'Cache-Control':'no-store'}});
}
