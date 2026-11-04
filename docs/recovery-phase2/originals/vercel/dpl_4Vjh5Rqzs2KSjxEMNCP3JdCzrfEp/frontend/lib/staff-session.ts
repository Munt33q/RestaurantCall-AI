import crypto from 'node:crypto';
function secret(){const v=process.env.STAFF_SESSION_SECRET;if(!v||v.length<32)throw new Error('Staff session secret is not configured');return v;}
export function issueStaffSession(now=Math.floor(Date.now()/1000)){
 const value=String(now+8*60*60);return `${value}.${crypto.createHmac('sha256',secret()).update(value).digest('base64url')}`;
}
export function verifyStaffSession(token:string|undefined,now=Math.floor(Date.now()/1000)){
 if(!token)return false;try{const [expires,signature,...rest]=token.split('.');if(rest.length||!/^\d+$/.test(expires)||Number(expires)<=now||Number(expires)>now+8*60*60)return false;
 const expected=crypto.createHmac('sha256',secret()).update(expires).digest();const actual=Buffer.from(signature??'','base64url');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
 }catch{return false;}
}
export function staffCredentialsMatch(username:unknown,password:unknown){
 const expectedUser=process.env.DEMO_STAFF_USERNAME?.trim(),expectedPassword=process.env.DEMO_STAFF_PASSWORD;
 if(!expectedUser||!expectedPassword||typeof username!=='string'||typeof password!=='string')return false;
 const digest=(v:string)=>crypto.createHash('sha256').update(v).digest();
 return crypto.timingSafeEqual(digest(username),digest(expectedUser))&&crypto.timingSafeEqual(digest(password),digest(expectedPassword));
}
