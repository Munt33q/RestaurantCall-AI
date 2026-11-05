import crypto from 'node:crypto';

export function equalSecret(actual:string|null|undefined,expected:string|undefined){
 if(!expected||expected.trim().length<32||!actual)return false;
 const a=Buffer.from(actual),b=Buffer.from(expected.trim());
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export function providerAuthorized(request:Request,key:string|undefined){
 return equalSecret(request.headers.get('authorization')?.replace(/^Bearer\s+/i,''),key);
}
export function callToolKey(conversation:string,call:string){
 const key=process.env.ELEVENLABS_SESSION_BINDING_KEY?.trim();
 if(!key||key.length<32)throw Error('Session signing is not configured');
 return crypto.createHmac('sha256',key).update(JSON.stringify(['elevenlabs-tool-v1',conversation,call])).digest('base64url');
}
export async function boundedText(request:Request,max=4096):Promise<string>{
 const reader=request.body?.getReader();if(!reader)throw Error('JSON body required');
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Payload too large');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export async function boundedJson(request:Request,max=4096):Promise<unknown>{return JSON.parse(await boundedText(request,max));}
// ElevenLabs webhook HMAC: t=<seconds>,v0=<hex>; verify the untouched body.
export function verifyElevenLabsSignature(raw:string,header:string|null,key:string|undefined){
 if(!key||key.length<32||!header||header.length>300)return false;
 const parts=header.split(',').map(p=>p.trim().split('='));
 if(parts.length!==2||parts.some(p=>p.length!==2)||new Set(parts.map(p=>p[0])).size!==2)return false;
 const h=Object.fromEntries(parts);if(!/^\d{10,11}$/.test(h.t??'')||! /^[a-f0-9]{64}$/i.test(h.v0??'')||Math.abs(Date.now()-Number(h.t)*1000)>30*60000)return false;
 const actual=Buffer.from(h.v0,'hex'),expected=crypto.createHmac('sha256',key).update(h.t+'.'+raw).digest();
 return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
