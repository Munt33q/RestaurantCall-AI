"""Fresh empty DB for a full rerun; never clear/reuse application tables."""
import json,os,sys,time
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
state_path=Path(os.environ['TEMP'])/'restaurant-phase4-private.json';state=json.loads(state_path.read_text());branch=state['branchId']
assert state['disposableConfirmed'] and branch!='br-patient-flower-b8mm4pad'
prefix=f'/projects/{NEON}'
code,data=request('neon',prefix+f'/branches/{branch}');assert code==200 and data['branch']['name'].startswith('recovery-phase4-')
code,data=request('neon',prefix+f'/branches/{branch}/roles');assert code==200
role=next(r['name'] for r in data['roles'] if r['name']=='neondb_owner')
database='recovery_phase4_'+str(int(time.time()))
code,_=request('neon',prefix+f'/branches/{branch}/databases','POST',{'database':{'name':database,'owner_name':role}});assert code in (200,201)
code,data=request('neon',prefix+'/connection_uri?'+urlencode({'branch_id':branch,'database_name':database,'role_name':role,'pooled':'false'}));assert code==200
previous_database=state['database'];state.update(uri=data['uri'],database=database);state_path.write_text(json.dumps(state))
evidence={'branchId':branch,'previous_synthetic_database':previous_database,'fresh_database':database,'production_data_copied':False,'reason':'Full regression fixtures require an empty database; fixed fixture provider IDs collide on reuse.'}
Path('docs/phase4/evidence/fresh-rerun-database.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence))
