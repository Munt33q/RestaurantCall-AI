"""Create a disposable schema-only Neon branch and empty acceptance database."""
import json,os,sys,time
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
state=Path(os.environ['TEMP'])/'restaurant-phase6-private.json'
prefix=f'/projects/{NEON}'
if state.exists():
 prior=json.loads(state.read_text());assert prior['disposableConfirmed'] is True
 if prior.get('uri'):raise SystemExit('Phase 6 test database already available')
 branch=prior['branchId'];code,d=request('neon',prefix+f'/branches/{branch}')
 assert code==200 and d['branch']['name'].startswith('recovery-phase6-')
else:
 code,d=request('neon',prefix+'/branches','POST',{'branch':{'name':'recovery-phase6-'+str(int(time.time())),'parent_id':'br-patient-flower-b8mm4pad','init_source':'schema-only'},'endpoints':[{'type':'read_write'}]})
 assert code in (200,201),f'Branch HTTP {code}'
 branch=d['branch']['id']
 state.write_text(json.dumps({'branchId':branch,'disposableConfirmed':True}))
assert branch!='br-patient-flower-b8mm4pad'
for _ in range(30):
 code,roles=request('neon',prefix+f'/branches/{branch}/roles')
 if code==200:break
 time.sleep(1)
assert code==200
role=next(r['name'] for r in roles['roles'] if r['name']=='neondb_owner')
name='recovery_phase6_'+str(int(time.time()))
for _ in range(20):
 code,d=request('neon',prefix+f'/branches/{branch}/databases','POST',{'database':{'name':name,'owner_name':role}})
 if code in (200,201):break
 if code not in (409,423,503):break
 time.sleep(1)
assert code in (200,201),f'Database HTTP {code}'
code,d=request('neon',prefix+'/connection_uri?'+urlencode({'branch_id':branch,'database_name':name,'role_name':role,'pooled':'false'}));assert code==200
state.write_text(json.dumps({'branchId':branch,'disposableConfirmed':True,'database':name,'uri':d['uri']}))
out=Path('docs/phase6/evidence');out.mkdir(parents=True,exist_ok=True)
e={'branchId':branch,'database':name,'initSource':'schema-only','productionDataCopied':False,'productionModified':False}
(out/'disposable-database.json').write_text(json.dumps(e,indent=2)+'\n');print(json.dumps(e))
