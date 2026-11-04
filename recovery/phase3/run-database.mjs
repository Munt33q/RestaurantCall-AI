// Accept temporary connection state via stdin; never display connection strings.
import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';import {readFileSync,readdirSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url)),pgModule=require('postgres'),postgres=pgModule.default??pgModule;
let input='';for await(const part of process.stdin)input+=part;const state=JSON.parse(input);
assert.equal(state.disposableConfirmed,true);assert.notEqual(state.branchId,'br-patient-flower-b8mm4pad');assert.match(new URL(state.uri).pathname,/^\/recovery_phase3_/);
const sql=postgres(state.uri,{max:1,prepare:false});
const testsOnly=process.argv.includes('--tests-only');
try{const [row]=await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;if(!testsOnly)assert.equal(row.n,0,'Fresh empty DB required');}finally{await sql.end();}
const env={...process.env,NODE_ENV:'test',TEST_DATABASE_URL:state.uri,TEST_NEON_BRANCH:state.branchId,DATABASE_URL:state.uri,DIRECT_DATABASE_URL:state.uri,AI_FALLBACK_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',RELAY_ENABLED:'false'};
for(const key of Object.keys(env))if(/^(AI_(?!FALLBACK_ENABLED$)|DEEPSEEK_|TELNYX_|STRIPE_|XI_)/.test(key))delete env[key];
const cwd=new URL('../../frontend/',import.meta.url);const run=args=>{const r=spawnSync(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});return r.status??1;};
if(!testsOnly)assert.equal(run(['scripts/migrate.mjs']),0);
const files=['acceptance-order.test.ts','call-receipt.test.ts','catalog-database.test.ts','recovery-database.test.ts','status-notifications-database.test.ts','voice-event-replay.test.ts','database.integration.test.ts','ordering.recovery.integration.test.ts','relay-database.phase3.test.ts'];
const selected=process.argv.filter(f=>f.endsWith('.test.ts'));
process.exitCode=run(['--import','tsx','--test',...(selected.length?selected:files).map(f=>'tests/'+f)]);
