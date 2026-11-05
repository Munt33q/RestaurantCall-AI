// Preserve historical evidence; classify later engineering without claiming original commit recovery.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const base='037889c8c314cb61651aaca76e5c1ae172589fac',checkpoint='98ecf05dfe10dc1a39344a64211ff92878190c26';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=JSON.parse(fs.readFileSync('docs/recovery-phase2/evidence/file-provenance.json','utf8')).files.filter(r=>r.path.startsWith('docs/recovery-phase2/originals/'));
for(const r of original)assert.equal(sha(fs.readFileSync(r.path)),r.sha256,'Archived original changed: '+r.path);
const ledger=JSON.parse(fs.readFileSync('recovery/blueprint-ledger.json','utf8')).files;
for(const [p,h]of Object.entries(ledger))assert.equal(sha(git('show',checkpoint+':'+p)),h,'Checkpoint hash mismatch: '+p);
assert.equal(git('diff','--name-only',base,'--','docs/recovery-phase2','docs/phase3','docs/phase4','recovery/phase3','recovery/phase4').toString().trim(),'','Earlier provenance evidence changed');
assert.equal(git('diff','--diff-filter=D','--name-only',base).toString().trim(),'','Unexpected source deletion');
const names=new Set([...git('diff','--name-only',base).toString().trim().split(/\r?\n/),...git('ls-files','--others','--exclude-standard').toString().trim().split(/\r?\n/)]);
const privateValues=[];
for(const p of [path.join(process.env.TEMP,'restaurant-phase6-private.json'),path.join(process.env.APPDATA,'com.vercel.cli/Data/auth.json')]){
 if(!fs.existsSync(p))continue;const s=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
 for(const x of [s.uri,s.token,s.protectionBypass,...Object.values(s.previewEnv??{})])if(typeof x==='string'&&x.length>=24)privateValues.push(x);
 if(s.uri)privateValues.push(new URL(s.uri).password);
}
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/\b(?:ghp_|github_pat_|sk_live_|sk_test_|sk-proj-|sk-or-v1-|napi_|whsec_|xox[baprs]-)[A-Za-z0-9_-]{20,}/g,/postgres(?:ql)?:\/\/[^\s"']+/g,/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/g,/\bAKIA[A-Z0-9]{16}\b/g];
const files=[];
for(const p of [...names].filter(Boolean).sort()){
 if(p==='docs/phase6/evidence/provenance.json')continue;if(!fs.existsSync(p)||!fs.statSync(p).isFile())continue;
 assert.ok(!/(?:^|\/)(?:node_modules|\.next|dist|\.npm-cache)(?:\/|$)/.test(p),'Generated artifact: '+p);
 assert.ok(!/(?:^|\/)\.env/.test(p)||p.endsWith('.env.example'),'Private environment file: '+p);
 const b=fs.readFileSync(p);assert.ok(b.length<2_000_000,'Oversized evidence: '+p);
 for(const s of privateValues)assert.ok(!b.includes(Buffer.from(s)),'Private value detected in '+p);
 const txt=b.toString('utf8');for(const re of patterns){re.lastIndex=0;assert.ok(!re.test(txt),'Credential pattern detected in '+p);}
 let before=null;try{before=sha(git('show',base+':'+p));}catch{}
 files.push({path:p,classification:p.startsWith('docs/')?'authored report or synthetic acceptance evidence':p.startsWith('recovery/')?'new Phase 6 verification/support tooling':p.includes('/tests/')?'new or updated regression coverage':'new or modified Phase 6 engineering source/configuration',baselineSha256:before,sha256:sha(b),bytes:b.length});
}
const report={baseline:base,recoveryCheckpoint:checkpoint,original6de7172Recovered:false,preservedOriginalArtifacts:original.length,checkpointBlueprintHashesVerified:Object.keys(ledger).length,earlierEvidenceUnchanged:true,knownPrivateValuesScanned:privateValues.length,credentialFindings:0,productionCustomerRecordsIncluded:false,files};
fs.writeFileSync('docs/phase6/evidence/provenance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,files:files.length},null,2));
