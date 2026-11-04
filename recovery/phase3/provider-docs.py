"""Read official runtime/event contracts, plus sandbox key validity. No customer API queries."""
import json,re,urllib.request,urllib.error,os,zipfile,xml.etree.ElementTree as E
from pathlib import Path
dest=Path('docs/phase3/evidence');result={}
urls={'neon_triggers':'https://neon.com/docs/compute/functions/triggers/overview.md','telnyx_index':'https://developers.telnyx.com/llms.txt'}
for name,url in urls.items():
    try:
        with urllib.request.urlopen(url,timeout=30) as r:text=r.read().decode();status=r.status
        dest.joinpath(name+'.txt').write_text(text,encoding='utf8');result[name]={'http':status,'url':url,'bytes':len(text),'relevant_lines':[line[:800] for line in text.splitlines() if re.search('strip|x-neon-|conversation.relay|tokens.played|speaker.events',line,re.I)][:35]}
    except Exception as e:result[name]={'error':type(e).__name__}
source=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\Api keys.docx')
with zipfile.ZipFile(source) as z:text=' '.join(E.fromstring(z.read('word/document.xml')).itertext())
match=re.search(r'\bsk_test_[A-Za-z0-9]+',text)
if match:
    key=match.group(0);assert key.startswith('sk_test_')
    req=urllib.request.Request('https://api.stripe.com/v1/account',headers={'Authorization':'Bearer '+key})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:data=json.load(r);result['stripe_test_key']={'http':r.status,'valid':True,'account_type':data.get('type'),'charges_enabled':data.get('charges_enabled')}
    except urllib.error.HTTPError as e:result['stripe_test_key']={'http':e.code,'valid':False}
dest.joinpath('provider-contracts.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result,indent=2))
