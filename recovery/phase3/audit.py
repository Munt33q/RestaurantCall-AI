"""Phase 3 delta provenance. Does not rewrite the pristine phase-2 manifest."""
import collections,datetime,hashlib,json,subprocess,os,re,zipfile,xml.etree.ElementTree as E
from pathlib import Path
root=Path.cwd();dest=root/'docs/phase3/evidence';checkpoint='98ecf05'
def sha(b):return hashlib.sha256(b).hexdigest()
changed=subprocess.check_output(['git','diff','--name-only',checkpoint],text=True).splitlines()
base_paths=set(subprocess.check_output(['git','ls-tree','-r','--name-only',checkpoint],text=True).splitlines())
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
ledger=json.loads(Path('recovery/blueprint-ledger.json').read_text())['files'];comparison=[]
needed=sorted(set(ledger)|set(changed)&base_paths)
batch=subprocess.check_output(['git','cat-file','--batch'],input=''.join(checkpoint+':'+name+'\n' for name in needed).encode())
baseline_bytes={};offset=0
for name in needed:
 end=batch.index(b'\n',offset);header=batch[offset:end].split();assert header[1]==b'blob';size=int(header[2]);offset=end+1;baseline_bytes[name]=batch[offset:offset+size];offset+=size+1
for name,expected in ledger.items():
 baseline=baseline_bytes[name];current=Path(name).read_bytes()
 comparison.append({'path':name,'blueprint_sha256':expected,'checkpoint_sha256':sha(baseline),'current_sha256':sha(current),'checkpoint_matches_blueprint':sha(baseline)==expected,'current_matches_blueprint':sha(current)==expected,'intentional_phase3_delta':name in changed})
assert all(r['checkpoint_matches_blueprint'] for r in comparison)
assert all(r['current_matches_blueprint'] or r['intentional_phase3_delta'] for r in comparison)
archived=[]
manifest=json.loads(Path('docs/recovery-phase2/evidence/file-provenance.json').read_text())
for row in manifest['files']:
 if row['path'].startswith('docs/recovery-phase2/originals/'):
  actual=sha(Path(row['path']).read_bytes());assert actual==row['sha256'],row['path'];archived.append(row['path'])
missing=json.loads(Path('docs/recovery-phase2/evidence/historical-test-source-coverage.json').read_text())['missing_paths'];assert all(Path(p).is_file() for p in missing)
file_rows=[]
for name in sorted(set(changed+new)):
 if name=='docs/phase3/evidence/phase3-provenance.json':continue
 p=Path(name)
 if not p.is_file():continue
 before=baseline_bytes[name] if name in base_paths else None
 kind='modified recovered source' if before is not None else 'reconstructed verification/support'
 if name.startswith('docs/phase3/'):kind='new report or observed verification evidence'
 if name in missing:kind='reconstructed historical contract test/helper (not original bytes)'
 if name=='frontend/lib/relay/playback.ts':kind='new engineering implementation'
 file_rows.append({'path':name,'classification':kind,'checkpoint_sha256':sha(before) if before is not None else None,'sha256':sha(p.read_bytes())})
# Verify that supplied provider secrets have not been copied to new/changed artifacts.
source=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\Api keys.docx')
with zipfile.ZipFile(source) as z:text=' '.join(E.fromstring(z.read('word/document.xml')).itertext())
secrets=re.findall(r'\b(?:sk_test_|sk_live_|napi_)[A-Za-z0-9_-]+',text)
auth=Path(os.environ['APPDATA'])/'com.vercel.cli/Data/auth.json';secrets.append(json.loads(auth.read_text(encoding='utf-8-sig'))['token'])
leaks=[r['path'] for r in file_rows if any(s.encode() in Path(r['path']).read_bytes() for s in secrets)]
assert not leaks,'Credential matches in changed artifacts: '+repr(leaks)
result={'generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checkpoint':checkpoint,'original_commit_recovered':False,'blueprint_files':len(comparison),'checkpoint_blueprint_matches':sum(r['checkpoint_matches_blueprint'] for r in comparison),'current_blueprint_matches':sum(r['current_matches_blueprint'] for r in comparison),'intentional_blueprint_deltas':[r['path'] for r in comparison if not r['current_matches_blueprint']],'archived_originals_reverified':len(archived),'historical_missing_paths_reconstructed':len(missing),'secret_scan':{'supplied_provider_keys_and_cli_token':'no exact matches in changed/new artifacts'},'note':'Manifest excludes itself. Evidence/tooling is reconstructed; baseline originals remain byte-identical. This is not commit 6de7172.','files':file_rows}
dest.joinpath('phase3-provenance.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');dest.joinpath('blueprint-delta.json').write_text(json.dumps(comparison,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k!='files'},indent=2))
