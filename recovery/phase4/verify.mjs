// Local verification only. Clear inherited provider credentials and disable delivery.
import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';import path from 'node:path';
const root=process.cwd(),evidence=path.join(root,'docs/phase4/evidence');
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'',DIRECT_DATABASE_URL:'',SMS_DELIVERY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',RELAY_ENABLED:'false',LANGUAGE_PREFERENCE_ENABLED:'false'};
for(const key of Object.keys(env))if(/^(AI_|ACCEPTANCE_|DEEPSEEK_|TELNYX_|STRIPE_|XI_|ELEVENLABS_|VOICE_LANGUAGE_)/.test(key))delete env[key];
const steps=[
 ['unit','frontend',['scripts/test.mjs']],
 ['typecheck','frontend',['node_modules/typescript/bin/tsc','--noEmit']],
 ['build','frontend',['node_modules/next/dist/bin/next','build']],
 ['relay-build','.', ['relay/build.mjs']],
 ['monitor-build','.', ['frontend/node_modules/esbuild/bin/esbuild','monitor/index.ts','--bundle','--platform=node','--target=node24','--format=esm','--outfile=monitor/dist/index.mjs']],
];
const results=[];
for(const [name,cwd,args] of steps){
 const start=performance.now();
 // esbuild's bin is a JS launcher, invoked with Node as for the other commands.
 const r=spawnSync(process.execPath,args,{cwd:path.join(root,cwd),env:{...env,NODE_ENV:name==='unit'?'test':'production'},encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
 writeFileSync(path.join(evidence,name+'.txt'),(r.stdout??'')+(r.stderr??'')+(r.error?String(r.error):''));
 results.push({step:name,status:r.status,ms:Math.round(performance.now()-start)});console.log(JSON.stringify(results.at(-1)));
 if(r.status!==0){process.exitCode=1;break;}
}
writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({runtime:process.version,results},null,2)+'\n');
