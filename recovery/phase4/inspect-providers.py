"""Read-only provider diagnostics. Never emit environment values or credentials."""
import datetime, hashlib, json, os, sys, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, os.environ['TEMP'])
from restaurant_phase2_provider import request, PROJECT, TEAM

out=Path('docs/phase4/evidence');out.mkdir(parents=True,exist_ok=True)
result={'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
code,project=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}')
result['vercel']={'http':code,'createDeployments':project.get('gitProviderOptions',{}).get('createDeployments'),'disableRepositoryDispatchEvents':project.get('disableRepositoryDispatchEvents')}
code,data=request('vercel',f'/v10/projects/{PROJECT}/env?teamId={TEAM}&decrypt=true')
env={row['key']:row.get('value','') for row in data.get('envs',[]) if 'production' in row.get('target',[])}
def usable(v):return isinstance(v,str) and 10<len(v)<300 and not v.startswith('eyJ') and '*' not in v and v not in ('[REDACTED]','[ENCRYPTED]')
names=['AI_MODEL','AI_FALLBACK_MODEL','AI_BASE_URL','ELEVENLABS_VOICE_ID','ELEVENLABS_VOICE_NAME','LANGUAGE_PREFERENCE_ENABLED','ELEVENLABS_VOICE_PREFERENCE']
result['configuration']={name:('encrypted_not_readable' if str(env.get(name,'')).startswith('eyJ') or len(str(env.get(name,'')))>200 else env.get(name,'not_returned')) for name in names}
result['credential_access']={k:('usable_returned' if usable(env.get(k,'')) else 'not_available_or_masked') for k in ['AI_API_KEY','DEEPSEEK_API_KEY','TELNYX_API_KEY','XI_API_KEY','ELEVENLABS_API_KEY']}
key=next((v for v in [os.environ.get('ACCEPTANCE_ELEVENLABS_API_KEY'),env.get('XI_API_KEY'),env.get('ELEVENLABS_API_KEY')] if usable(v)),None)
result['elevenlabs']={'account_catalogue':'not_verified_no_usable_key','brittany_id':None,'synthesized_samples':False}
if key:
 try:
  req=urllib.request.Request('https://api.elevenlabs.io/v1/voices',headers={'xi-api-key':key})
  with urllib.request.urlopen(req,timeout=20) as r:voices=json.load(r)
  matches=[{k:v.get(k) for k in ['voice_id','name','category','labels','fine_tuning','verified_languages']} for v in voices.get('voices',[]) if 'brittany' in v.get('name','').lower()]
  result['elevenlabs']={'account_catalogue':'verified_read_only','brittany_matches':matches,'synthesized_samples':False}
 except urllib.error.HTTPError as e:result['elevenlabs']={'account_catalogue':'http_'+str(e.code),'synthesized_samples':False}
docs=[('relay-guide','https://developers.telnyx.com/docs/voice/programmable-voice/conversation-relay.md'),('relay-start','https://developers.telnyx.com/api-reference/call-commands/start-conversation-relay.md'),('tts-sukhan','https://developers.telnyx.com/docs/voice/tts/providers/telnyx/sukhan.md'),('deepgram-models','https://developers.deepgram.com/docs/models-languages-overview'),('eleven-models','https://elevenlabs.io/docs/overview/models')]
result['documentation']=[]
for label,url in docs:
 row={'name':label,'url':url}
 try:
  with urllib.request.urlopen(url,timeout=20) as r:body=r.read();row.update(http=r.status,sha256=hashlib.sha256(body).hexdigest(),bytes=len(body))
  # Retain no full third-party documents in Git. Private temporary copy for inspection.
  Path(os.environ['TEMP'],f'phase4-{label}.txt').write_bytes(body)
 except urllib.error.HTTPError as e:row['http']=e.code
 except Exception as e:row['error']=type(e).__name__
 result['documentation'].append(row)
out.joinpath('provider-inspection.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
