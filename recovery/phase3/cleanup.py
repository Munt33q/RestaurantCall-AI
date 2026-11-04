"""Delete only this investigation's disposable branch and confirm it is gone."""
import json,os,sys,datetime
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
state_path=Path(os.environ['TEMP'])/'restaurant-phase3-private.json';state=json.loads(state_path.read_text());branch=state['branchId']
assert state['disposableConfirmed'] is True and branch=='br-soft-leaf-b87ops6p'
code,data=request('neon',f'/projects/{NEON}/branches/{branch}');assert code==200 and data['branch']['name'].startswith('recovery-phase3-')
deleted,_=request('neon',f'/projects/{NEON}/branches/{branch}','DELETE');assert deleted in (200,202),deleted
verified,_=request('neon',f'/projects/{NEON}/branches/{branch}');assert verified==404,verified
result={'branchId':branch,'deleted_http':deleted,'verification_http':verified,'confirmed_deleted':True,'productionBranchTouched':False,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
Path('docs/phase3/evidence/disposable-cleanup.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');state_path.unlink();print(json.dumps(result,indent=2))
