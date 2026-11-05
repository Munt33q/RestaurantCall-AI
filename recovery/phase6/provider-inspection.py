"""Read-only provider diagnostics. Never print credentials or fetch customer conversations."""
import datetime, json, os, sys, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, os.environ['TEMP'])
from restaurant_phase2_provider import request, PROJECT, TEAM
out=Path('docs/phase6/evidence');out.mkdir(parents=True,exist_ok=True)
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionModified':False,'customerConversationsRead':False}
code,data=request('vercel',f'/v10/projects/{PROJECT}/env?teamId={TEAM}&decrypt=true')
result['vercelEnvironmentHTTP']=code
env={r['key']:r.get('value','') for r in data.get('envs',[]) if 'production' in r.get('target',[])}
def usable(v): return isinstance(v,str) and 10<len(v)<300 and not v.startswith('eyJ') and '*' not in v
keys=['ELEVENLABS_API_KEY','XI_API_KEY','TELNYX_API_KEY','CUSTOMER_CHECKOUT_SECRET','ELEVENLABS_SESSION_BINDING_KEY','ELEVENLABS_TOOL_API_KEY']
result['credentialAvailability']={k:usable(os.environ.get(k) or env.get(k)) for k in keys}
result['featureConfiguration']={k:(env.get(k) if env.get(k) in ['true','false'] else 'not_readable_or_absent') for k in ['ELEVENLABS_CHECKOUT_ENABLED','RESTAURANT_ORDERING_ENABLED','SMS_DELIVERY_ENABLED','SMS_REGISTRATION_VERIFIED','SMS_SENDER_VERIFIED','OUTBOUND_UPDATES_ENABLED']}
def get(url,key,header):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={header:key}),timeout=25) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,{}
key=next((v for v in [os.environ.get('ELEVENLABS_API_KEY'),os.environ.get('XI_API_KEY'),env.get('XI_API_KEY'),env.get('ELEVENLABS_API_KEY')] if usable(v)),None)
result['elevenlabs']={'status':'no_usable_account_key','actualSIPAcceptance':False}
if key:
 code,d=get('https://api.elevenlabs.io/v1/convai/agents',key,'xi-api-key')
 result['elevenlabs']={'agentsHTTP':code,'agents':[{'agentId':a.get('agent_id'),'name':a.get('name')} for a in d.get('agents',[])],'actualSIPAcceptance':False}
key=os.environ.get('TELNYX_API_KEY') or env.get('TELNYX_API_KEY')
result['telnyx']={'status':'no_usable_account_key','actualSMSSubmission':False}
if usable(key):
 code,d=get('https://api.telnyx.com/v2/messaging_profiles', 'Bearer '+key,'Authorization')
 result['telnyx']={'profilesHTTP':code,'profiles':[{'id':p.get('id'),'name':p.get('name'),'enabled':p.get('enabled'),'webhookConfigured':bool(p.get('webhook_url'))} for p in d.get('data',[])],'actualSMSSubmission':False,'registrationAcceptance':'not_verified_by_profile_listing'}
(out/'provider-inspection.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
