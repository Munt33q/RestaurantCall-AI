import {client} from './db/client';import {restaurantId} from './repository';
import {catalogRow,promotionRow} from './catalog-store';
import {activePromotion,promotionQuote,type Promotion} from './catalog-policy';
export function describeMenu(items:any[],promotions:Promotion[],taxRateBps:number,query='',now=Date.now(),limit=100){
 const q=query.trim().toLowerCase().slice(0,120),offers=promotions.filter(p=>activePromotion(p,now));
 const matching=items.filter(m=>!m.archived&&(!q||[m.name,m.category,m.description,String(m.itemNumber??''),...(m.aliases??[])].some(x=>x.toLowerCase().includes(q)))).map(m=>{
 const available=m.isAvailable&&m.stockQty!==0&&(!m.special||((!m.specialStartsAt||Date.parse(m.specialStartsAt)<=now)&&(!m.specialEndsAt||Date.parse(m.specialEndsAt)>now)));
 return {...m,isAvailable:available,quoteForOne:promotionQuote([{itemId:m.id,category:m.category,priceCents:m.priceCents,quantity:1}],taxRateBps,offers,now)};});
 return {ok:true,matches:matching.slice(0,limit),truncated:matching.length>limit,offers,taxRateBps,checkedAt:new Date(now).toISOString(),pricingPolicy:'One best eligible discount per order. Per-item quotes are illustrative; review_order reprices the complete cart. Announcements never create a discount or free item. Never offer unavailable items.'};
}
export async function currentMenu(sql:any=client()){
 const rid=restaurantId();const [restaurant]=await sql`SELECT id,name,tax_rate_bps,catalog_revision FROM restaurants WHERE id=${rid}`;
 if(!restaurant)throw Error('Restaurant not configured');
 const items=(await sql`SELECT * FROM menu_items WHERE restaurant_id=${rid} ORDER BY category,name,id`).map(catalogRow);
 const promotions=(await sql`SELECT * FROM promotions WHERE restaurant_id=${rid} ORDER BY id`).map(promotionRow);
 return {restaurant,items,promotions};
}
export async function liveMenuResult(query?:string){const {restaurant,items,promotions}=await currentMenu();return {...describeMenu(items,promotions,restaurant.tax_rate_bps,query),restaurant:{id:restaurant.id,name:restaurant.name},catalogRevision:restaurant.catalog_revision};}
