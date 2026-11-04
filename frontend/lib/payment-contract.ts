export function paymentDecision(eventType:string,session:{id:string;metadata?:Record<string,string>|null;amount_total?:number|null;currency?:string|null;payment_status?:string},order:{id:string;totalCents:number;status:string;paymentStatus:string;checkoutSessionId:string|null}):'paid'|'expired'|'ignore'{
 if(session.metadata?.orderId!==order.id||session.id!==order.checkoutSessionId||session.amount_total!==order.totalCents||session.currency!=='usd'||order.paymentStatus==='paid'||order.status!=='awaiting_payment')return 'ignore';
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(eventType)&&session.payment_status==='paid')return 'paid';
 if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(eventType))return 'expired';
 return 'ignore';
}
// Fixed checkout expiry is created_at + 60 minutes. Stop creating sessions with
// less than 31 minutes remaining, preserving identical Stripe idempotency data.
export function checkoutPolicy(createdAt:Date,now=new Date()):'create'|'expire'{return now.getTime()-createdAt.getTime()>=29*60*1000?'expire':'create';}
