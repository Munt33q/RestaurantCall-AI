import {modelError,type ModelAttempt} from './model-policy';import {primaryCircuitOpen} from './model-monitor';
export async function completeVoiceModel(input:{model:string;effort:string|null;messages:{role:string;content:string}[];signal?:AbortSignal;benchmark?:boolean}){
 const attempts:ModelAttempt[]=[];const fallback=!input.benchmark&&process.env.AI_FALLBACK_ENABLED==='true'&&!!process.env.DEEPSEEK_API_KEY?.trim();
 const configs=[{provider:'flatrouter',model:input.model,base:process.env.AI_BASE_URL?.trim(),key:process.env.AI_API_KEY?.trim(),timeout:Number(process.env.AI_PRIMARY_TIMEOUT_MS??(fallback?'3000':'15000'))},...(fallback?[{provider:'deepseek',model:process.env.AI_FALLBACK_MODEL?.trim()||'deepseek-flash',base:process.env.AI_FALLBACK_BASE_URL?.trim()||'https://api.deepseek.com/v1',key:process.env.DEEPSEEK_API_KEY?.trim(),timeout:Number(process.env.AI_FALLBACK_TIMEOUT_MS??'10000')}]:[])];
 if(input.signal?.aborted)return {attempts,error:'cancelled'};
 for(const [index,c] of configs.entries()){
  if(index===0&&fallback&&await primaryCircuitOpen(c.provider))continue;
  const started=performance.now();let status:number|undefined,requestId:string|null=null;
  const attempt=(ok:boolean,error?:string)=>{const a:ModelAttempt={provider:c.provider,model:c.model,ok,ms:Math.round(performance.now()-started),...(error?{error}:{}),...(status?{status}:{}),requestId};attempts.push(a);return a;};
  if(!c.key||!c.base){attempt(false,'configuration_missing');continue;}
  try{
   const timeout=Math.max(500,Math.min(Number.isFinite(c.timeout)?c.timeout:15000,25000));const signal=input.signal?AbortSignal.any([input.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
   const budget=c.provider==='deepseek'?{thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:1200,response_format:{type:'json_object'}}:input.effort?{reasoning_effort:input.effort,max_completion_tokens:1200}:{temperature:0,max_tokens:650};
   const response=await fetch(c.base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,...budget,messages:input.messages}),signal,cache:'no-store'});status=response.status;requestId=response.headers.get('x-request-id');
   if(!response.ok){await response.body?.cancel();attempt(false,`provider_http_${response.status}`);continue;}
   let data:any;try{data=await response.json();}catch(error){if(input.signal?.aborted||['AbortError','TimeoutError'].includes((error as Error)?.name))throw error;attempt(false,'invalid_provider_json');continue;}
   const choice=data.choices?.[0],content=choice?.message?.content;if(choice?.finish_reason==='length'){attempt(false,'truncated_response');continue;}if(typeof content!=='string'){attempt(false,'empty_response');continue;}
   try{const parsed=JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g,''));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();}catch{attempt(false,'invalid_model_json');continue;}
   const winner=attempt(true);return {data,attempts,winner};
  }catch(error){const code=modelError(error,input.signal?.aborted===true);attempt(false,code);if(code==='cancelled')return {attempts,error:code};}
 }
 return {attempts,error:attempts.at(-1)?.error??'configuration_missing'};
}
