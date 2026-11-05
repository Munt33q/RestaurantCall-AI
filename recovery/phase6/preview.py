"""Create/inspect only a Git-backed isolated Preview; never edit shared or production env."""
import json,os,secrets,subprocess,sys
from pathlib import Path
sys.path.insert(0,os.environ['TEMP'])
from restaurant_phase2_provider import request,PROJECT,TEAM
private=Path(os.environ['TEMP'])/'restaurant-phase6-private.json'
s=json.loads(private.read_text());assert s['disposableConfirmed'] is True and s['branchId']=='br-misty-shadow-b8v5hmz2'
assert '/recovery_phase6_' in s['uri']
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip();assert branch=='feat/elevenlabs-brittany-webhooks'
out=Path('docs/phase6/evidence')
if '--create' in sys.argv:
 assert not s.get('previewDeploymentId'),'Inspect an existing operation before creating another deployment'
 remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/'+branch],text=True).split()[0];assert remote==head
 assert json.loads((out/'database-tests.json').read_text())['exitCode']==0
 runtime={'DATABASE_URL':s['uri'],'DIRECT_DATABASE_URL':s['uri'],'RESTAURANT_ID':secrets.token_hex(16),'STAFF_SESSION_SECRET':secrets.token_hex(32),'DEMO_STAFF_USERNAME':'phase6-staff','DEMO_STAFF_PASSWORD':secrets.token_hex(24),'PUBLIC_APP_URL':'https://phase6-isolated.invalid','AI_FALLBACK_ENABLED':'false','SMS_DELIVERY_ENABLED':'false','SMS_REGISTRATION_VERIFIED':'false','SMS_SENDER_VERIFIED':'false','OUTBOUND_UPDATES_ENABLED':'false','DRAFT_RECOVERY_ENABLED':'false','RECOVERY_SMS_ENABLED':'false','RELAY_ENABLED':'false','ELEVENLABS_SESSION_BINDING_ENABLED':'true','ELEVENLABS_WEBHOOKS_ENABLED':'true','ELEVENLABS_CHECKOUT_ENABLED':'true','RESTAURANT_ORDERING_ENABLED':'true','CASH_ONLY_CHECKOUT_ENABLED':'true','ELEVENLABS_AGENT_ID':'agent_phase6_browser','ELEVENLABS_INBOUND_NUMBER':'+12025550101','ELEVENLABS_ACCEPTANCE_CALLERS':'+12025550123','ELEVENLABS_TOOL_API_KEY':secrets.token_hex(32),'ELEVENLABS_SESSION_BINDING_KEY':secrets.token_hex(32),'ELEVENLABS_POST_CALL_SECRET':secrets.token_hex(32),'CUSTOMER_CHECKOUT_SECRET':secrets.token_hex(32),'CRON_SECRET':secrets.token_hex(32)}
 import uuid
 runtime['RESTAURANT_ID']=str(uuid.uuid4())
 for k in ['AI_API_KEY','DEEPSEEK_API_KEY','TELNYX_API_KEY','TELNYX_PUBLIC_KEY','TELNYX_PHONE_NUMBER','TELNYX_TEXML_APPLICATION_ID','TELNYX_MESSAGING_PROFILE_ID','XI_API_KEY','ELEVENLABS_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']:runtime[k]=''
 code,p=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}');assert code==200
 assert p['link']['productionBranch']=='master' and p['link']['repo']=='RestaurantCall-AI'
 s['productionDeploymentBefore']=p.get('targets',{}).get('production',{}).get('id');s['previewEnv']=runtime
 private.write_text(json.dumps(s))
 # The create-deployment API defaults to Preview unless target=production is requested.
 body={'name':'restaurant-call-ai','project':PROJECT,'gitSource':{'type':'github','repoId':p['link']['repoId'],'ref':head},'env':runtime,'build':{'env':runtime},'gitMetadata':{'commitSha':head,'commitRef':branch,'remoteUrl':'https://github.com/Munt33q/RestaurantCall-AI'},'meta':{'phase6Isolation':'schema-only disposable Neon; no provider traffic'}}
 code,d=request('vercel',f'/v13/deployments?teamId={TEAM}','POST',body)
 if code not in (200,201):
  print(json.dumps({'http':code,'errorCode':d.get('error',{}).get('code'),'message':d.get('error',{}).get('message','')[:300]}));raise SystemExit(1)
 assert d.get('target')!='production'
 s.update(previewDeploymentId=d['id'],previewUrl='https://'+d['url'],previewCommit=head);private.write_text(json.dumps(s))
if s.get('previewDeploymentId'):
 code,d=request('vercel',f"/v13/deployments/{s['previewDeploymentId']}?teamId={TEAM}");assert code==200 and d.get('target')!='production'
 code,p=request('vercel',f'/v9/projects/{PROJECT}?teamId={TEAM}');assert code==200
 report={'deploymentId':d['id'],'url':'https://'+d['url'],'status':d['readyState'],'target':d.get('target') or 'preview','sourceCommit':s['previewCommit'],'databaseBranch':s['branchId'],'isolatedDatabase':True,'productionDeploymentBefore':s['productionDeploymentBefore'],'productionDeploymentAfter':p.get('targets',{}).get('production',{}).get('id'),'productionModified':False,'providerTrafficEnabled':False,'sharedEnvironmentEdited':False,'protectionDisabled':False}
 assert report['productionDeploymentBefore']==report['productionDeploymentAfter'],'Unexpected production deployment change'
 (out/'preview-deployment.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
else:print('Preview not created')
