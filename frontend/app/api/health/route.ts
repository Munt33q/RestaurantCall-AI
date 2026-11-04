import {client} from '@/lib/db/client';
import {staffAuthorized} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){
 const missing=['DATABASE_URL','RESTAURANT_ID','STAFF_SESSION_SECRET','DEMO_STAFF_USERNAME','DEMO_STAFF_PASSWORD','TELNYX_PUBLIC_KEY','TELNYX_API_KEY','TELNYX_PHONE_NUMBER','PUBLIC_APP_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'].filter(k=>!process.env[k]?.trim());
 let databaseReady=false,restaurantReady=false,databaseName:string|null=null;
 try{const [r]=await client()`SELECT current_database() AS name,to_regclass('public.payment_jobs') IS NOT NULL AS ready`;databaseReady=r.ready;databaseName=r.name;
 if(databaseReady&&process.env.RESTAURANT_ID){const rows=await client()`SELECT id FROM restaurants WHERE id::text=${process.env.RESTAURANT_ID.trim()} AND EXISTS(SELECT 1 FROM menu_items WHERE restaurant_id=restaurants.id)`;restaurantReady=!!rows.length;}}
 catch{databaseReady=false;}
 const ready=databaseReady&&restaurantReady&&!missing.length;
 const result:any={status:ready?'ready':'degraded',databaseReady,restaurantReady,missing};
 if(staffAuthorized()){result.databaseName=databaseName;try{result.jobs=await client()`SELECT j.status,j.last_error AS error,count(*)::int AS count FROM payment_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id::text=${process.env.RESTAURANT_ID?.trim()??''} GROUP BY j.status,j.last_error`;}catch{result.jobs=[];}}
 return Response.json(result,{status:ready?200:503,headers:{'Cache-Control':'no-store'}});
}
