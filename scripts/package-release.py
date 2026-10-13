from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
root = Path(__file__).resolve().parent.parent
names = ['server.mjs','beta-readonly.mjs','beta-policy.mjs','import-engine.mjs','official-releases.mjs','download-actions.mjs','Dockerfile','compose.synology.yaml','.dockerignore','README.md','RELEASE-NOTES.md']
names += [str(p.relative_to(root)) for p in (root/'web').iterdir() if p.is_file()]
out = root/'dist'
out.mkdir(exist_ok=True)
archive = out/'pacearr-v1.0.0.zip'
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for name in names:
        z.write(root/name, 'pacearr-update/'+('compose.yaml' if name=='compose.synology.yaml' else name))
with ZipFile(archive) as z:
    assert z.testzip() is None
(out/'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
