import {readdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const unit=process.argv.includes('--unit');const files=readdirSync('tests').filter(f=>f.endsWith('.test.ts')&&(!unit||f!=='live-model-chain.test.ts')).map(f=>'tests/'+f);
const result=spawnSync(process.execPath,['--import','tsx','--test',...files],{stdio:'inherit',env:{...process.env,NODE_ENV:'test',AI_FALLBACK_ENABLED:'false'}});process.exit(result.status??1);
