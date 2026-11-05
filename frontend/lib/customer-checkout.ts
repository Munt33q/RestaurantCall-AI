import crypto from 'node:crypto';
import {client} from './db/client';
import {restaurantId,insertOrder} from './repository';
import {normalizeLines} from './order-contract';
import {promotionQuote} from './catalog-policy';
import {promotionRow} from './catalog-store';
import {recordOrderEvent} from './operations';

export class CheckoutError extends Error{constructor(public status:number,message:string){super(message);}}
export const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
export const normalizeReviewCode=(value:string)=>value.replace(/[\s-]/g,'').toLowerCase();
export const checkoutEnabled=()=>process.env.ELEVENLABS_CHECKOUT_ENABLED==='true'&&process.env.RESTAURANT_ORDERING_ENABLED==='true';
function signingKey(){const k=process.env.CUSTOMER_CHECKOUT_SECRET?.trim();if(!k||k.length<32)throw new CheckoutError(503,'Customer confirmation is not configured');return k;}
type Review={restaurantName:string;customerName:string;customerPhone:string;notes:string;paymentMethod:'cash';items:{itemId:string;name:string;priceCents:number;quantity:number}[];quote:ReturnType<typeof promotionQuote>};
type BrowserGrant={aud:'customer-review-v1';restaurantId:string;sessionId:string;codeHash:string;reviewHash:string;version:number;csrf:string;exp:number};
export function sealReviewGrant(grant:BrowserGrant){const body=Buffer.from(JSON.stringify(grant)).toString('base64url');return body+'.'+crypto.createHmac('sha256',signingKey()).update(body).digest('base64url');}
export function openReviewGrant(token:string):BrowserGrant{
 try{
  if(token.length>2048)throw Error();const [body,sig,...extra]=token.split('.');if(extra.length||!sig)throw Error();
  const a=Buffer.from(sig,'base64url'),b=crypto.createHmac('sha256',signingKey()).update(body).digest();if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error();
  const g=JSON.parse(Buffer.from(body,'base64url').toString());
  if(g.aud!=='customer-review-v1'||g.restaurantId!==restaurantId()||!Number.isInteger(g.version)||!Number.isFinite(g.exp)||g.exp<=Date.now()||g.exp>Date.now()+10*60000||!['sessionId','codeHash','reviewHash','csrf'].every(k=>typeof g[k]==='string'&&g[k].length>0))throw Error();
  return g;
 }catch{throw new CheckoutError(401,'Review expired. Ask Brittany for a new review code.');}
}
async function snapshot(tx:any,session:any,state:any):Promise<Review>{
 if(typeof state.customerName!=='string'||!state.customerName.trim()||state.customerName.length>120||state.notesCollected!==true)throw new CheckoutError(409,'Confirm your pickup name and special instructions with Brittany first.');
 if(!/^\+[1-9]\d{7,14}$/.test(session.caller_phone??''))throw new CheckoutError(409,'Verified caller number required');
 const lines=normalizeLines(state.items),rid=restaurantId();
 const [restaurant]=await tx`SELECT name,tax_rate_bps FROM restaurants WHERE id=${rid} FOR UPDATE`;
 if(!restaurant)throw new CheckoutError(409,'Restaurant unavailable');
 const rows=await tx`SELECT * FROM menu_items WHERE restaurant_id=${rid} ORDER BY id FOR UPDATE`;
 const now=Date.now();
 const items=lines.map(l=>{const m=rows.find((x:any)=>x.id===l.menuItemId);if(!m||m.archived||!m.is_available||(m.stock_qty!==null&&m.stock_qty<l.quantity)||(m.special&&((m.special_starts_at&&new Date(m.special_starts_at).getTime()>now)||(m.special_ends_at&&new Date(m.special_ends_at).getTime()<=now))))throw new CheckoutError(409,'An item is no longer available. Update the order with Brittany.');return {itemId:m.id,name:m.name,priceCents:m.price_cents,quantity:l.quantity};});
 const promotions=(await tx`SELECT * FROM promotions WHERE restaurant_id=${rid}`).map(promotionRow);
 return {restaurantName:restaurant.name,customerName:state.customerName.trim(),customerPhone:session.caller_phone,notes:state.notes??'',paymentMethod:'cash',items,quote:promotionQuote(items,restaurant.tax_rate_bps,promotions)};
}
function active(session:any){if(session.elevenlabs_binding_source!=='provider_initiation'||session.state!=='active'||session.ended_at||new Date(session.expires_at).getTime()<=Date.now())throw new CheckoutError(409,'The call is no longer active. Please call again.');}
export async function issueCustomerReview(tx:any,session:any,draft:any){
 if(!checkoutEnabled())throw new CheckoutError(503,'Customer checkout is awaiting activation');
 signingKey();active(session);
 const review=await snapshot(tx,session,draft.state_json),code=crypto.randomBytes(10).toString('hex');
 const expires=new Date(Math.min(Date.now()+10*60000,new Date(session.expires_at).getTime()));
 const state={...draft.state_json,customerReview:review,customerReviewHash:digest(JSON.stringify(review)),elevenlabsPreviewOnly:false,paymentMethod:'cash',relayReviewReady:false};
 await tx`UPDATE draft_carts SET state_json=${tx.json(state)},checkout_code_hash=${digest(code)},checkout_expires_at=${expires},updated_at=now() WHERE session_id=${session.id}`;
 const base=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:process.env.PUBLIC_APP_URL?.trim();if(!base)throw new CheckoutError(503,'Restaurant website is not configured');
 const url=new URL('/confirm',base);if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new CheckoutError(503,'Secure restaurant website required');
 return {ok:true,orderCreated:false,confirmationRequired:'customer_web_review',confirmationUrl:url.toString(),reviewCode:code.match(/.{4}/g)!.join('-'),expiresAt:expires.toISOString(),review,message:'Ask the customer to open the restaurant confirmation page and enter this code. They must review and submit there. No order exists until the website confirms it.'};
}
export async function exchangeCustomerReview(code:string){
 if(!checkoutEnabled())throw new CheckoutError(503,'Customer checkout is awaiting activation');
 code=normalizeReviewCode(code);if(!/^[a-f0-9]{20}$/.test(code))throw new CheckoutError(404,'Invalid or expired review code');
 const sql=client(),rid=restaurantId();
 return sql.begin(async tx=>{
  const [found]=await tx`SELECT s.id FROM call_sessions s JOIN draft_carts d ON d.session_id=s.id WHERE s.restaurant_id=${rid} AND d.checkout_code_hash=${digest(code)}`;
  if(!found)throw new CheckoutError(404,'Invalid or expired review code');
  const [s]=await tx`SELECT * FROM call_sessions WHERE id=${found.id} AND restaurant_id=${rid} FOR UPDATE`;
  active(s);
  const [d]=await tx`SELECT * FROM draft_carts WHERE session_id=${s.id} FOR UPDATE`;
  if(d.checkout_code_hash!==digest(code))throw new CheckoutError(404,'Invalid or expired review code');
  if(!d.checkout_expires_at||new Date(d.checkout_expires_at).getTime()<=Date.now())throw new CheckoutError(409,'Review expired');
  if((await tx`SELECT id FROM orders WHERE session_id=${s.id}`).length)throw new CheckoutError(409,'Order already placed. Ask Brittany for its number.');
  const review=await snapshot(tx,s,d.state_json),hash=digest(JSON.stringify(review));
  if(hash!==d.state_json.customerReviewHash)throw new CheckoutError(409,'Order or pricing changed. Ask Brittany for a fresh review.');
  const grant:BrowserGrant={aud:'customer-review-v1',restaurantId:rid,sessionId:s.id,codeHash:digest(code),reviewHash:hash,version:d.version,csrf:crypto.randomBytes(24).toString('base64url'),exp:new Date(d.checkout_expires_at).getTime()};
  // The review is returned only to the browser; the model cannot submit via a server tool.
  return {review:{...review,customerPhone:review.customerPhone.replace(/.(?=.{4})/g,'•')},csrf:grant.csrf,cookie:sealReviewGrant(grant)};
 });
}
export type CustomerConfirmation={csrf:string;reviewAccepted:true;nameConfirmed:true;channel:'none'|'sms'|'call';consent:boolean};
export function validateCustomerConfirmation(value:unknown):CustomerConfirmation{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new CheckoutError(400,'Explicit customer review required');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['csrf','reviewAccepted','nameConfirmed','channel','consent'].includes(k))||typeof v.csrf!=='string'||v.reviewAccepted!==true||v.nameConfirmed!==true||!['none','sms','call'].includes(String(v.channel))||typeof v.consent!=='boolean'||(v.channel!=='none'&&!v.consent))throw new CheckoutError(400,'Confirm the complete review, pickup name and notification choice');
 return v as CustomerConfirmation;
}
export async function confirmCustomerReview(cookie:string,input:CustomerConfirmation){
 if(!checkoutEnabled())throw new CheckoutError(503,'Customer checkout is awaiting activation');
 input=validateCustomerConfirmation(input);
 const g=openReviewGrant(cookie);if(input.csrf!==g.csrf)throw new CheckoutError(403,'Invalid browser confirmation');
 return client().begin(async tx=>{
  const [s]=await tx`SELECT * FROM call_sessions WHERE id=${g.sessionId} AND restaurant_id=${g.restaurantId} FOR UPDATE`;
  if(!s)throw new CheckoutError(404,'Session unavailable');
  const [d]=await tx`SELECT * FROM draft_carts WHERE session_id=${s.id} FOR UPDATE`;
  const [existing]=await tx`SELECT * FROM orders WHERE session_id=${s.id} AND restaurant_id=${g.restaurantId}`;
  if(existing){if(d.state_json.customerConfirmation?.codeHash!==g.codeHash||d.state_json.customerConfirmation?.reviewHash!==g.reviewHash)throw new CheckoutError(409,'Confirmation does not match the saved order');return receipt(existing);}
  active(s);
  if(d.version!==g.version||d.checkout_code_hash!==g.codeHash||!d.checkout_expires_at||new Date(d.checkout_expires_at).getTime()<=Date.now()||d.state_json.customerReviewHash!==g.reviewHash)throw new CheckoutError(409,'Order changed. Ask Brittany for a fresh review.');
  const review=await snapshot(tx,s,d.state_json);if(digest(JSON.stringify(review))!==g.reviewHash)throw new CheckoutError(409,'Order or pricing changed. Ask Brittany for a fresh review.');
  const order=await insertOrder(tx,{sessionId:s.id,customerName:review.customerName,customerPhone:s.caller_phone,paymentMethod:'cash',items:normalizeLines(d.state_json.items),notes:review.notes,expectedQuote:review.quote,notificationChannel:input.channel,notificationConsent:input.channel!=='none'&&input.consent});
  // Cash remains unpaid, including a zero-priced order; only staff may record collection.
  await tx`UPDATE orders SET payment_status='unpaid' WHERE id=${order.id}`;
  const state={...d.state_json,phase:'complete',relayReviewReady:false,customerConfirmation:{codeHash:g.codeHash,reviewHash:g.reviewHash,at:new Date().toISOString()},notificationChannel:input.channel,notificationConsent:input.channel!=='none'&&input.consent,nameConfirmed:true,orderReceipt:`Order ${order.id.slice(0,8)} is confirmed. Pay at pickup.`};
  await tx`UPDATE draft_carts SET state_json=${tx.json(state)},confirmation_state='confirmed',version=version+1,updated_at=now() WHERE session_id=${s.id}`;
  await recordOrderEvent(tx,order.id,'customer_web_confirmation','customer_review_confirmed',{reviewHash:g.reviewHash,channel:input.channel,method:'customer_review_page'},'customer');
  return receipt({...order,payment_status:'unpaid'});
 });
}
function receipt(order:any){return {ok:true,orderId:order.id,orderNumber:order.id.slice(0,8),status:order.status,paymentMethod:'cash',paymentStatus:order.payment_status,totalCents:order.total_cents,message:`Your order #${order.id.slice(0,8)} has been received. Payment is due at pickup.`};}
