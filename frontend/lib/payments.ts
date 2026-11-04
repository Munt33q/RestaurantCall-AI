import Stripe from 'stripe';
import {enqueuePaymentSms,recordOrderEvent} from './operations';
import {client} from './db/client';
import {restaurantId,applyStripeEvent} from './repository';
import {checkoutPolicy} from './payment-contract';
export async function runPaymentJobs(orderId?:string){
 const sql=client();
 // Expire orders which never obtained a Checkout Session, even if jobs failed.
 await sql.begin(async tx=>{
  const expired=await tx`SELECT * FROM orders WHERE restaurant_id=${restaurantId()} AND status='awaiting_payment' AND checkout_session_id IS NULL AND created_at<now()-interval '29 minutes' AND NOT EXISTS(SELECT 1 FROM payment_jobs j WHERE j.order_id=orders.id AND j.locked_until>now()) ORDER BY id FOR UPDATE`;
  for(const order of expired){
   if(order.stock_reserved){const lines=await tx`SELECT menu_item_id,quantity FROM order_items WHERE order_id=${order.id} ORDER BY menu_item_id`;for(const line of lines)await tx`UPDATE menu_items SET stock_qty=stock_qty+${line.quantity},version=version+1 WHERE id=${line.menu_item_id} AND stock_qty IS NOT NULL`;}
   await tx`UPDATE orders SET status='cancelled',payment_status='expired',stock_reserved=false WHERE id=${order.id}`;await recordOrderEvent(tx,order.id,'setup_expired','payment_expired');
   await tx`UPDATE payment_jobs SET status='done',locked_until=NULL,last_error='Payment setup expired; reservation released' WHERE order_id=${order.id}`;
  }
 });
 // Reconcile old sessions if a webhook was delayed or lost. This is an
 // authenticated Stripe API read; it never assumes an unpaid session expired.
 const overdue=await sql`SELECT id,checkout_session_id FROM orders WHERE restaurant_id=${restaurantId()} AND status='awaiting_payment' AND checkout_session_id IS NOT NULL AND created_at<now()-interval '61 minutes' LIMIT 10`;
 for(const order of overdue){try{
  const key=process.env.STRIPE_SECRET_KEY?.trim();if(!key)continue;
  const session=await new Stripe(key,{timeout:8000,maxNetworkRetries:0}).checkout.sessions.retrieve(order.checkout_session_id);
  const type=session.payment_status==='paid'?'checkout.session.completed':session.status==='expired'?'checkout.session.expired':null;
  if(type)await applyStripeEvent({id:`api-reconcile:${session.id}:${type}`,type,data:{object:session}} as unknown as Stripe.Event);
 }catch{console.error('Checkout reconciliation temporarily unavailable');}}
 const claimed=await sql.begin(async tx=>{
  const rows=orderId?await tx`SELECT j.order_id FROM payment_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id=${restaurantId()} AND j.order_id=${orderId} AND j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) FOR UPDATE OF j SKIP LOCKED LIMIT 1`:await tx`SELECT j.order_id FROM payment_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id=${restaurantId()} AND j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) FOR UPDATE OF j SKIP LOCKED LIMIT 2`;
  for(const r of rows)await tx`UPDATE payment_jobs SET locked_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE order_id=${r.order_id}`;
  return rows;
 });
 for(const job of claimed){
  try{
   const [order]=await sql`SELECT * FROM orders WHERE id=${job.order_id}`;
   if(!order||order.status!=='awaiting_payment'){await sql`UPDATE payment_jobs SET status='done',locked_until=NULL WHERE order_id=${job.order_id}`;continue;}
   const key=process.env.STRIPE_SECRET_KEY?.trim();const base=process.env.PUBLIC_APP_URL?.trim();
   if(!key||!base)throw new Error('Stripe or public app URL missing');
   if(!order.checkout_session_id){
    if(checkoutPolicy(new Date(order.created_at))==='expire')throw new Error('Checkout creation window expired; reservation will be released');
    const stripe=new Stripe(key,{timeout:8000,maxNetworkRetries:0});
    const session=await stripe.checkout.sessions.create({mode:'payment',allowed_payment_method_types:['card'],line_items:[{price_data:{currency:'usd',unit_amount:order.total_cents,product_data:{name:`RestaurantCall order ${order.id.slice(0,8)} (tax included)`}},quantity:1}],metadata:{orderId:order.id},client_reference_id:order.id,success_url:`${base}/payment-result?result=received`,cancel_url:`${base}/payment-result?result=cancelled`,expires_at:Math.floor(new Date(order.created_at).getTime()/1000)+3600},{idempotencyKey:`checkout-${order.id}`});
    await sql`UPDATE orders SET checkout_session_id=${session.id},checkout_url=${session.url??null} WHERE id=${order.id}`;
    order.checkout_url=session.url;
   }
   await sql.begin(async tx=>{
    if(order.payment_sms_consent){await enqueuePaymentSms(tx,order);await tx`UPDATE orders SET sms_status=CASE WHEN sms_status='not_requested' THEN 'queued' ELSE sms_status END WHERE id=${order.id}`;}
    else await tx`UPDATE orders SET sms_status=CASE WHEN sms_status='not_requested' THEN 'not_consented' ELSE sms_status END WHERE id=${order.id}`;
    await recordOrderEvent(tx,order.id,'checkout_created','checkout_available');
    await tx`UPDATE payment_jobs SET status='done',locked_until=NULL,last_error=NULL WHERE order_id=${order.id}`;
   });
  }catch(error){
   const message=error instanceof Error?error.message:'Payment setup failed';
   await sql`UPDATE payment_jobs SET locked_until=NULL,next_attempt_at=now()+interval '2 minutes',last_error=${message.slice(0,180)},status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,updated_at=now() WHERE order_id=${job.order_id}`;
  }
 }
 return {processed:claimed.length};
}

export async function retryPaymentJobs(){
 await client()`UPDATE payment_jobs SET status='pending',attempts=0,next_attempt_at=now() WHERE status='failed' AND order_id IN (SELECT id FROM orders WHERE restaurant_id=${restaurantId()} AND status='awaiting_payment')`;
 return runPaymentJobs();
}
