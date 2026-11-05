// Private disposable connection state arrives on stdin and is never printed.
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const pg=require('postgres'),postgres=pg.default??pg;
let input='';for await(const part of process.stdin)input+=part;const state=JSON.parse(input);
assert.equal(state.disposableConfirmed,true);assert.equal(state.branchId,'br-misty-shadow-b8v5hmz2');
assert.match(new URL(state.uri).pathname,/^\/recovery_phase6_[0-9]+$/);
const env={...process.env,NODE_ENV:'test',TEST_DATABASE_URL:state.uri,TEST_NEON_BRANCH:state.branchId,DATABASE_URL:state.uri,DIRECT_DATABASE_URL:state.uri,AI_FALLBACK_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',RELAY_ENABLED:'false'};
for(const key of Object.keys(env))if(/^(AI_(?!FALLBACK_ENABLED$)|DEEPSEEK_|TELNYX_|STRIPE_|XI_|ELEVENLABS_|CUSTOMER_CHECKOUT_)/.test(key))delete env[key];
const cwd=new URL('../../frontend/',import.meta.url);
const run=args=>{const r=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});const output=(r.stdout??'')+(r.stderr??'');process.stdout.write(output.replaceAll(state.uri,'[private disposable URI]'));return {code:r.status??1,output};};
assert.equal(run(['scripts/migrate.mjs']).code,0,'Disposable migrations must pass');
const selected=process.argv.filter(f=>f.endsWith('.test.ts'));
const result=run(selected.length?['--import','tsx','--test',...selected.map(f=>'tests/'+f)]:['scripts/test.mjs']);
const sql=postgres(state.uri,{max:1,prepare:false});
try{
 const ledger=await sql`SELECT name,sha256 FROM app_migrations ORDER BY name`;
 for(const m of ledger)assert.equal(m.sha256,createHash('sha256').update(readFileSync(new URL('../../frontend/drizzle/'+m.name,import.meta.url))).digest('hex'));
 const counts=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(result.output.match(new RegExp('(?:ℹ |# )'+k+' (\\d+)'))?.[1]??0)]));
 writeFileSync(new URL('../../docs/phase6/evidence/'+(selected.length?'targeted-database-tests':'database-tests')+'.json',import.meta.url),JSON.stringify({branch:state.branchId,database:state.database,productionDataCopied:false,migrations:ledger,exitCode:result.code,...counts,selected:selected.length?selected:'entire frontend test suite'},null,2)+'\n');
}finally{await sql.end();}
process.exitCode=result.code;
