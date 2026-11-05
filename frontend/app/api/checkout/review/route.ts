import {exchangeCustomerReview} from '@/lib/customer-checkout';
import {boundedJson} from '@/lib/elevenlabs-security';
import {checkoutCookie,checkoutHeaders,customerOrigin,checkoutFailure} from '@/lib/checkout-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  customerOrigin(request);const b=await boundedJson(request,1024) as {code?:unknown};
  if(typeof b?.code!=='string')return Response.json({error:'Enter your review code'},{status:400,headers:checkoutHeaders});
  const {cookie,...result}=await exchangeCustomerReview(b.code);
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return Response.json(result,{headers:{...checkoutHeaders,'Set-Cookie':`${checkoutCookie}=${cookie}; Path=/api/checkout; HttpOnly; SameSite=Strict; Max-Age=600${secure}`}});
 }catch(error){return checkoutFailure(error);}
}
