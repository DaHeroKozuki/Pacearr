import {readFile} from 'node:fs/promises';import {join} from 'node:path';
export async function readUpgradeBackup(library,stateDir,path,child=''){
 for(let i=0;i<100;i++){try{return await readFile(join(library,path,child));}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;}
 const state=JSON.parse(await readFile(join(stateDir,'setup.json'),'utf8')),r=Object.values(state.backupRecords||{}).find(r=>r.path===path);if(r?.storage){try{return await readFile(join(r.storage,r.id,'payload',child))}catch(e){if(e.code!=='ENOENT')throw e;}}await new Promise(r=>setTimeout(r,50));}throw Error('Verified backup not found');
}
