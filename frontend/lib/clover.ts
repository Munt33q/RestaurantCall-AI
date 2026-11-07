import {client} from './db/client';
import {recordOrderEvent} from './operations';

function config(){
 const token=process.env.CLOVER_API_TOKEN?.trim(),merchant=process.env.CLOVER_MERCHANT_ID?.trim(),base=(process.env.CLOVER_BASE_URL?.trim()||'https://apisandbox.dev.clover.com').replace(/\/$/,'');
 if(!token||!merchant)throw new Error('Clover configuration missing');
 return {token,merchant,base};
}
async function request(path:string,init:RequestInit={},transport:typeof fetch=fetch){
 const {token,base}=config();
 let response:Response|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await transport(`${base}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers??{})},signal:AbortSignal.timeout(10000)});}catch(error){if(attempt===2)throw error;}
  if(response&&response.status>=500&&attempt<2){await new Promise(r=>setTimeout(r,250*(attempt+1)));continue;}
  break;
 }
 if(!response)throw new Error('Clover request failed');
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(`Clover request ${response.status}`);
 return data;
}
export async function submitCloverOrder(order:any,items:any[],transport:typeof fetch=fetch){
 const {merchant}=config();
 let orderTypes:any;
 try{orderTypes=await request(`/v3/merchants/${merchant}/order_types`,{},transport);}catch{}
 const typeId=Array.isArray(orderTypes?.elements)&&orderTypes.elements[0]?.id?orderTypes.elements[0].id:undefined;
 const id8=String(order.id).slice(0,8);const prepaid=order.payment_status==='paid';
 const created=await request(`/v3/merchants/${merchant}/orders`,{method:'POST',body:JSON.stringify({note:`${prepaid?'PREPAID':'PAY AT PICKUP'} - RestaurantCall order ${id8}`,state:'open',title:`Phone Order ${id8}`,...(typeId?{orderType:{id:typeId}}:{})})},transport);
 const cloverId=created?.id;
 if(typeof cloverId!=='string')throw new Error('Clover order id missing');
 for(const item of items)await request(`/v3/merchants/${merchant}/orders/${cloverId}/line_items`,{method:'POST',body:JSON.stringify({name:item.item_name,price:item.unit_price_cents,quantity:item.quantity})},transport);
 return cloverId;
}
export async function runCloverJobs(orderId?:string,transport:typeof fetch=fetch){
 const sql=client();
 await sql`INSERT INTO clover_jobs(order_id) SELECT o.id FROM orders o WHERE o.restaurant_id=${process.env.RESTAURANT_ID?.trim()??''} AND o.clover_order_id IS NULL AND o.status NOT IN('awaiting_payment','cancelled') AND (o.payment_status='paid' OR o.payment_method='cash') ON CONFLICT(order_id) DO NOTHING`;
 const jobs=await sql.begin(async tx=>{const rows=orderId?await tx`SELECT j.*,o.* FROM clover_jobs j JOIN orders o ON o.id=j.order_id WHERE j.order_id=${orderId} AND j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) FOR UPDATE OF j SKIP LOCKED LIMIT 1`:await tx`SELECT j.*,o.* FROM clover_jobs j JOIN orders o ON o.id=j.order_id WHERE j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 3`;for(const j of rows)await tx`UPDATE clover_jobs SET status='dispatching',attempts=attempts+1,locked_until=now()+interval '2 minutes',updated_at=now() WHERE order_id=${j.order_id}`;return rows;});
 for(const job of jobs){try{const items=await sql`SELECT item_name,unit_price_cents,quantity FROM order_items WHERE order_id=${job.order_id} ORDER BY id`;const cloverId=await submitCloverOrder(job,items,transport);await sql.begin(async tx=>{await tx`UPDATE orders SET clover_order_id=${cloverId} WHERE id=${job.order_id} AND clover_order_id IS NULL`;await tx`UPDATE clover_jobs SET status='done',provider_id=${cloverId},locked_until=NULL,last_error=NULL,updated_at=now() WHERE order_id=${job.order_id}`;await recordOrderEvent(tx,job.order_id,`clover:${cloverId}`,'clover_submitted',{cloverOrderId:cloverId});});}catch(error){await sql`UPDATE clover_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,locked_until=NULL,next_attempt_at=now()+interval '2 minutes',last_error=${(error instanceof Error?error.message:'Clover submission failed').slice(0,180)},updated_at=now() WHERE order_id=${job.order_id}`;}}
 return {processed:jobs.length};
}
