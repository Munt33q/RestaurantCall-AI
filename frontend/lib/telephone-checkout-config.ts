import crypto from 'node:crypto';

export function telephoneEnabled(){return process.env.TELNYX_VOICE_CONFIRMATION_ENABLED==='true'&&process.env.RESTAURANT_ORDERING_ENABLED==='true'&&process.env.CASH_ONLY_CHECKOUT_ENABLED==='true';}
export function telephoneConfig(){
 const app=process.env.TELNYX_CONFIRMATION_APPLICATION_ID?.trim();
 const destination=process.env.TELNYX_CONFIRMATION_DESTINATION?.trim();
 const uri=process.env.TELNYX_CONFIRMATION_SIP_URI?.trim();
 const secret=process.env.CUSTOMER_CHECKOUT_SECRET?.trim();
 if(!telephoneEnabled()||!app||!destination||!uri||!/^sips?:[^\s<>@]+@[^\s<>]+$/.test(uri)||!secret||secret.length<32)throw Error('Telephone checkout is not configured');
 // This implementation is a Preview evaluation. Production needs a separately reviewed release.
 if(process.env.VERCEL_ENV==='production')throw Error('Telephone checkout Production release is on hold');
 if(process.env.SMS_DELIVERY_ENABLED==='true'||process.env.RECOVERY_SMS_ENABLED==='true')throw Error('Telephone checkout requires SMS disabled');
 return {app,destination,uri,secret};
}
export function telephoneHandoffSecret(conversationId:string,providerCallId:string){
 return crypto.createHmac('sha256',telephoneConfig().secret).update(JSON.stringify(['telephone-handoff-v1',conversationId,providerCallId])).digest('base64url');
}
export function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
