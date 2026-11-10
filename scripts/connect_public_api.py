#!/usr/bin/env python3
"""Connect a verified HTTPS API to public Mini App. No financial execution."""
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

if len(sys.argv)!=2:
    sys.exit('Usage: python3 scripts/connect_public_api.py https://api.yourdomain.example')
url=sys.argv[1].strip().rstrip('/')
parts=urllib.parse.urlsplit(url)
if parts.scheme!='https' or not parts.hostname or parts.username or parts.password or parts.port not in (None,443):
    sys.exit('Public API must be HTTPS, host-only, standard port, without URL credentials.')
if parts.path not in ('','/') or parts.query or parts.fragment:
    sys.exit('Use the origin domain only, without path, query or fragment.')
if parts.hostname in ('localhost','127.0.0.1') or parts.hostname.endswith('.local'):
    sys.exit('Local API cannot serve public Telegram Mini App.')
origin='https://tradeain8n.github.io'
request=urllib.request.Request(url+'/api/health',headers={'Origin':origin,'User-Agent':'BabyMTT-API-CORS-Preflight'})
try:
    with urllib.request.urlopen(request,timeout=14) as response:
        document=json.load(response)
        cors=response.headers.get('Access-Control-Allow-Origin')
except (urllib.error.URLError,TimeoutError,ValueError) as error:
    sys.exit('API health request failed: '+type(error).__name__)
if not isinstance(document,dict) or document.get('ok') is not True or document.get('chainId')!=56:
    sys.exit('Unexpected API identity or chain ID.')
if cors!=origin:
    sys.exit('API CORS origin does not permit the Telegram Mini App.')
path=pathlib.Path(__file__).resolve().parent.parent/'docs'/'config.json'
data=json.loads(path.read_text())
data['apiBaseUrl']=url
data['exchangeState']='live_when_health_accepting'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('HTTPS API verified and configured. Current accepting:',document.get('accepting'))
print('IMPORTANT: Deploy GitHub Pages. Payment remains unavailable until accepting=true.')
