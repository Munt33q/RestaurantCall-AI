import {waitUntil} from '@vercel/functions';
import {confirmCustomerReview,validateCustomerConfirmation} from '@/lib/customer-checkout';
import {boundedJson} from '@/lib/elevenlabs-security';
import {checkoutHeaders,customerOrigin,readReviewCookie,checkoutFailure} from '@/lib/checkout-http';
import {runNotificationJobs} from '@/lib/operations';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:Request){
 try{
  customerOrigin(request);const input=validateCustomerConfirmation(await boundedJson(request,2048));
  const result=await confirmCustomerReview(readReviewCookie(request),input);
  waitUntil(runNotificationJobs(result.orderId));
  return Response.json(result,{headers:checkoutHeaders});
 }catch(error){return checkoutFailure(error);}
}
