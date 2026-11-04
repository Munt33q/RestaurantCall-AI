"""Create a schema-only disposable branch, then a fresh empty recovery database.
Credentials remain in an ignored OS temporary file, never in evidence or Git.
"""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, os.environ['TEMP'])
from restaurant_phase2_provider import request, NEON
state=Path(os.environ['TEMP'])/'restaurant-phase3-private.json'
if state.exists():
    print('Existing Phase 3 branch state found; refusing duplicate provisioning');sys.exit(1)
prefix=f'/projects/{NEON}'
status,data=request('neon',prefix+'/branches','POST',{'branch':{'name':'recovery-phase3-'+str(int(time.time())),'parent_id':'br-patient-flower-b8mm4pad','init_source':'schema-only'},'endpoints':[{'type':'read_write'}]})
assert status in (200,201), f'Branch creation HTTP {status}'
branch=data['branch']['id'];assert branch!='br-patient-flower-b8mm4pad'
state.write_text(json.dumps({'branchId':branch,'disposableConfirmed':True}),encoding='utf8')
for _ in range(30):
    code,roles=request('neon',prefix+f'/branches/{branch}/roles')
    if code==200:break
    time.sleep(1)
assert code==200,f'Roles HTTP {code}'
role=next((r['name'] for r in roles['roles'] if r['name']=='neondb_owner'),roles['roles'][0]['name'])
dbname='recovery_phase3_'+str(int(time.time()))
for _ in range(20):
    code,db=request('neon',prefix+f'/branches/{branch}/databases','POST',{'database':{'name':dbname,'owner_name':role}})
    if code in (200,201):break
    if code not in (409,423,503):break
    time.sleep(1)
assert code in (200,201),f'Database creation HTTP {code}'
from urllib.parse import urlencode
code,uri=request('neon',prefix+'/connection_uri?'+urlencode({'branch_id':branch,'database_name':dbname,'role_name':role,'pooled':'false'}))
assert code==200,f'Connection URI HTTP {code}'
state.write_text(json.dumps({'branchId':branch,'uri':uri['uri'],'disposableConfirmed':True,'database':dbname}),encoding='utf8')
evidence={'branchId':branch,'database':dbname,'init_source':'schema-only','productionDataCopied':False,'status':'created'}
Path('docs/phase3/evidence/disposable-database.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
print(json.dumps(evidence))
