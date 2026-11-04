"""Delete only the disposable Phase 4 branch named in private test state."""
import datetime,json,os,sys
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
state_path=Path(os.environ['TEMP'])/'restaurant-phase4-private.json'
state=json.loads(state_path.read_text());branch=state['branchId']
assert state['disposableConfirmed'] is True and branch!='br-patient-flower-b8mm4pad'
assert state.get('database','').startswith('recovery_phase4_')
url=f'/projects/{NEON}/branches/{branch}'
code,data=request('neon',url);assert code==200 and data['branch']['id']==branch
assert data['branch']['name'].startswith('recovery-phase4-')
code,_=request('neon',url,'DELETE');assert code in (200,202)
check,_=request('neon',url);assert check==404
result={'branchId':branch,'deleted':True,'verification_http':check,'production_modified':False,'credentials_file_removed':True,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
state_path.unlink()
Path('docs/phase4/evidence/disposable-cleanup.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
