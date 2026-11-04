"""Reconstructed offline audit. Does not read credentials or contact providers."""
from pathlib import Path
import collections,datetime,hashlib,json,subprocess
ROOT=Path(__file__).resolve().parent.parent
EVIDENCE=ROOT/'docs/recovery-phase2/evidence'
def read(name): return json.loads((EVIDENCE/name).read_text(encoding='utf-8'))
def digest(data): return hashlib.sha256(data).hexdigest()
def write(name,value): (EVIDENCE/name).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,stderr=subprocess.PIPE)
ledger=json.loads((ROOT/'recovery/blueprint-ledger.json').read_text(encoding='utf-8'))
recovered=read('vercel-source-recovery.json')+read('vercel-supplemental-source-recovery.json')
by_path={row['path']:row for row in recovered}
extracted={row['path']:row for row in read('blueprint-extractions.json')}
adapted={'frontend/tests/operations.test.ts':'Added notification_consent_at and notification_channel to the historical mocked order fixture.','frontend/tests/database.integration.test.ts':'Added the later optional-notes checkout turn before confirmation.'}
tracked=set(git('ls-files','-z').decode().split('\0'))-{''}
changed=set(git('diff','--name-only','--no-ext-diff','-z','HEAD').decode().split('\0'))-{''}
paths=set(git('ls-files','-c','-o','--exclude-standard','-z').decode().split('\0'))-{''}
self_path='docs/recovery-phase2/evidence/file-provenance.json'
base_commit=git('rev-parse','HEAD').decode().strip()
rows=[]
for name in sorted(paths-{self_path}):
 p=ROOT/name
 if not p.is_file(): continue
 current=digest(p.read_bytes())
 row={'path':name,'sha256':current}
 if name in by_path:
  artifact=by_path[name]
  archive='docs/recovery-phase2/originals/vercel/'+artifact['deployment_id']+'/'+name
  raw=(ROOT/archive).read_bytes()
  assert digest(raw)==artifact['sha256'],archive
  assert hashlib.sha1(raw).hexdigest()==artifact['file_uid'],archive
  row.update(classification='deployed-artifact recovery',artifact_kind='uploaded original source',deployment_id=artifact['deployment_id'],file_uid=artifact['file_uid'],recovered_sha256=artifact['sha256'],original_artifact=archive)
  if name in extracted:
   row.update(classification='exact blueprint extraction',blueprint_document_sha256=ledger['source_document_sha256'],original_artifact='docs/recovery-phase2/originals/blueprint/'+name,older_vercel_original=archive)
   assert digest((ROOT/row['original_artifact']).read_bytes())==current
  elif current!=artifact['sha256']:
   assert name in adapted,('Unexpected change to original recovered source',name)
   row.update(classification='reconstructed',derived_from='uploaded original source',modification=adapted[name])
 elif name.startswith('docs/recovery-phase2/originals/vercel/'):
  row.update(classification='deployed-artifact recovery',artifact_kind='preserved uploaded original source')
 elif name.startswith('docs/recovery-phase2/originals/blueprint/'):
  row.update(classification='exact blueprint extraction')
 elif name in tracked and name not in changed:
  row.update(classification='original',source='old baseline',base_commit=base_commit)
 else:
  row.update(classification='reconstructed',artifact_kind='recovery tooling, adapted support file, report or collected evidence')
 if name in ledger['files']:
  row.update(blueprint_sha256=ledger['files'][name],matches_blueprint=current==ledger['files'][name])
 rows.append(row)
check=[{'path':p,'expected_sha256':h,'actual_sha256':digest((ROOT/p).read_bytes()) if (ROOT/p).is_file() else None} for p,h in ledger['files'].items()]
for r in check:r['matches']=r['expected_sha256']==r['actual_sha256']
write('blueprint-final-comparison.json',{'source_document_sha256':ledger['source_document_sha256'],'total':len(check),'matched':sum(r['matches'] for r in check),'files':check})
assert all(r['matches'] for r in check),'Blueprint ledger mismatch'
write('file-provenance.json',{'generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'note':'Self manifest excluded; generated build outputs and dependencies excluded by Git ignore rules. Historical tracked npm cache is retained as old baseline, not recovered application evidence.','classifications':dict(collections.Counter(r['classification'] for r in rows)),'files':rows})
print(json.dumps({'ledger_total':len(check),'ledger_matched':sum(r['matches'] for r in check),'vercel_original_artifacts_verified':len(recovered),'manifest_files':len(rows)}))
