import {recordOrderEvent,enqueueStatus} from './operations';
export function orderStatusResult(order:any,now=Date.now()){
 const ready=['ready','completed'].includes(order.status),cancelled=order.status==='cancelled';
 const deadline=order.estimated_ready_at?new Date(order.estimated_ready_at).getTime():NaN;
 const remaining=ready?0:!cancelled&&Number.isFinite(deadline)&&deadline>now?Math.ceil((deadline-now)/60000):null;
 return {ok:true,orderNumber:String(order.id).slice(0,8),status:order.status,statusLabel:({confirmed:'Pending restaurant acceptance',preparing:'In kitchen',ready:'Ready for pickup',completed:'Completed',cancelled:'Cancelled'} as Record<string,string>)[order.status]??order.status,remainingMinutes:remaining,estimatedReadyAt:!ready&&!cancelled&&Number.isFinite(deadline)?new Date(deadline).toISOString():null,estimateSource:remaining!==null&&!ready?'restaurant_staff':null,callbackStages:order.callback_stages??[],message:ready?'Your order is ready or completed.':cancelled?'Your order was cancelled.':remaining!==null?`The kitchen estimates approximately ${remaining} minutes remaining.`:'The kitchen has not supplied a current pickup estimate. Do not invent a time or treat an elapsed estimate as proof the food is ready.'};
}
export async function findCallerOrder(tx:any,session:any,number?:string){
 if(!/^\+[1-9]\d{7,14}$/.test(session.caller_phone??''))return null;
 const rows=number?await tx`SELECT * FROM orders WHERE restaurant_id=${session.restaurant_id} AND customer_phone=${session.caller_phone} AND (left(id::text,8)=${number.toLowerCase()} OR id::text=${number.toLowerCase()}) AND is_test=false ORDER BY created_at DESC LIMIT 2 FOR UPDATE`:await tx`SELECT * FROM orders WHERE restaurant_id=${session.restaurant_id} AND session_id=${session.id} AND customer_phone=${session.caller_phone} AND is_test=false FOR UPDATE`;
 return rows.length===1?rows[0]:null;
}
export async function saveOrderCallback(tx:any,order:any,stages:string[],consent:boolean){
 if(order.status==='cancelled')throw Error('Cancelled orders cannot receive callbacks');
 if(stages.length&&!consent)throw Error('Explicit callback consent required');
 if(['ready','completed'].includes(order.status)&&stages.includes('ready'))return {ok:false,code:'ALREADY_READY',message:'The order is already ready or completed; no future readiness callback was scheduled.'};
 const [saved]=await tx`UPDATE orders SET callback_stages=${tx.json(stages)},notification_channel=${stages.length?'call':'none'},notification_consent_at=${stages.length?new Date():null} WHERE id=${order.id} RETURNING *`;
 await tx`UPDATE notification_jobs SET status='suppressed',last_error='Callback preference changed',updated_at=now() WHERE order_id=${order.id} AND channel='call' AND status='pending' AND NOT (kind=ANY(${stages}))`;
 await recordOrderEvent(tx,order.id,`callback_preference:${crypto.randomUUID()}`,'callback_preference',{stages},'customer');await enqueueStatus(tx,saved);
 return {ok:true,orderNumber:String(order.id).slice(0,8),callbackStages:stages,consentRecorded:stages.length>0,deliveryEnabled:process.env.OUTBOUND_UPDATES_ENABLED==='true',message:process.env.OUTBOUND_UPDATES_ENABLED==='true'?'Your callback preference is saved.':'Your preference is saved, but outbound calls are not enabled. Do not promise a call.'};
}
