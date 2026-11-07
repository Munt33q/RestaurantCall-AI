import {client} from './db/client';
import {recordOrderEvent} from './operations';

function config(){
 const token=process.env.CLOVER_API_TOKEN?.trim(),merchant=process.env.CLOVER_MERCHANT_ID?.trim(),base=(process.env.CLOVER_BASE_URL?.trim()||'https://api.clover.com').replace(/\/$/,'');
 if(!token||!merchant)throw new Error('Clover configuration missing');
 return {token,merchant,base};
}
async function request(path:string,init:RequestInit={},transport:typeof fetch=fetch,options:{retry5xx?:boolean}={}){
 const {token,base}=config();
 let response:Response|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await transport(`${base}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers??{})},signal:AbortSignal.timeout(10000)});}catch(error){if(attempt===2)throw error;}
  if(response&&response.status>=500&&options.retry5xx!==false&&attempt<2){await new Promise(r=>setTimeout(r,250*(attempt+1)));continue;}
  break;
 }
 if(!response)throw new Error('Clover request failed');
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(`Clover request ${response.status}`);
 return data;
}
export async function createCloverOrder(order:any,transport:typeof fetch){
 const {merchant}=config();
 let orderTypes:any;
 try{orderTypes=await request(`/v3/merchants/${merchant}/order_types`,{},transport);}catch{}
 const typeId=Array.isArray(orderTypes?.elements)&&orderTypes.elements[0]?.id?orderTypes.elements[0].id:undefined;
 const id8=String(order.id).slice(0,8);const prepaid=order.payment_status==='paid';
 let created:any;try{created=await request(`/v3/merchants/${merchant}/orders`,{method:'POST',body:JSON.stringify({note:`${prepaid?'PREPAID':'PAY AT PICKUP'} - RestaurantCall order ${id8}`,state:'open',title:`Phone Order ${id8}`,...(typeId?{orderType:{id:typeId}}:{})})},transport,{retry5xx:false});}catch(error){throw new Error(`Clover order creation outcome uncertain: ${error instanceof Error?error.message:'request failed'}`);}
 const cloverId=created?.id;
 if(typeof cloverId!=='string')throw new Error('Clover order id missing');
 return cloverId;
}
async function getCloverOrder(cloverId:string,transport:typeof fetch){const {merchant}=config();return request(`/v3/merchants/${merchant}/orders/${cloverId}?expand=lineItems`,{},transport);}
export function cloverOrderMatches(order:any,items:any[]){
 const actual=Array.isArray(order?.lineItems?.elements)?order.lineItems.elements:[];
 const wanted=items.map(i=>({name:i.item_name,price:Number(i.unit_price_cents),quantity:Number(i.quantity)}));
 return wanted.every(w=>actual.some((a:any)=>a.name===w.name&&Number(a.price)===w.price&&Number(a.quantity)===w.quantity)) && actual.reduce((n:number,a:any)=>n+Number(a.quantity??0),0)===wanted.reduce((n:number,w:any)=>n+w.quantity,0) && actual.reduce((n:number,a:any)=>n+Number(a.price??0)*Number(a.quantity??0),0)===wanted.reduce((n:number,w:any)=>n+w.price*w.quantity,0);
}
export async function submitCloverOrder(order:any,items:any[],transport:typeof fetch=fetch){
 const cloverId=await createCloverOrder(order,transport);
 for(const item of items)await request(`/v3/merchants/${config().merchant}/orders/${cloverId}/line_items`,{method:'POST',body:JSON.stringify({name:item.item_name,price:item.unit_price_cents,quantity:item.quantity})},transport,{retry5xx:false});
 return cloverId;
}
export async function runCloverJobs(orderId?:string,transport:typeof fetch=fetch){
 const sql=client();
 await sql`UPDATE clover_jobs SET status='pending',locked_until=NULL,next_attempt_at=now(),updated_at=now() WHERE status='dispatching' AND locked_until<now() AND order_id IN(SELECT id FROM orders WHERE restaurant_id=${process.env.RESTAURANT_ID?.trim()??''})`;
 await sql`INSERT INTO clover_jobs(order_id) SELECT o.id FROM orders o WHERE o.restaurant_id=${process.env.RESTAURANT_ID?.trim()??''} AND o.clover_order_id IS NULL AND o.status IN('confirmed','preparing','ready') AND (o.payment_status='paid' OR o.payment_method='cash') ON CONFLICT(order_id) DO NOTHING`;
 const restaurant=process.env.RESTAURANT_ID?.trim()??'';
 const jobs=await sql.begin(async tx=>{const rows=orderId?await tx`SELECT j.*,o.* FROM clover_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id=${restaurant} AND j.order_id=${orderId} AND j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) FOR UPDATE OF j SKIP LOCKED LIMIT 1`:await tx`SELECT j.*,o.* FROM clover_jobs j JOIN orders o ON o.id=j.order_id WHERE o.restaurant_id=${restaurant} AND j.status='pending' AND j.next_attempt_at<=now() AND (j.locked_until IS NULL OR j.locked_until<now()) ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 3`;for(const j of rows)await tx`UPDATE clover_jobs SET status='dispatching',attempts=attempts+1,locked_until=now()+interval '2 minutes',updated_at=now() WHERE order_id=${j.order_id}`;return rows;});
 for(const job of jobs){try{const items=await sql`SELECT item_name,unit_price_cents,quantity FROM order_items WHERE order_id=${job.order_id} ORDER BY id`;let cloverId=job.clover_order_id??null;if(!cloverId){cloverId=await createCloverOrder(job,transport);await sql`UPDATE orders SET clover_order_id=${cloverId} WHERE id=${job.order_id} AND clover_order_id IS NULL`;await sql`UPDATE clover_jobs SET provider_id=${cloverId},updated_at=now() WHERE order_id=${job.order_id}`;}
   let current=await getCloverOrder(cloverId,transport);if(!cloverOrderMatches(current,items)){for(const item of items){const present=(current?.lineItems?.elements??[]).some((a:any)=>a.name===item.item_name&&Number(a.price)===Number(item.unit_price_cents)&&Number(a.quantity)===Number(item.quantity));if(!present)await request(`/v3/merchants/${config().merchant}/orders/${cloverId}/line_items`,{method:'POST',body:JSON.stringify({name:item.item_name,price:item.unit_price_cents,quantity:item.quantity})},transport,{retry5xx:false});}current=await getCloverOrder(cloverId,transport);}if(!cloverOrderMatches(current,items))throw new Error('Clover order contents do not match Neon order');
   await sql.begin(async tx=>{await tx`UPDATE clover_jobs SET status='done',provider_id=${cloverId},locked_until=NULL,last_error=NULL,updated_at=now() WHERE order_id=${job.order_id}`;await recordOrderEvent(tx,job.order_id,`clover:${cloverId}`,'clover_submitted',{cloverOrderId:cloverId});});}catch(error){const message=(error instanceof Error?error.message:'Clover submission failed').slice(0,180);const status=message.includes('outcome uncertain')?'uncertain':(job.attempts>=5?'failed':'pending');await sql`UPDATE clover_jobs SET status=${status},locked_until=NULL,next_attempt_at=now()+interval '2 minutes',last_error=${message},updated_at=now() WHERE order_id=${job.order_id}`;}}
 return {processed:jobs.length};
}
