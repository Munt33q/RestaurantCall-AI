import {NextResponse} from 'next/server';
import {issueStaffSession,staffCredentialsMatch} from '@/lib/staff-session';
import {sameOrigin} from '@/lib/auth';
export async function POST(request:Request){
 if(!sameOrigin(request))return new Response('Forbidden',{status:403});
 const type=request.headers.get('content-type')||'';
 const body=type.includes('application/json')?await request.json():Object.fromEntries((await request.formData()).entries());
 if(!process.env.DEMO_STAFF_USERNAME||!process.env.DEMO_STAFF_PASSWORD)return new Response('Staff credentials not configured',{status:503});
 if(!staffCredentialsMatch(body.username,body.password))return new Response('Invalid credentials',{status:401});
 try{const response=NextResponse.redirect(new URL('/dashboard',request.url),303);response.cookies.set('staff_session',issueStaffSession(),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:8*60*60});return response;}catch{return new Response('Staff sign-in not configured',{status:503});}
}
