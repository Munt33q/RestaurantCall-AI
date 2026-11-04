"""Read-only provider diagnostics; reports no credential values/customer records."""
import json, os, re, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,PROJECT,TEAM,NEON
dest=Path('docs/phase3/evidence')
source=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\Api keys.docx')
with zipfile.ZipFile(source) as z:
    root=ET.fromstring(z.read('word/document.xml'))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paragraphs=[''.join(p.itertext()) for p in root.findall('.//w:p',ns)]
labels=['flatrouter','deepseek','stripe','telnyx','neon','elevenlabs','api key','secret','base url']
inventory=[]
for i,p in enumerate(paragraphs):
    found=[label for label in labels if label in p.lower()]
    kinds=[kind for kind,pattern in {'stripe_test':r'\b[rs]k_test_[A-Za-z0-9]+','stripe_live':r'\b[rs]k_live_[A-Za-z0-9]+','generic_sk':r'\bsk-[A-Za-z0-9_-]+','neon':r'\bnapi_[A-Za-z0-9_-]+','telnyx':r'\bKEY[A-Za-z0-9_]+','webhook':r'\bwhsec_[A-Za-z0-9]+'}.items() if re.search(pattern,p)]
    if found or kinds:inventory.append({'paragraph':i,'labels':found,'credentialKinds':kinds})
dest.joinpath('credential-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf8')
print('Credential document inventory:',json.dumps(inventory))
code,data=request('vercel',f'/v10/projects/{PROJECT}/env?teamId={TEAM}')
assert code==200,f'Environment listing HTTP {code}'
allow={'AI_MODEL','AI_PROVIDER','AI_FALLBACK_MODEL','AI_FALLBACK_ENABLED','AI_PRIMARY_TIMEOUT_MS','AI_FALLBACK_TIMEOUT_MS','JOB_RECOVERY_SCHEDULE','SMS_DELIVERY_ENABLED','OUTBOUND_UPDATES_ENABLED','RELAY_ENABLED','LIVE_VOICE_ENABLED'}
config={}
for entry in data['envs']:
    if entry['key'] in allow and 'production' in entry.get('target',[]):
        status,item=request('vercel',f'/v1/projects/{PROJECT}/env/{entry["id"]}?teamId={TEAM}')
        value=item.get('value') if status==200 else None
        config[entry['key']]={'http':status,'type':item.get('type'),'value':value if value and len(value)<120 else None}
dest.joinpath('current-model-and-flags.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf8')
print('Nonsecret configuration:',json.dumps(config))
code,project=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}')
scheduler={'http':code,'crons':project.get('crons'),'framework':project.get('framework')}
dest.joinpath('scheduler-provider.json').write_text(json.dumps(scheduler,indent=2)+'\n',encoding='utf8')
code,functions=request('neon',f'/projects/{NEON}/branches/br-patient-flower-b8mm4pad/functions')
dest.joinpath('neon-current-functions.json').write_text(json.dumps({'http':code,'functions':[{'name':f.get('name'),'active_deployment':f.get('active_deployment'),'current_deployment':f.get('current_deployment')} for f in functions.get('functions',[])]},indent=2)+'\n',encoding='utf8')
print('Neon function metadata HTTP',code)
