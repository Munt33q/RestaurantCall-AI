import test from 'node:test';import assert from 'node:assert/strict';
import {telephoneConfig,telephoneEnabled,telephoneHandoffSecret} from '../lib/telephone-checkout-config';
import {telephoneReviewText,validateTelephoneEvent} from '../lib/telephone-checkout';
import {POST} from '../app/api/telnyx/phone-checkout/route';
test('telephone checkout defaults closed and cannot activate in Production or with SMS',async()=>{
 assert.equal(telephoneEnabled(),false);assert.equal((await POST(new Request('http://localhost/api/telnyx/phone-checkout',{method:'POST',body:'{}'}))).status,503);
 Object.assign(process.env,{TELNYX_VOICE_CONFIRMATION_ENABLED:'true',RESTAURANT_ORDERING_ENABLED:'true',CASH_ONLY_CHECKOUT_ENABLED:'true',TELNYX_CONFIRMATION_APPLICATION_ID:'app',TELNYX_CONFIRMATION_DESTINATION:'+12025550110',TELNYX_CONFIRMATION_SIP_URI:'sip:confirmation@example.test',CUSTOMER_CHECKOUT_SECRET:'synthetic-test-secret-at-least-32-characters'});
 const a=telephoneHandoffSecret('conv_one','sip_one');assert.notEqual(a,telephoneHandoffSecret('conv_two','sip_one'));assert.notEqual(a,telephoneHandoffSecret('conv_one','sip_two'));
 process.env.VERCEL_ENV='production';assert.throws(telephoneConfig,/Production/);process.env.VERCEL_ENV='preview';process.env.SMS_DELIVERY_ENABLED='true';assert.throws(telephoneConfig,/SMS/);process.env.SMS_DELIVERY_ENABLED='false';
 assert.equal((await POST(new Request('http://localhost/api/telnyx/phone-checkout',{method:'POST',body:'{}'}))).status,401);
});
test('full review includes item prices and all totals; oversized reviews cannot be truncated',()=>{
 const review={restaurantName:'Petra Cafe',customerName:'Test Person',customerPhone:'+12025550123',notes:'Sauce on side',paymentMethod:'cash' as const,items:[{itemId:'item',name:'Burger',quantity:2,priceCents:1000}],quote:{subtotalCents:2000,discountCents:200,taxableSubtotalCents:1800,taxCents:148,totalCents:1948,promotionId:null},notificationChannel:'call' as const,notificationConsent:true};
 const text=telephoneReviewText(review);for(const x of ['2 Burger','$10.00','$20.00','$2.00','$1.48','$19.48','Sauce on side','completion callback'])assert.ok(text.includes(x));
 assert.throws(()=>telephoneReviewText({...review,notes:'x'.repeat(3100)}),/provider limit/);
 assert.equal(validateTelephoneEvent({data:{id:'model-yes',event_type:'call.gather.ended',payload:{digits:'1'}}}),null);
});
