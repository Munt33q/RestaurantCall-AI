export type DeliveryStatus='pending'|'dispatching'|'submitted'|'delivered'|'failed'|'uncertain'|'suppressed';
export function deliveryTransition(current:string,incoming:string){if(['delivered','suppressed'].includes(current))return current;if(current==='failed'&&incoming!=='delivered')return current;if(['delivered','failed','uncertain'].includes(incoming))return incoming;return current==='dispatching'||current==='pending'||current==='uncertain'?incoming:current;}
export function optOutKeyword(text:string){const s=text.trim().toUpperCase();return ['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT'].includes(s)?'stop':['START','UNSTOP'].includes(s)?'start':s==='HELP'?'help':null;}
export function notificationGate(i:{channel:string;consent:boolean;optedOut:boolean;smsEnabled:boolean;callsEnabled:boolean;phone:string;kind:string;orderStatus:string}){
 if(!i.consent)return 'No channel consent';if(!/^\+[1-9]\d{7,14}$/.test(i.phone))return 'Invalid customer number';
 if(i.channel==='sms'&&i.optedOut)return 'Customer opted out';if(i.channel==='sms'&&!i.smsEnabled)return 'SMS sending disabled pending delivery setup verification';if(i.channel==='call'&&!i.callsEnabled)return 'Outbound updates disabled';
 if(i.kind==='payment_link'?i.orderStatus!=='awaiting_payment':i.kind==='accepted'?i.orderStatus!=='preparing':i.channel==='call'&&i.kind==='ready'?!['ready','completed'].includes(i.orderStatus):i.orderStatus!==i.kind)return 'Notification outdated for current order status';return null;
}
export function smsDeliveryReady(){return process.env.SMS_DELIVERY_ENABLED==='true'&&process.env.SMS_REGISTRATION_VERIFIED==='true'&&process.env.SMS_SENDER_VERIFIED==='true'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(process.env.TELNYX_MESSAGING_PROFILE_ID?.trim()??'');}
export function notificationText(order:{id:string;status:string;payment_method:string;total_cents:number;customer_name?:string;restaurant_name?:string},kind:string,url?:string){
 const label=order.id.slice(0,8);const total='$'+(order.total_cents/100).toFixed(2);
 if(kind==='payment_link')return `RestaurantCall: Order ${label}, ${total}. Pay and track: ${url}. Reply STOP to opt out.`;
 const restaurant=order.restaurant_name??'RestaurantCall';
 if(kind==='confirmed')return `${restaurant}: Hi ${order.customer_name??'there'}, your order #${label} has been received. Total: ${total}.${order.payment_method==='cash'?' Pay at pickup.':''} Reply STOP to opt out.`;
 if(kind==='preparing')return `${restaurant}: Your order #${label} is now being prepared. Reply STOP to opt out.`;
 return `${restaurant}: Your order #${label} is ready for pickup. Thank you! Reply STOP to opt out.`;
}

export function applyPreferenceEvent(current:{at:number;stopped:boolean}|undefined,incoming:{at:number;stopped:boolean}){return !current||incoming.at>current.at||incoming.at===current.at&&incoming.stopped;}
export function canRecordCashPayment(o:{payment_method:string;status:string;payment_status:string}){return o.payment_method==='cash'&&['confirmed','preparing','ready','completed'].includes(o.status)&&['unpaid','paid'].includes(o.payment_status);}
