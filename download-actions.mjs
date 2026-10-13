import {realpath,lstat,unlink} from 'node:fs/promises';
import {resolve,isAbsolute,relative} from 'node:path';
export async function validateDownloadFiles(root,paths){
 if(!Array.isArray(paths)||!paths.length||paths.length>200||new Set(paths).size!==paths.length)throw Error('Select 1–200 distinct download files');
 const base=await realpath(root),files=[];
 for(const rel of paths){
  if(typeof rel!=='string'||isAbsolute(rel)||rel.includes('\\')||rel.split('/').includes('..'))throw Error('Invalid selected path');
  const full=resolve(base,rel),inside=relative(base,full);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('File outside download folder');
  const info=await lstat(full);if(!info.isFile()||info.isSymbolicLink())throw Error('Selected download is not a regular file');
  const actual=await realpath(full);if(actual!==full)throw Error('Symlinked download paths require review');
  files.push({rel,full,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino});
 }
 return files;
}
export async function deleteDownloadFiles(root,paths){
 const files=await validateDownloadFiles(root,paths);const deleted=[],failed=[];
 for(const file of files){try{const now=await lstat(file.full);if(now.ino!==file.ino||now.size!==file.size||now.mtimeMs!==file.mtimeMs||now.ctimeMs!==file.ctimeMs)throw Error('File changed after deletion preview');await unlink(file.full);deleted.push(file.rel)}catch(e){failed.push({path:file.rel,error:e.message})}}
 return {deleted,failed};
}
