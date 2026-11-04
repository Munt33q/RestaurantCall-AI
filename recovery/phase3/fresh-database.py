"""Allocate a second empty database in the already-created disposable branch for the final run."""
import os,json,sys,time
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
f=Path(os.environ['TEMP'])/'restaurant-phase3-private.json';state=json.loads(f.read_text());branch=state['branchId'];assert state['disposableConfirmed'] and branch!='br-patient-flower-b8mm4pad'
code,meta=request('neon',f'/projects/{NEON}/branches/{branch}');assert code==200 and meta['branch']['name'].startswith('recovery-phase3-')
code,roles=request('neon',f'/projects/{NEON}/branches/{branch}/roles');assert code==200
role=next((r['name'] for r in roles['roles'] if r['name']=='neondb_owner'),roles['roles'][0]['name'])
name='recovery_phase3_final_'+str(int(time.time()));code,_=request('neon',f'/projects/{NEON}/branches/{branch}/databases','POST',{'database':{'name':name,'owner_name':role}});assert code in (200,201),code
code,data=request('neon',f'/projects/{NEON}/connection_uri?'+urlencode({'branch_id':branch,'database_name':name,'role_name':role,'pooled':'false'}));assert code==200
state.update(uri=data['uri'],database=name);f.write_text(json.dumps(state),encoding='utf8');print('Fresh final-run database created in the existing disposable branch')
