import {staffAuthorized,sameOrigin} from '@/lib/auth';import {client} from '@/lib/db/client';import {restaurantId} from '@/lib/repository';import {recordOrderEvent} from '@/lib/operations';
export async function PATCH(request:Request,{params}:{params:{orderId:string}}){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const body=await request.json().catch(()=>null);const minutes=body?.minutes;
 if(!Number.isInteger(minutes)||minutes<1||minutes>240)return Response.json({error:'Enter 1 to 240 minutes'},{status:400});
 const order=await client().begin(async tx=>{const [o]=await tx`SELECT id,status FROM orders WHERE id::text=${params.orderId} AND restaurant_id=${restaurantId()} FOR UPDATE`;if(!o)return null;if(!['confirmed','preparing'].includes(o.status))return null;
 const [saved]=await tx`UPDATE orders SET estimated_ready_at=now()+(${minutes}*interval '1 minute') WHERE id=${o.id} RETURNING estimated_ready_at`;
 await recordOrderEvent(tx,o.id,`estimate:${crypto.randomUUID()}`,'pickup_estimate_updated',{minutes},'staff');return saved;});
 return Response.json(order??{error:'Active order not found'},{status:order?200:404});
}
