#!/usr/bin/env python3
"""Archive unused deployment files; retain mounted state and configuration."""
from pathlib import Path
from datetime import datetime
import subprocess, json, os, re, shutil, sys
assert len(sys.argv)==2, 'Usage: python3 cleanup-synology.py /path/to/deployment'
root=Path(sys.argv[1]).resolve()
container_name=os.environ.get('PACEARR_CONTAINER','pacearr')
assert os.geteuid()==0, 'Run as root with sudo -i'
assert root.is_dir() and (root/'compose.yaml').is_file()
assert (root/'data/state').is_dir(), 'Saved state is missing'
text=(root/'compose.yaml').read_text()
assert not re.search(r'^\s*(env_file|include|extends|configs|secrets|build):',text,re.M), 'Review referenced Compose files before cleanup'
keep={'compose.yaml','data','.env'}
ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
containers=json.loads(subprocess.check_output(['docker','inspect',*ids],text=True)) if ids else []
active=[c for c in containers if c['Name'].lstrip('/') in (container_name,) and c['State']['Running']]
assert len(active)==1, 'Exactly one running Pacearr container is required'
state=[m for m in active[0]['Mounts'] if m['Destination']=='/data/state']
assert len(state)==1 and Path(state[0]['Source']).resolve()==(root/'data/state').resolve(), 'Container still uses another state folder; finish the move first'
for c in containers:
    for mount in c.get('Mounts',[]):
        if mount.get('Type')!='bind':continue
        source=Path(mount['Source']).resolve()
        assert source!=root.resolve(), 'A container mounts the whole deployment directory; review before cleanup'
        try:rel=source.relative_to(root.resolve())
        except ValueError:continue
        if rel.parts:keep.add(rel.parts[0])
extras=[p for p in root.iterdir() if p.name not in keep]
if not extras:
    print('Already clean: only configuration and mounted data remain')
else:
    backup=root.parent/'pacearr-backups'/('cleanup-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,mode=0o700)
    backup.chmod(0o700)
    for p in extras:
        shutil.move(str(p),str(backup/p.name));print('Archived:',p.name)
    print('Archive:',backup)
    print('Retained:',', '.join(sorted(p.name for p in root.iterdir())))
