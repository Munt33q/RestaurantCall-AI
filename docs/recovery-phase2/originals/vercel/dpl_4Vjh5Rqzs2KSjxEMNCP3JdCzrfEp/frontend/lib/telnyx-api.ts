export class TelnyxApiError extends Error{
 constructor(status:number,public providerErrors:{code:string;title:string;detail:string;source:string}[]){super(`TELNYX_${status}_${providerErrors.map(e=>e.code).join(',')||'unknown'}`);this.name='TelnyxApiError';}
}
function safeErrors(errors:any[],body:unknown){
 const privateValues=[process.env.TELNYX_API_KEY,process.env.XI_API_KEY].filter((v):v is string=>!!v);
 function collect(value:unknown){if(typeof value==='string'&&value.length>=16)privateValues.push(value);else if(value&&typeof value==='object')for(const v of Object.values(value))collect(v);}
 collect(body);
 const scrub=(value:unknown)=>{let s=String(value??'');for(const secret of privateValues)s=s.split(secret).join('[redacted]');return s.replace(/[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,'[redacted token]').replace(/(?:https?|wss?):\/\/\S+/g,'[redacted URL]').slice(0,600);};
 return errors.slice(0,8).map(e=>({code:scrub(e.code??'unknown'),title:scrub(e.title),detail:scrub(e.detail),source:scrub(e.source?.pointer??e.source?.parameter)}));
}
export async function telnyxApi(path:string,method='GET',body?:unknown){
 const key=process.env.TELNYX_API_KEY?.trim();if(!key)throw Error('TELNYX_NOT_CONFIGURED');
 const response=await fetch('https://api.telnyx.com/v2'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new TelnyxApiError(response.status,safeErrors(Array.isArray(data?.errors)?data.errors:[],body));
 return data;
}
