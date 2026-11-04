"""Pass the supplied sandbox key to the isolated verifier in memory, never via arguments."""
import json,os,re,subprocess,sys,zipfile,xml.etree.ElementTree as E
from pathlib import Path
state=json.loads((Path(os.environ['TEMP'])/'restaurant-phase3-private.json').read_text())
source=Path(r'C:\Users\munte\.codex\visualizations\2026\11\01\01a194a1-bfe9-7fd0-9fa0-380b3a99e669\restaurantcall-secrets\Api keys.docx')
with zipfile.ZipFile(source) as z:text=' '.join(E.fromstring(z.read('word/document.xml')).itertext())
state['stripeKey']=re.search(r'\bsk_test_[A-Za-z0-9]+',text).group(0)
r=subprocess.run(['node','--import','tsx','../recovery/phase3/stripe-sandbox.mts',*sys.argv[1:]],cwd='frontend',input=json.dumps(state),text=True)
raise SystemExit(r.returncode)
