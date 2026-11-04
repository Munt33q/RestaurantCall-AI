"""Phase 4 provenance and publication audit; earlier evidence stays immutable."""
import datetime,hashlib,json,os,re,subprocess,zipfile,xml.etree.ElementTree as E
from pathlib import Path
BASE='48d4d27b43d5acfcfb92e7beac8256b166084dea';CHECKPOINT='98ecf05dfe10dc1a39344a64211ff92878190c26'
PUBLIC_BASE='3aa6961b6500abc6a09da2d7cdbd2be6cdc40e72'
def git(*args):return subprocess.check_output(['git',*args])
def sha(data):return hashlib.sha256(data).hexdigest()
def blob(ref,path):return git('show',ref+':'+path)
ledger=json.loads(Path('recovery/blueprint-ledger.json').read_text())['files']
assert all(sha(blob(CHECKPOINT,p))==expected for p,expected in ledger.items())
originals=json.loads(Path('docs/recovery-phase2/evidence/file-provenance.json').read_text())['files']
archived=[r for r in originals if r['path'].startswith('docs/recovery-phase2/originals/')]
assert all(sha(Path(r['path']).read_bytes())==r['sha256'] for r in archived)
protected=git('diff','--name-only',BASE,'--','docs/recovery-phase2','docs/phase3','recovery/phase3').decode().splitlines()
assert not protected,'Earlier evidence/source changed: '+repr(protected)
paths=set(git('diff','--no-renames','--name-only',BASE).decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
assert not git('diff','--diff-filter=D','--name-only',BASE).strip(),'No recovered-source deletions expected'
prior=set(git('ls-tree','-r','--name-only',BASE).decode().splitlines());rows=[]
for name in sorted(paths):
 if name=='docs/phase4/evidence/provenance.json':continue
 p=Path(name)
 if not p.is_file():continue
 data=p.read_bytes();assert len(data)<5_000_000,'Oversized recovery evidence: '+name
 assert not re.search(r'(?:^|/)(?:node_modules|\.next|dist|\.npm-cache)(?:/|$)',name),'Build/cache file: '+name
 assert '/.env' not in name or name.endswith('/.env.example'),'Environment file: '+name
 kind='Phase 4 engineering modification' if name in prior else 'new Phase 4 engineering implementation'
 if '/tests/' in name:kind='new or updated regression contract, not historical original bytes'
 if name.startswith('docs/'):kind='synthetic verification evidence or authored report'
 if name.startswith('recovery/'):kind='new verification/support tool; not recovered original source'
 rows.append({'path':name,'classification':kind,'baseline_sha256':sha(blob(BASE,name)) if name in prior else None,'sha256':sha(data),'bytes':len(data)})
# Compare supplied secrets in memory. Never copy their text into evidence.
source=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\Api keys.docx')
with zipfile.ZipFile(source) as z:secret_text=' '.join(E.fromstring(z.read('word/document.xml')).itertext())
secrets=re.findall(r'\b(?:sk_test_|sk_live_|napi_)[A-Za-z0-9_-]+',secret_text)
auth=Path(os.environ['APPDATA'])/'com.vercel.cli/Data/auth.json';secrets.append(json.loads(auth.read_text(encoding='utf-8-sig'))['token'])
private=Path(os.environ['TEMP'])/'restaurant-phase4-private.json'
if private.exists():
 state=json.loads(private.read_text());secrets.append(state.get('uri',''))
 from urllib.parse import urlparse
 if state.get('uri'):secrets.append(urlparse(state['uri']).password or '')
assert not [r['path'] for r in rows if any(s and s.encode() in Path(r['path']).read_bytes() for s in secrets)],'Supplied credential detected'
findings=[]
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'\b(?:ghp_|github_pat_|sk_live_)[A-Za-z0-9_]{20,}',rb'postgres(?:ql)?://[^\s"\x27]+',rb'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}']
patterns += [rb'\b(?:sk_test_|sk-proj-|sk-or-v1-|napi_|whsec_|xox[baprs]-)[A-Za-z0-9_-]{20,}',rb'\bAKIA[A-Z0-9]{16}\b',rb'\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}']
for row in rows:
 data=Path(row['path']).read_bytes();old=blob(BASE,row['path']) if row['path'] in prior else b''
 for pattern in patterns:
  for hit in re.findall(pattern,data):
   if hit not in old:findings.append({'path':row['path'],'kind':'credential_or_connection_pattern'})
assert not findings,repr(findings)
# Scan every outgoing committed file version as well, including the previously
# local acceptance-tooling ancestor. No history rewriting or secret bypass.
outgoing=[];synthetic_exceptions=[]
for revision in git('rev-list',PUBLIC_BASE+'..HEAD').decode().splitlines():
 for name in git('diff-tree','--no-commit-id','--name-only','-r','--diff-filter=ACMRT',revision).decode().splitlines():
  data=blob(revision,name)
  assert len(data)<5_000_000,'Oversized outgoing blob: '+name
  assert not any(s and s.encode() in data for s in secrets),'Supplied credential in outgoing history: '+name
  for pattern in patterns:
   for hit in re.findall(pattern,data):
    if name=='frontend/tests/model-acceptance-harness.test.ts' and hit==b'postgres'+b'://production':
     # Literal credential-stripping fixture: no user, password, DB or real host.
     synthetic_exceptions.append({'path':name,'commit':revision,'kind':'credential-stripping fixture URI without credentials or real endpoint'})
    else:raise AssertionError('Credential pattern in outgoing history: '+name)
  outgoing.append({'commit':revision,'path':name,'sha256':sha(data)})
result={'generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase4_baseline':BASE,'publication_base':PUBLIC_BASE,'outgoing_committed_versions_scanned':outgoing,'reviewed_synthetic_pattern_exceptions':synthetic_exceptions,'recovery_checkpoint':CHECKPOINT,'original_6de7172_recovered':False,'checkpoint_blueprint_files_verified':len(ledger),'archived_originals_byte_identical':len(archived),'earlier_reports_and_tools_modified':False,'new_supplied_credentials_found':0,'new_high_confidence_credential_patterns':findings,'oversized_new_files':0,'production_customer_data_included':False,'synthetic_evidence_only':True,'files':rows}
Path('docs/phase4/evidence/provenance.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ('files','outgoing_committed_versions_scanned')},indent=2));print('Audited Phase 4 paths:',len(rows));print('Outgoing committed versions scanned:',len(outgoing))
