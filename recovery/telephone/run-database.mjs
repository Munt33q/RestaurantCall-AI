// Private disposable state is read locally and never exported into evidence.
import {spawn} from 'node:child_process';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import path from 'node:path';
const state=JSON.parse(readFileSync(path.join(process.env.TEMP,'restaurant-phase6-private.json'),'utf8'));
assert.equal(state.disposableConfirmed,true);assert.equal(state.branchId,'br-misty-shadow-b8v5hmz2');assert.match(new URL(state.uri).pathname,/^\/recovery_phase6_[0-9]+$/);
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));const pg=require('postgres');const sql=(pg.default??pg)(state.uri,{max:1,prepare:false});
const env={...process.env,NODE_ENV:'test',TEST_DATABASE_URL:state.uri,TEST_NEON_BRANCH:state.branchId,DATABASE_URL:state.uri,DIRECT_DATABASE_URL:state.uri,AI_FALLBACK_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',RELAY_ENABLED:'false'};
for(const k of Object.keys(env))if(/^(AI_(?!FALLBACK_ENABLED$)|DEEPSEEK_|TELNYX_|STRIPE_|XI_|ELEVENLABS_|CUSTOMER_CHECKOUT_)/.test(k))delete env[k];
const out=new URL('../../docs/telephone/evidence/',import.meta.url);mkdirSync(out,{recursive:true});
const run=args=>new Promise(resolve=>{const child=spawn(process.execPath,args,{cwd:new URL('../../frontend/',import.meta.url),env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{const text=bytes.toString().replaceAll(state.uri,'[private disposable URI]');output+=text;process.stdout.write(text);});child.on('close',code=>resolve({code:code??1,output}));});
try{
 const migration=await run(['scripts/migrate.mjs']);writeFileSync(new URL('migrations.log',out),migration.output);assert.equal(migration.code,0,'Disposable migration failed; inspect redacted log');
 const selected=process.argv.includes('--phone');const tests=await run(selected?['--import','tsx','--test','tests/telephone-checkout.test.ts','tests/telephone-checkout-database.test.ts']:['scripts/test.mjs']);
 const label=selected?'telephone-tests':'regression-tests';writeFileSync(new URL(label+'.log',out),tests.output);
 const ledger=await sql`SELECT name,sha256 FROM app_migrations ORDER BY name`;for(const m of ledger)assert.equal(m.sha256,createHash('sha256').update(readFileSync(new URL('../../frontend/drizzle/'+m.name,import.meta.url))).digest('hex'));
 const counts=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(tests.output.match(new RegExp('(?:ℹ |# )'+k+' (\\d+)'))?.[1]??0)]));
 const evidence={branch:state.branchId,database:state.database,exitCode:tests.code,...counts,migrations:ledger,productionDataCopied:false,syntheticProviderContractTests:true,realProviderAcceptance:false};writeFileSync(new URL(label+'.json',out),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));if(tests.code)console.log(tests.output.slice(-18000));process.exitCode=tests.code;
}finally{await sql.end();}
