import crypto from 'node:crypto';
export type TrackingGrant={aud:'restaurant-order';restaurantId:string;orderId:string;version:number;exp:number};
function key(){const s=process.env.STAFF_SESSION_SECRET?.trim();if(!s)throw new Error('Tracking signing is not configured');return crypto.createHmac('sha256',s).update('restaurant-tracking-v1').digest();}
export function signTrackingToken(restaurantId:string,orderId:string,version:number,now=Date.now()){
 const body=Buffer.from(JSON.stringify({aud:'restaurant-order',restaurantId,orderId,version,exp:now+7*86400000})).toString('base64url');return body+'.'+crypto.createHmac('sha256',key()).update(body).digest('base64url');
}
export function verifyTrackingToken(token:string,now=Date.now()):TrackingGrant|null{
 try{if(token.length>2000)return null;const [body,sig,...extra]=token.split('.');if(extra.length||!sig)return null;const expected=crypto.createHmac('sha256',key()).update(body).digest(),given=Buffer.from(sig,'base64url');if(given.length!==expected.length||!crypto.timingSafeEqual(given,expected))return null;
 const g=JSON.parse(Buffer.from(body,'base64url').toString());return g.aud==='restaurant-order'&&typeof g.orderId==='string'&&typeof g.restaurantId==='string'&&Number.isInteger(g.version)&&typeof g.exp==='number'&&g.exp>now&&g.exp<=now+7*86400000?g:null;}catch{return null;}
}
export function trackingUrl(order:{id:string;restaurant_id:string;tracking_version:number}){const base=process.env.PUBLIC_APP_URL?.trim();if(!base)throw new Error('Public URL missing');return base.replace(/\/$/,'')+'/track/'+signTrackingToken(order.restaurant_id,order.id,order.tracking_version);}
