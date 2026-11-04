import {readdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const unit=process.argv.includes('--unit');const files=readdirSync('tests').filter(f=>f.endsWith('.test.ts')&&(!unit||f!=='live-model-chain.test.ts')).map(f=>'tests/'+f);
const env={...process.env,NODE_ENV:'test',AI_FALLBACK_ENABLED:'false'};
// Historical DB tests read DATABASE_URL directly. Never inherit a production URI.
delete env.DATABASE_URL;delete env.DIRECT_DATABASE_URL;
if(env.TEST_DATABASE_URL){assert.match(new URL(env.TEST_DATABASE_URL).pathname,/^\/recovery_[a-z0-9_]+$/);assert.match(env.TEST_NEON_BRANCH??'',/^br-/);assert.notEqual(env.TEST_NEON_BRANCH,'br-patient-flower-b8mm4pad');env.DATABASE_URL=env.TEST_DATABASE_URL;env.DIRECT_DATABASE_URL=env.TEST_DATABASE_URL;}
for(const key of Object.keys(env))if(/^(AI_(?!FALLBACK_ENABLED$)|DEEPSEEK_|TELNYX_|STRIPE_|XI_)/.test(key))delete env[key];
const result=spawnSync(process.execPath,['--import','tsx','--test',...files],{stdio:'inherit',env});process.exit(result.status??1);
