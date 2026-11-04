// Run from frontend: node --import tsx ../recovery/phase3/model-acceptance.mts --live [--fallback]
import {createServer} from 'node:http';
import {acceptanceCases,acceptanceMenu,evaluateAcceptance,isolatedModelEnvironment} from './model-acceptance-contract';
const args=process.argv.slice(2);
if(!args.includes('--live')||args.some(a=>!['--live','--fallback'].includes(a))){
 console.error('Usage: node --import tsx ../recovery/phase3/model-acceptance.mts --live [--fallback]. Requires explicit ACCEPTANCE_* credentials; uses only synthetic fixtures.');
 process.exit(2);
}
const fallback=args.includes('--fallback');
let env:ReturnType<typeof isolatedModelEnvironment>;
try{env=isolatedModelEnvironment(process.env,fallback);}catch{console.error('Acceptance configuration rejected. Set only the required dedicated ACCEPTANCE_* provider key, HTTPS base URL and model. No requests were made.');process.exit(2);}
// Do not inherit production data, signing keys, provider credentials or monitoring state.
for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
const outage=fallback?createServer((_req,res)=>{res.statusCode=503;res.end('Controlled local primary outage');}):null;
const oldError=console.error;let output:unknown;let code=1;
try{
 if(outage){await new Promise<void>(r=>outage.listen(0,'127.0.0.1',r));const address=outage.address();if(!address||typeof address==='string')throw Error();process.env.AI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;}
 const {understandVoiceTurn}=await import('../../frontend/lib/ai-menu');
 const {decideTurn}=await import('../../frontend/lib/voice-engine');
 console.error=()=>{}; // Provider failure diagnostics are summarized below, never copied verbatim.
 const results=[];
 for(const sample of acceptanceCases()){
  const understood=await understandVoiceTurn(sample.speech,acceptanceMenu,{...sample.state,history:sample.history,forceModelProbe:true},undefined,AbortSignal.timeout(15000));
  const decision=decideTurn(sample.state,understood.speech,acceptanceMenu,825,understood.extracted,understood.operation,understood.menuCategory,understood);
  const checked=evaluateAcceptance(sample,understood,decision,fallback?'deepseek':'flatrouter');
  results.push({...checked,modelMs:understood.diagnostics?.modelMs??null,provider:understood.diagnostics?.provider??null,attempts:understood.diagnostics?.attempts?.map(a=>({provider:a.provider,model:a.model,ok:a.ok,status:a.status??null,ms:a.ms,error:a.error??null}))??[]});
 }
 code=results.every(r=>r.ok)?0:1;
 output={checkedAt:new Date().toISOString(),syntheticOnly:true,databaseConfigured:false,transport:'real provider HTTP',mode:fallback?'controlled local primary outage with real fallback':'real primary',ok:code===0,manualConversationReviewRequired:true,limits:'Automated text contracts only; no voice, relay playback, provider outage SLA or human conversation-quality certification.',results};
}catch{output={ok:false,syntheticOnly:true,error:'acceptance_execution_failed',note:'No exception, upstream response body, credentials or transcript copied to output.'};}
finally{console.error=oldError;if(outage){outage.closeAllConnections();await new Promise<void>(r=>outage.close(()=>r()));}}
console.log(JSON.stringify(output,null,2));process.exitCode=code;
