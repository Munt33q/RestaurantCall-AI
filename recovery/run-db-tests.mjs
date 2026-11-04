// Reconstructed recovery runner. Credentials are accepted on stdin and never printed.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const module=require('postgres'),postgres=module.default??module;
let input='';for await(const part of process.stdin)input+=part;
const {uri,branchId,disposableConfirmed}=JSON.parse(input);
assert.equal(disposableConfirmed,true,'Confirm an empty, disposable Neon branch explicitly');
assert.match(branchId,/^br-[a-z0-9-]+$/);
assert.notEqual(branchId,'br-patient-flower-b8mm4pad','Production branch is forbidden');
const url=new URL(uri);assert.match(url.pathname,/^\/recovery_[a-z0-9_]+$/,'A recovery_* database is required');
const sql=postgres(uri,{max:1,prepare:false});
try{const [row]=await sql.begin('read only',tx=>tx`SELECT current_database() AS name`);assert.equal('/'+row.name,url.pathname);const [state]=await sql.begin('read only',tx=>tx`SELECT EXISTS(SELECT 1 FROM restaurants) OR EXISTS(SELECT 1 FROM orders) AS occupied`);assert.equal(state.occupied,false,'Use a fresh migrated database: historical tests contain fixed synthetic payment identifiers');}finally{await sql.end();}
// Database naming and branch confirmation are guardrails, not an API proof of branch identity.
// The caller must obtain this URI from the connection_uri API for the confirmed branchId.
const env={...process.env,NODE_ENV:'test',DATABASE_URL:uri,DIRECT_DATABASE_URL:uri,AI_FALLBACK_ENABLED:'false',SMS_DELIVERY_ENABLED:'false',OUTBOUND_UPDATES_ENABLED:'false',RECOVERY_SMS_ENABLED:'false',DRAFT_RECOVERY_ENABLED:'false',RELAY_ENABLED:'false'};
for(const key of Object.keys(env))if(/^(AI_(?!FALLBACK_ENABLED$)|DEEPSEEK_|TELNYX_|STRIPE_|XI_)/.test(key))delete env[key];
const result=spawnSync(process.execPath,['--import','tsx','--test','tests/database.integration.test.ts','tests/ordering.recovery.integration.test.ts'],{cwd:fileURLToPath(new URL('../frontend/',import.meta.url)),env,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
