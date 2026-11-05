import {CheckoutError} from './customer-checkout';
export const checkoutCookie='restaurant_customer_review';
export const checkoutHeaders={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export function customerOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'||!request.headers.get('content-type')?.startsWith('application/json'))throw new CheckoutError(403,'Use the restaurant confirmation page');
}
export function readReviewCookie(request:Request){
 const cookie=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(checkoutCookie+'='))?.slice(checkoutCookie.length+1);
 if(!cookie)throw new CheckoutError(401,'Enter your review code first');return cookie;
}
export function checkoutFailure(error:unknown){
 if(error instanceof SyntaxError)return Response.json({ok:false,error:'Invalid JSON request'},{status:400,headers:checkoutHeaders});
 return Response.json({ok:false,error:error instanceof CheckoutError?error.message:'Confirmation unavailable. No success has been reported; check the saved order before retrying.'},{status:error instanceof CheckoutError?error.status:503,headers:checkoutHeaders});
}
