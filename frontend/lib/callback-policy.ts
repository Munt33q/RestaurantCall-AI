export type CallbackStage='accepted'|'ready';
export function callbackStages(input:unknown):CallbackStage[]{
 if(!Array.isArray(input)||input.length>2||input.some(x=>x!=='accepted'&&x!=='ready')||new Set(input).size!==input.length)throw Error('Choose accepted, ready, both or no callbacks');
 return ['accepted','ready'].filter(x=>input.includes(x)) as CallbackStage[];
}
export function callbackEvent(status:string):CallbackStage|null{return status==='preparing'?'accepted':['ready','completed'].includes(status)?'ready':null;}
export function callbackWanted(order:any,stage:string){return !!order.notification_consent_at&&order.notification_channel==='call'&&Array.isArray(order.callback_stages)&&order.callback_stages.includes(stage)&&callbackEvent(order.status)===stage&&(stage!=='accepted'||!!order.restaurant_accepted_at);}
export function callbackMessage(order:{id:string},stage:string,restaurantName:string){
 const number=order.id.slice(0,8).split('').join(', ');
 return stage==='accepted'?`Hello. This is an automated notification from ${restaurantName}. The restaurant has accepted your order number ${number}. Thank you for ordering. Goodbye.`:`Hello. This is an automated notification from ${restaurantName}. Your order number ${number} is ready for pickup. Thank you. Goodbye.`;
}
export function callbackRetryLimit(value=process.env.CALLBACK_MAX_ATTEMPTS){const n=Number(value??2);return Number.isInteger(n)&&n>=1&&n<=3?n:2;}
export function previewCallbackAllowed(phone:string){return process.env.VERCEL_ENV!=='preview'||(process.env.ELEVENLABS_ACCEPTANCE_CALLERS??'').split(',').map(x=>x.trim()).includes(phone);}
