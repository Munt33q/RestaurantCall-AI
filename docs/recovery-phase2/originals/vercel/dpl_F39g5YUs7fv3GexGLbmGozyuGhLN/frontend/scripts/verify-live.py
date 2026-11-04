"""Verify the deployed cash ordering story. Never logs credentials or sends messages."""
import json, urllib.request, urllib.error, http.cookiejar, concurrent.futures, pathlib, sys
base=sys.argv[1].rstrip('/') if len(sys.argv)>1 else 'https://restaurant-call-ai.vercel.app'
values=dict(line.split('=',1) for line in pathlib.Path('.env.live-check').read_text().splitlines() if '=' in line)
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path,body=None,method=None,auth=True):
 data=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(base+path,data=data,method=method,headers={'Content-Type':'application/json','Origin':base})
 try:
  with (opener if auth else urllib.request.build_opener()).open(req,timeout=45) as response:
   raw=response.read().decode();status=response.status
 except urllib.error.HTTPError as error:
  raw=error.read().decode();status=error.code
 try: result=json.loads(raw)
 except json.JSONDecodeError: result=raw[:200]
 return status,result
checks=[]
def check(name,condition):
 checks.append({'check':name,'passed':bool(condition)});print(name, 'PASS' if condition else 'FAIL',flush=True)
 if not condition: raise AssertionError(name)
status,menu=request('/api/menu',auth=False)
check('Public menu is populated with canonical fields',status==200 and len(menu)==4 and all('priceCents' in i and 'itemNumber' in i for i in menu))
status,_=request('/api/orders',auth=False);check('Unauthenticated kitchen API rejected',status==401)
status,_=request('/api/login',{'username':values['STAFF_USERNAME'],'password':'wrong'},auth=False);check('Wrong staff password rejected',status==401)
status,_=request('/api/login',{'username':values['STAFF_USERNAME'],'password':values['STAFF_PASSWORD']});check('Configured staff login succeeds',status==200 and len(list(jar))>0)
status,health=request('/api/health');print('Readiness:',json.dumps(health),flush=True);check('Live database and seeded restaurant ready',health.get('databaseReady') and health.get('restaurantReady'))
status,providers=request('/api/integrations');print('Provider checks:',json.dumps(providers),flush=True)
status,call=request('/api/demo',{'action':'start'});check('Persistent demo call opens',status==200 and 'callId' in call)
call_id=call['callId'];turn=0;verification_name='Deployment Verification '+call_id[-8:]
for speech in ['two burgers and one fries',"that's all",verification_name,'cash']:
 status,result=request('/api/demo',{'callId':call_id,'turn':turn,'speech':speech});check('Conversation step '+str(turn),status==200);turn=result['turn']
check('Readback quotes exact taxed total', '33.52' in result['xml'])
payload={'callId':call_id,'turn':turn,'speech':'confirm'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 responses=list(pool.map(lambda _:request('/api/demo',payload),range(3)))
check('Concurrent confirmation replays return identical saved response',all(r[0]==200 for r in responses) and len({r[1]['xml'] for r in responses})==1)
status,orders=request('/api/orders');matches=[o for o in orders if o.get('customerName')==verification_name];
check('Exactly one kitchen order created',status==200 and len(matches)==1)
order=matches[0];check('Kitchen ticket contains items and correct total',len(order['items'])==2 and order['totalCents']==3352 and order['status']=='confirmed')
status,_=request('/api/orders/'+order['id']+'/status',{'status':'completed'},method='PATCH');check('Skipping kitchen transitions is rejected',status>=400)
for state in ['preparing','ready','completed']:
 status,result=request('/api/orders/'+order['id']+'/status',{'status':state},method='PATCH');check('Kitchen transition '+state,status==200 and result['status']==state)
status,_=request('/api/telnyx/voice',{},auth=False);check('Unsigned Telnyx webhook rejected',status==401)
status,_=request('/api/stripe/webhook',{},auth=False);check('Unsigned Stripe webhook rejected',status==400)
pathlib.Path('../reports/LIVE_VERIFICATION.json').write_text(json.dumps({'base':base,'checks':checks,'health':health,'providers':providers,'demoOrderId':order['id']},indent=2)+'\n')
print('Live story verification complete.',flush=True)
