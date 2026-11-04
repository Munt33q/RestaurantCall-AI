export type CatalogItem={name:string;category:string;description:string;priceCents:number;stockQty:number|null;itemNumber:number|null;isAvailable:boolean;archived:boolean;special:boolean;specialStartsAt:string|null;specialEndsAt:string|null;aliases:string[];tags:string[]};
export type Promotion={id:string;title:string;note?:string;kind:'percent'|'fixed'|'note';value:number;itemIds:string[];active:boolean;startsAt:string|null;endsAt:string|null;version?:number};
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Invalid text');return v.trim();}
function date(v:unknown){if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Invalid timestamp');return new Date(v).toISOString();}
function strings(v:unknown,max=30){if(v===undefined)return [];if(!Array.isArray(v)||v.length>max)throw Error('Invalid list');return [...new Set(v.map(x=>text(x,100,true)))];}
function bool(v:unknown,fallback:boolean){if(v===undefined)return fallback;if(typeof v!=='boolean')throw Error('Invalid boolean');return v;}
export function validateCatalogItem(input:any):CatalogItem{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid item');
 const allowed=['name','category','description','priceCents','stockQty','itemNumber','isAvailable','archived','special','specialStartsAt','specialEndsAt','aliases','tags'];if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unknown item field');
 if(!integer(input.priceCents,0,10000000))throw Error('Invalid price');
 const stock=input.stockQty??null,number=input.itemNumber??null;if(stock!==null&&!integer(stock,0,1000000))throw Error('Invalid stock');if(number!==null&&!integer(number,1,99999))throw Error('Invalid item number');
 const start=date(input.specialStartsAt),end=date(input.specialEndsAt);if(start&&end&&start>=end)throw Error('End must follow start');
 return {name:text(input.name,120,true),category:text(input.category,80,true),description:text(input.description??'',600),priceCents:input.priceCents,stockQty:stock,itemNumber:number,isAvailable:bool(input.isAvailable,true),archived:bool(input.archived,false),special:bool(input.special,false),specialStartsAt:start,specialEndsAt:end,aliases:strings(input.aliases),tags:strings(input.tags)};
}
export function validatePromotion(input:any):Omit<Promotion,'id'>{
 if(!input||!['percent','fixed','note'].includes(input.kind))throw Error('Invalid promotion kind');
 if(!integer(input.value??0,0,input.kind==='percent'?10000:10000000)||(input.kind==='note'&&(input.value??0)!==0))throw Error('Invalid discount');
 const startsAt=date(input.startsAt),endsAt=date(input.endsAt);if(startsAt&&endsAt&&startsAt>=endsAt)throw Error('End must follow start');
 const itemIds=strings(input.itemIds,500);if(itemIds.some(id=>!uuid(id)))throw Error('Invalid item ID');
 return {title:text(input.title,120,true),note:text(input.note??'',300),kind:input.kind,value:input.value??0,itemIds,active:bool(input.active,true),startsAt,endsAt};
}
export const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
export function activePromotion(p:Promotion,now=Date.now()){return p.active&&(!p.startsAt||Date.parse(p.startsAt)<=now)&&(!p.endsAt||Date.parse(p.endsAt)>now);}
export function promotionQuote(lines:{itemId:string;priceCents:number;quantity:number}[],taxRateBps:number,promotions:Promotion[],now=Date.now()){
 if(!integer(taxRateBps,0,10000))throw Error('Invalid tax rate');
 if(lines.some(l=>!integer(l.priceCents,0,10000000)||!integer(l.quantity,1,20)))throw Error('Invalid quote line');
 const subtotalCents=lines.reduce((s,l)=>s+l.priceCents*l.quantity,0);let discountCents=0,promotionId:string|null=null;
 for(const p of [...promotions].sort((a,b)=>a.id.localeCompare(b.id))){if(!activePromotion(p,now)||p.kind==='note')continue;const eligible=lines.filter(l=>!p.itemIds.length||p.itemIds.includes(l.itemId)).reduce((s,l)=>s+l.priceCents*l.quantity,0);const discount=Math.min(eligible,p.kind==='fixed'?p.value:Math.floor(eligible*p.value/10000));if(discount>discountCents){discountCents=discount;promotionId=p.id;}}
 const taxableSubtotalCents=subtotalCents-discountCents,taxCents=Math.floor(taxableSubtotalCents*taxRateBps/10000);return {subtotalCents,discountCents,taxableSubtotalCents,taxCents,totalCents:taxableSubtotalCents+taxCents,promotionId};
}
