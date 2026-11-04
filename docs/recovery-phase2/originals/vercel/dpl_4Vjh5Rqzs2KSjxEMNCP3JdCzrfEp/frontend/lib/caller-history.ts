import {client} from './db/client';
export function normalizedCaller(phone:unknown){if(typeof phone!=='string')return null;const clean=phone.replace(/[\s().-]/g,'');return /^\+[1-9]\d{7,14}$/.test(clean)?clean:null;}
export async function callerOrderHistory(restaurant:string,phone:unknown,excludeSession?:string,sql:any=client()){
 const number=normalizedCaller(phone);if(!number)return {known:false,previousOrders:null,paidOrCompleted:null,lastOrderAt:null};
 const [r]=await sql`SELECT count(*)::int AS count,count(*) FILTER(WHERE o.payment_status='paid' OR o.status='completed')::int AS paid,max(o.created_at) AS latest FROM orders o JOIN call_sessions s ON s.id=o.session_id AND s.restaurant_id=o.restaurant_id WHERE o.restaurant_id=${restaurant} AND o.customer_phone=${number} AND o.is_test=false AND o.status IN('confirmed','preparing','ready','completed') AND (${excludeSession??null}::uuid IS NULL OR s.id<>${excludeSession??null}::uuid)`;
 return {known:true,previousOrders:r.count,paidOrCompleted:r.paid,lastOrderAt:r.latest?new Date(r.latest).toISOString():null};
}
