import {mkdir,lstat,realpath,readdir,open,copyFile,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,relative,isAbsolute,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {hashLibraryFile} from './beta-policy.mjs';
const inside=(root,p)=>{const r=relative(root,p);return r&&!r.startsWith('..')&&!isAbsolute(r)};
export const backupPolicy=value=>({autoDelete:value?.autoDelete===true,retentionDays:[0,1,7,14,30].includes(value?.retentionDays)?value.retentionDays:7});
async function present(p){try{return await lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function regular(p){const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||await realpath(p)!==p)throw Error('Backup contains unsafe file');return s}
async function digest(p){const before=await regular(p),h=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);try{const hash=createHash('sha256');for await(const chunk of h.createReadStream({autoClose:false}))hash.update(chunk);const after=await h.stat();if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('Backup changed during verification');return {size:after.size,sha:hash.digest('hex')}}finally{await h.close()}}
async function directory(p){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(p)!==p)throw Error('Unsafe backup directory')}
async function inventory(path,kind){if(kind==='file')return [{name:'payload',...await digest(path)}];await directory(path);const names=(await readdir(path)).sort();if(names.length>2000)throw Error('Backup directory exceeds safe file limit');const out=[];for(const name of names)out.push({name,...await digest(join(path,name))});return out}
async function check(path,kind,manifest){const got=await inventory(path,kind);if(JSON.stringify(got)!==JSON.stringify(manifest))throw Error('Backup content changed; cleanup blocked')}
async function sync(path){const d=await open(path,'r');try{await d.sync()}finally{await d.close()}}
async function remove(path,kind,manifest){await check(path,kind,manifest);if(kind==='file')await unlink(path);else{for(const f of manifest)await unlink(join(path,f.name));await rmdir(path)}}
export async function maintainBackups({libraryRoot,downloadRoot,backupRoot,records,candidates=[],save=async()=>{},policy,deleteIds=[],now=Date.now()}){
 const lib=await realpath(libraryRoot),down=await realpath(downloadRoot);await mkdir(backupRoot,{recursive:true,mode:0o750});const dest=await realpath(backupRoot);
 if(dest===lib||dest===down||inside(lib,dest)||inside(down,dest)||inside(dest,lib)||inside(dest,down))throw Error('Backup storage must be outside library and download folders');await directory(dest);
 const checkedPolicy=backupPolicy(policy);
 for(const c of candidates){if(c.root!==lib||typeof c.path!=='string'||!/^\.pacearr-(?:arc-)?backup-[a-f0-9]{24}$/.test(basename(c.path))||!inside(lib,resolve(lib,c.path)))continue;const id=createHash('sha256').update(lib+'|'+c.path).digest('hex').slice(0,32);if(records[id])continue;records[id]={id,root:lib,path:c.path,targets:c.targets,created:c.created||new Date(now).toISOString(),status:'pending'};await save();}
 for(const record of Object.values(records)){
 if(record.root!==lib||record.status==='deleted')continue;
 try{
 if(!/^[a-f0-9]{32}$/.test(record.id)||!inside(lib,resolve(lib,record.path))||!/^\.pacearr-(?:arc-)?backup-[a-f0-9]{24}$/.test(basename(record.path)))throw Error('Invalid tracked backup');
 // Only published and independently verified replacements may release a backup.
 if(!record.targets?.length)throw Error('Replacement identity unavailable; retain backup for review');
 for(const t of record.targets){if(!/^[a-f0-9]{8}$/i.test(t.crc||''))throw Error('Replacement checksum missing');const h=await hashLibraryFile(lib,t.path);if(h.crc.toUpperCase()!==t.crc.toUpperCase())throw Error('Replacement identity changed; retain backup for review')}
 const source=resolve(lib,record.path),folder=join(dest,record.id),payload=join(folder,'payload');
 if(record.status!=='stored'){
 if(!record.manifest){const info=await present(source);if(!info){record.status='missing';record.reason='Tracked backup no longer exists';await save();continue;}record.kind=info.isFile()?'file':'directory';record.manifest=await inventory(source,record.kind);record.bytes=record.manifest.reduce((n,f)=>n+f.size,0);record.storage=dest;record.status='copying';await save();}
 if(record.storage!==dest)throw Error('Backup storage changed during migration; restore previous storage first');
 await mkdir(folder,{mode:0o750}).catch(e=>{if(e.code!=='EEXIST')throw e});await directory(folder);
 if(record.kind==='directory'){await mkdir(payload,{mode:0o750}).catch(e=>{if(e.code!=='EEXIST')throw e});await directory(payload)}
 const sourcePresent=await present(source);
 if(sourcePresent){await check(source,record.kind,record.manifest);for(const f of record.manifest){const from=record.kind==='file'?source:join(source,f.name),to=record.kind==='file'?payload:join(payload,f.name);if(await present(to)){const h=await digest(to);if(h.sha!==f.sha||h.size!==f.size)throw Error('Incomplete backup copy requires review');}else{await copyFile(from,to,constants.COPYFILE_EXCL);const h=await open(to,'r');try{await h.sync()}finally{await h.close()}}}}
 await check(payload,record.kind,record.manifest);await sync(folder);await sync(dest);if(sourcePresent){await remove(source,record.kind,record.manifest);await sync(dirname(source));}record.status='stored';record.reason='Verified backup retained outside the media library';await save();
 }
 if(record.storage!==dest)throw Error('Restore original backup storage before cleanup');
 const due=checkedPolicy.autoDelete&&now-Date.parse(record.created)>=checkedPolicy.retentionDays*86400000;
 if(due||deleteIds.includes(record.id)){await directory(folder);await remove(payload,record.kind,record.manifest);await rmdir(folder);await sync(dest);record.status='deleted';record.deleted=new Date(now).toISOString();record.reason=due?'Retention policy expired':'Deleted by administrator';await save();}
 }catch(e){record.reason=e.message;record.error=true;await save();continue;}delete record.error;
 }
 return Object.values(records);
}
