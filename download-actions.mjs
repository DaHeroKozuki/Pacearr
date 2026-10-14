import {realpath,lstat,unlink} from 'node:fs/promises';
import {resolve,isAbsolute,relative} from 'node:path';
export async function validateDownloadFiles(root,paths,{allowMissing=false}={}){
 if(!Array.isArray(paths)||!paths.length||paths.length>200||new Set(paths).size!==paths.length)throw Error('Select 1–200 distinct download files');
 const base=await realpath(root),files=[];
 for(const rel of paths){
  if(typeof rel!=='string'||isAbsolute(rel)||rel.includes('\\')||rel.split('/').includes('..'))throw Error('Invalid selected path');
  const full=resolve(base,rel),inside=relative(base,full);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('File outside download folder');
  let info;try{info=await lstat(full)}catch(e){if(e.code!=='ENOENT'||!allowMissing)throw e;let ancestor=resolve(full,'..');for(;;){try{if(await realpath(ancestor)!==ancestor)throw Error('Symlinked download paths require review');break}catch(a){if(a.code!=='ENOENT')throw a;ancestor=resolve(ancestor,'..')}}files.push({rel,full,absent:true});continue;}if(!info.isFile()||info.isSymbolicLink())throw Error('Selected download is not a regular file');
  const actual=await realpath(full);if(actual!==full)throw Error('Symlinked download paths require review');
  files.push({rel,full,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino});
 }
 return files;
}
export async function deleteDownloadFiles(root,paths,options={}){
 const files=await validateDownloadFiles(root,paths,options);const deleted=[],failed=[],absent=[];
 for(const file of files){if(file.absent){absent.push(file.rel);continue}try{const now=await lstat(file.full);if(now.ino!==file.ino||now.size!==file.size||now.mtimeMs!==file.mtimeMs||now.ctimeMs!==file.ctimeMs)throw Error('File changed after deletion preview');await unlink(file.full);deleted.push(file.rel)}catch(e){if(e.code==='ENOENT'&&options.allowMissing)absent.push(file.rel);else failed.push({path:file.rel,error:e.message})}}
 return {deleted,failed,absent};
}
