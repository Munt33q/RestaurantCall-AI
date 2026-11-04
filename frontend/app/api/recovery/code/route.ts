import {issueRecoveryCode,recoveryEnabled} from '@/lib/engagement/recovery-store';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(!recoveryEnabled())return Response.json({error:'Draft recovery is not available. Please contact the restaurant.'},{status:503,headers});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return new Response('Unauthorized',{status:401,headers});
 const raw=await request.text();if(raw.length>1024)return new Response('Invalid request',{status:400,headers});
 try{const {token}=JSON.parse(raw);if(typeof token!=='string')return new Response('Invalid request',{status:400,headers});const code=await issueRecoveryCode(token);return Response.json(code??{error:'This recovery link is unavailable or expired. Please contact the restaurant.'},{status:code?200:404,headers});}catch{return Response.json({error:'Recovery is temporarily unavailable. Please contact the restaurant.'},{status:503,headers});}
}
