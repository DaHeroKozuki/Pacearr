from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib,json
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
out=root/'dist';out.mkdir(exist_ok=True)
application=['server.mjs','beta-readonly.mjs','beta-policy.mjs','import-engine.mjs','official-releases.mjs','download-actions.mjs','Dockerfile','compose.synology.yaml','.dockerignore','README.md','RELEASE-NOTES.md','LICENSE']
application += [str(p.relative_to(root)) for p in (root/'web').iterdir() if p.is_file()]
source=set(application+['package.json','package-lock.json','compose.yaml','CHANGELOG.md','ROADMAP.md','CONTRIBUTING.md','.github/workflows/release.yaml','.gitignore'])
for folder in ['tests','scripts','docs']:
    for p in (root/folder).rglob('*'):
        if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':source.add(str(p.relative_to(root)))
archives=[]
for label,names in [('',application),('-source',sorted(source))]:
    archive=out/f'pacearr-v{version}{label}.zip'
    with ZipFile(archive,'w',ZIP_DEFLATED) as z:
        for name in names:
            target='pacearr/'+name if label else 'pacearr/'+('compose.yaml' if name=='compose.synology.yaml' else name)
            z.write(root/name,target)
    with ZipFile(archive) as z:assert z.testzip() is None
    archives.append(archive)
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in archives))
