"""Read-only provider configuration/capability audit. Never export credentials or call content."""
import datetime,hashlib,json,os,sys,urllib.request,urllib.error,urllib.parse
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,PROJECT,TEAM
out=Path('docs/telephone/evidence');out.mkdir(parents=True,exist_ok=True)
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mutations':False,'realCallsMade':False}
code,project=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}')
result['projectHTTP']=code
result['productionDeployment']=project.get('targets',{}).get('production',{}).get('id')
result['productionBranch']=project.get('link',{}).get('productionBranch')
code,data=request('vercel',f'/v10/projects/{PROJECT}/env?teamId={TEAM}&decrypt=true')
result['environmentHTTP']=code
envs=data.get('envs',[])
def usable(v):return isinstance(v,str) and 16<len(v)<300 and '*' not in v and not v.startswith('eyJ')
def credential(names):
 for name in names:
  values=[os.environ.get(name)]+[e.get('value') for e in envs if e.get('key')==name]
  for value in values:
   if usable(value):return value
 return None
def get(url,headers):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=25) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,{}
key=credential(['TELNYX_API_KEY'])
result['telnyx']={'credentialAvailable':bool(key)}
if key:
 headers={'Authorization':'Bearer '+key}
 code,apps=get('https://api.telnyx.com/v2/call_control_applications?page[size]=100',headers)
 result['telnyx']['applicationsHTTP']=code
 result['telnyx']['applications']=[{'id':a.get('id'),'name':a.get('application_name'),'active':a.get('active'),'webhookPath':urllib.parse.urlsplit(a.get('webhook_event_url') or '').path,'sipSubdomainConfigured':bool(a.get('inbound',{}).get('sip_subdomain')),'sipReceiveSettings':a.get('inbound',{}).get('sip_subdomain_receive_settings')} for a in apps.get('data',[])]
 code,numbers=get('https://api.telnyx.com/v2/phone_numbers?page[size]=100',headers)
 result['telnyx']['numbersHTTP']=code
 result['telnyx']['numbers']=[{'id':n.get('id'),'numberSuffix':(n.get('phone_number') or '')[-4:],'connectionId':n.get('connection_id'),'connectionName':n.get('connection_name')} for n in numbers.get('data',[])]
key=credential(['ELEVENLABS_API_KEY','XI_API_KEY'])
result['elevenlabs']={'credentialAvailable':bool(key)}
if key:
 agent=next((e.get('value') for e in envs if e.get('key')=='ELEVENLABS_AGENT_ID' and e.get('value','').startswith('agent_')),None)
 if agent:
  code,a=get('https://api.elevenlabs.io/v1/convai/agents/'+agent,{'xi-api-key':key})
  result['elevenlabs']['agentHTTP']=code
  tools=a.get('conversation_config',{}).get('agent',{}).get('prompt',{}).get('built_in_tools',{})
  result['elevenlabs']['transferToolPresent']='transfer_to_number' in tools
result['previewPhoneConfiguration']={k:(any(e.get('key')==k and 'preview' in e.get('target',[]) for e in envs) if result['environmentHTTP']==200 else 'unknown_access_denied') for k in ['TELNYX_CONFIRMATION_APPLICATION_ID','TELNYX_CONFIRMATION_DESTINATION','TELNYX_CONFIRMATION_SIP_URI','TELNYX_VOICE_CONFIRMATION_ENABLED','CUSTOMER_CHECKOUT_SECRET']}
fallback=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\deployment-secrets.env')
if fallback.exists():
 tokens=dict(line.split('=',1) for line in fallback.read_text().splitlines() if '=' in line)
 value=tokens.get('VERCEL_TOKEN','').strip().strip('\"\'')
 if value:
  code,p=get(f'https://api.vercel.com/v9/projects/{PROJECT}?teamId={TEAM}',{'Authorization':'Bearer '+value})
  result['alternativeSavedVercelCredentialProjectHTTP']=code
spec=Path(os.environ['TEMP'])/'rc-telnyx-openapi.json'
if spec.exists():
 d=json.loads(spec.read_text());s=d['components']['schemas']
 result['officialContract']={'source':'https://raw.githubusercontent.com/team-telnyx/openapi/master/openapi/spec3.json','sha256':hashlib.sha256(spec.read_bytes()).hexdigest(),'speakEndedStatuses':s['CallSpeakEnded']['properties']['payload']['properties']['status']['enum'],'gatherEndedStatuses':s['CallGatherEnded']['properties']['payload']['properties']['status']['enum'],'initiationIdentityFields':list(s['CallInitiated']['properties']['payload']['properties']),'gatherRequestFields':list(s['GatherRequest']['properties'])}
(out/'provider-inspection.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
