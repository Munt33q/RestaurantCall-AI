"""Read-only runtime and scheduler diagnostics. Never invoke an authenticated health probe."""
import json,os,sys,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,NEON
out=Path('docs/phase3/evidence');result=[]
base='https://br-patient-flower-b8mm4pad-restaurantrelay.compute.c-14.us-east-1.aws.neon.tech'
monitor='https://br-patient-flower-b8mm4pad-modelwatch.compute.c-14.us-east-1.aws.neon.tech'
for label,url,method in [('relay-health',base+'/health','GET'),('relay-unauthorized',base+'/ws?token=invalid-phase3','GET'),('monitor-get',monitor,'GET'),('monitor-untrusted-post',monitor,'POST')]:
    try:
        req=urllib.request.Request(url,method=method,data=b'{}' if method=='POST' else None)
        with urllib.request.urlopen(req,timeout=30) as r:status=r.status;body=r.read().decode()[:300]
    except urllib.error.HTTPError as e:status=e.code;body=e.read().decode()[:300]
    result.append({'probe':label,'http':status,'body':body})
code,triggers=request('neon',f'/projects/{NEON}/branches/br-patient-flower-b8mm4pad/triggers')
# Only scheduler metadata; no invocations or logs containing customer records.
safe=[]
for tr in triggers.get('triggers',[]):
    safe.append({k:tr[k] for k in ['id','name','type','enabled','function_name','function_path','schedule','config','created_at','updated_at'] if k in tr and k!='config'})
out.joinpath('neon-trigger-metadata.json').write_text(json.dumps({'http':code,'triggers':safe},indent=2)+'\n',encoding='utf8')
out.joinpath('read-only-runtime.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result,indent=2));print('Trigger metadata HTTP',code)
