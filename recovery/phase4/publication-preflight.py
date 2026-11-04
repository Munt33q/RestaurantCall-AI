"""Read-only deployment/remote guard for the authorized feature publication."""
import datetime,json,os,subprocess,sys
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,PROJECT,TEAM
branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip()
remote=subprocess.check_output(['git','remote','get-url','origin'],text=True).strip()
assert branch=='codex/phase4-voice-experience'
assert remote=='https://github.com/Munt33q/RestaurantCall-AI.git'
code,project=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}')
assert code==200 and project.get('gitProviderOptions',{}).get('createDeployments')=='disabled','Automatic deployment must remain disabled'
refs=subprocess.check_output(['git','ls-remote','--heads','origin','master','recovered/restaurant-sales-2026-11-03',branch],text=True)
result={'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'branch':branch,'remote':remote,'vercel_http':code,'git_create_deployments':'disabled','production_settings_changed':False,'remote_refs':dict(line.split()[::-1] for line in refs.splitlines())}
Path('docs/phase4/evidence/publication-preflight.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
