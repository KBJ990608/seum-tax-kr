#!/usr/bin/env python3
"""Rebuild ignored runtime binaries from checksum-pinned official distributions.

Usage: python3 prepare-runtime.py [--cache /path/to/download-cache]
No credentials, signing, runtime compilation permissions or external service.
"""
from __future__ import annotations
import argparse,base64,gzip,hashlib,io,json,pathlib,tarfile,tempfile,urllib.request,urllib.parse,zipfile
ROOT=pathlib.Path(__file__).resolve().parent
LOCK=json.loads((ROOT/'runtime-build-lock.json').read_text())
MANIFEST=json.loads((ROOT/'runtime-manifest.json').read_text())
PROVENANCE=json.loads((ROOT/'numpy-provenance.json').read_text())

def digest(data,algorithm='sha256'):
    return hashlib.new(algorithm,data).digest()

def download(url,expected,algorithm='sha256',cache=None):
    filename=url.rsplit('/',1)[-1]
    location=cache/filename if cache else None
    data=location.read_bytes() if location and location.exists() else None
    if data is None:
        request=urllib.request.Request(url,headers={'User-Agent':'MARCO-reproducible-build/1.0'})
        with urllib.request.urlopen(request,timeout=90) as response:
            data=response.read(40*1024*1024+1)
        if len(data)>40*1024*1024:raise RuntimeError('Distribution exceeds download limit')
    if digest(data,algorithm)!=expected:raise RuntimeError('Checksum mismatch for '+filename)
    if location and not location.exists():location.write_bytes(data)
    return data

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=pathlib.Path);args=parser.parse_args()
    if args.cache:args.cache.mkdir(parents=True,exist_ok=True)
    algorithm,expected=LOCK['pyodide_tarball_integrity'].split('-',1)
    archive=download(LOCK['pyodide_tarball_url'],base64.b64decode(expected),algorithm,args.cache)
    wheel=download(LOCK['numpy_url'],bytes.fromhex(LOCK['numpy_sha256']),cache=args.cache)
    output={}
    source_manifest=json.loads((ROOT/'source-manifest.json').read_text())
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
        for filename in ['pyodide.asm.wasm','python_stdlib.zip']:
            item=tar.getmember('package/'+filename)
            if not item.isfile():raise RuntimeError('Expected regular package entry')
            output[filename]=tar.extractfile(item).read()
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
        original=tar.extractfile('package/pyodide.asm.mjs').read()
    if hashlib.sha256(original).hexdigest()!='f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635':
        raise RuntimeError('Unexpected Pyodide host JavaScript')
    text=original.decode('utf-8')
    target='globalThis.process?.type!="renderer"'
    if text.count(target)!=1:raise RuntimeError('Pyodide host patch target changed')
    patched=('// Modified host detection: Cloudflare nodejs_compat is not a Node.js process. Pyodide314.0.7 MPL-2.0.\n'+text.replace(target,target+'&&!globalThis.navigator?.userAgent?.includes("Cloudflare-Workers")')).encode('utf-8')
    if hashlib.sha256(patched).hexdigest()!='ebaf218caf8e93ade36f380cc7e3db9b2ac4ba1fe3a44318247bcfc9198f7297':
        raise RuntimeError('Pyodide host patch checksum mismatch')
    (ROOT/'vendor/pyodide.asm.original.mjs').write_bytes(original)
    (ROOT/'vendor/pyodide.asm.mjs').write_bytes(patched)
    marco={}
    for item in source_manifest:
        target='https://raw.githubusercontent.com/Box5789/Marco/3a4383b9b52739f65d730dee0dba7cac2c274c18/'+urllib.parse.quote(item['path'],safe='/')
        cache=args.cache/'marco'/item['sha256'] if args.cache else None
        if cache:cache.mkdir(parents=True,exist_ok=True)
        data=download(target,bytes.fromhex(item['sha256']),cache=cache)
        if len(data)!=item['bytes']:raise RuntimeError('MARCO source size mismatch')
        marco[item['path']]=data.decode('utf-8')
    (ROOT/'marco-files.json').write_text(json.dumps(marco,ensure_ascii=False),encoding='utf-8')
    with zipfile.ZipFile(io.BytesIO(wheel)) as source:
        slim_buffer=io.BytesIO()
        with zipfile.ZipFile(slim_buffer,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as slim:
            for entry in source.infolist():
                data=source.read(entry)
                if entry.filename.endswith('.so'):
                    expected_extension=next(x for x in PROVENANCE['precompiled_extensions'] if x['path']==entry.filename)
                    if hashlib.sha256(data).hexdigest()!=expected_extension['sha256']:raise RuntimeError('Extension checksum mismatch')
                    output[expected_extension['static_module']]=data
                    data=b''
                info=zipfile.ZipInfo(entry.filename,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                slim.writestr(info,data)
        output['numpy-python.zip']=slim_buffer.getvalue()
    for expected in MANIFEST:
        name=pathlib.Path(expected['path']).name
        data=output[name]
        if len(data)!=expected['bytes'] or hashlib.sha256(data).hexdigest()!=expected['sha256']:
            raise RuntimeError('Generated runtime mismatch: '+name)
    if len(output)!=len(MANIFEST):raise RuntimeError('Unexpected runtime file set')
    runtime=ROOT/'runtime';runtime.mkdir(exist_ok=True)
    for name,data in output.items():
        target=runtime/name
        if not target.exists() or target.read_bytes()!=data:target.write_bytes(data)
    print('Verified and prepared',len(output),'runtime modules;',sum(len(v) for v in output.values()),'bytes')

if __name__=='__main__':main()
