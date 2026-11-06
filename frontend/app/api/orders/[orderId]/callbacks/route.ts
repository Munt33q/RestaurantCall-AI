import {staffAuthorized,sameOrigin} from '@/lib/auth';import {client} from '@/lib/db/client';import {restaurantId} from '@/lib/repository';import {recordOrderEvent} from '@/lib/operations';
export async function DELETE(request:Request,{params}:{params:{orderId:string}}){if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const found=await client().begin(async tx=>{const [order]=await tx`SELECT id FROM orders WHERE id::text=${params.orderId} AND restaurant_id=${restaurantId()} FOR UPDATE`;if(!order)return false;
 await tx`UPDATE orders SET callback_stages='[]',notification_consent_at=NULL,notification_channel='none' WHERE id=${order.id}`;
 await tx`UPDATE notification_jobs SET status='suppressed',last_error='Customer callback consent withdrawn',updated_at=now() WHERE order_id=${order.id} AND channel='call' AND status='pending'`;
 await recordOrderEvent(tx,order.id,'callbacks_revoked','callback_consent_withdrawn',{},'staff');return true;});
 return Response.json({revoked:found},{status:found?200:404});}
