#!/bin/sh
# Preserve saved state and mounts while cleaning the Compose/container names.
set -e
: "${PACEARR_DEPLOY_DIR:?Set your deployment directory}"
: "${PACEARR_OLD_CONTAINER:?Set the existing container name}"
: "${PACEARR_OLD_PROJECT:?Set the existing Compose project name}"
: "${PACEARR_OLD_SERVICE:?Set the existing Compose service name}"
export PACEARR_OLD_CONTAINER PACEARR_OLD_PROJECT PACEARR_OLD_SERVICE
cd "$PACEARR_DEPLOY_DIR"
test "$(id -u)" = "0"
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import subprocess,json,re,shutil,os
root=Path.cwd();state=root/'data/state';compose=root/'compose.yaml'
old_container=os.environ['PACEARR_OLD_CONTAINER'];old_project=os.environ['PACEARR_OLD_PROJECT'];old_service=os.environ['PACEARR_OLD_SERVICE']
assert re.fullmatch(r'[A-Za-z0-9_-]+',old_service), 'Invalid old service name'
assert state.is_dir() and compose.is_file(), 'Official folder needs compose.yaml and data/state'
old=json.loads(subprocess.check_output(['docker','inspect',old_container],text=True))[0]
assert old['Config'].get('Labels',{}).get('com.docker.compose.project')==old_project, 'Unexpected old container project'
mounts=[m for m in old['Mounts'] if m['Destination']=='/data/state']
assert len(mounts)==1 and Path(mounts[0]['Source']).resolve()==state.resolve(), 'Existing container must use the state directory in the selected deployment folder'
exists=subprocess.run(['docker','inspect','pacearr'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
assert exists.returncode!=0, 'Container name pacearr is already in use; nothing changed'
text=compose.read_text()
assert re.search(r'^  '+re.escape(old_service)+r':\s*$',text,re.M), 'Unexpected service layout; nothing changed'
assert len(re.findall(r'^    image:',text,re.M))==1
updated=re.sub(r'^    build: \.\s*\n','',text,flags=re.M)
assert not re.search(r'^    build:',updated,re.M), 'Unexpected build configuration'
updated=updated.replace('  '+old_service+':', '  pacearr:')
updated=re.sub(r'^    container_name:.*$','    container_name: pacearr',updated,flags=re.M)
updated=re.sub(r'^    image:.*$','    image: ghcr.io/daherokozuki/pacearr:latest',updated,flags=re.M)
assert 'container_name: pacearr' in updated
pending=root/'compose.migration.yaml';pending.write_text(updated)
try:
    subprocess.run(['docker-compose','-p','pacearr','-f',str(pending),'config','--quiet'],check=True)
    subprocess.run(['docker-compose','-p','pacearr','-f',str(pending),'pull','pacearr'],check=True)
    backup=root.parent/'pacearr-backups'/('names-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,mode=0o700);backup.chmod(0o700)
    shutil.copy2(compose,backup/'compose.yaml')
    subprocess.run(['docker','stop',old_container],check=True)
    try:
        shutil.copytree(state,backup/'data/state')
        compose.write_text(updated)
        subprocess.run(['docker-compose','-p','pacearr','-f',str(compose),'up','-d','--no-build','--no-deps','--force-recreate','pacearr'],check=True)
        import time
        healthy=False
        for _ in range(40):
            c=json.loads(subprocess.check_output(['docker','inspect','pacearr'],text=True))[0]
            if c['State'].get('Health',{}).get('Status')=='healthy':healthy=True;break
            if not c['State']['Running']:break
            time.sleep(2)
        assert healthy, 'New container did not become healthy'
        c=json.loads(subprocess.check_output(['docker','inspect','pacearr'],text=True))[0]
        assert any(m['Destination']=='/data/state' and Path(m['Source']).resolve()==state.resolve() for m in c['Mounts'])
    except Exception:
        subprocess.run(['docker','stop','pacearr'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','rm','pacearr'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        shutil.copy2(backup/'compose.yaml',compose)
        subprocess.run(['docker','start',old_container],check=True)
        raise
    subprocess.run(['docker','rm',old_container],check=True)
    print('Project, service and container: pacearr')
    print('State:',state)
    print('Backup:',backup)
finally:
    if pending.exists():pending.unlink()
PY
docker logs --tail 20 pacearr
