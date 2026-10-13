import {spawn} from 'node:child_process';
import {open,realpath,lstat,mkdir,link,unlink,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {hashLibraryFile} from './beta-policy.mjs';
export function isWithin(root,path){const rel=relative(resolve(root),resolve(path));return !!rel&&!rel.startsWith('..')&&!isAbsolute(rel)}
export function scopedTorrents(torrents,root){
 const rows=[];for(const [hash,t] of Object.entries(torrents||{})){
  if(!/^[a-f0-9]{40}$/i.test(hash)||typeof t.save_path!=='string'||!isAbsolute(t.save_path)||!Array.isArray(t.files))continue;
  for(const f of t.files){if(typeof f.path!=='string'||isAbsolute(f.path)||f.path.includes('\\')||f.path.split('/').includes('..'))continue;
   const full=resolve(t.save_path,f.path);if(!isWithin(root,full)||! /\.(mkv|mp4|m4v|avi|mov|ts|m2ts)$/i.test(f.path))continue;
   const progress=Array.isArray(t.file_progress)&&Number.isFinite(t.file_progress[f.index])?t.file_progress[f.index]*100:null;
   rows.push({key:hash.toLowerCase()+'|'+relative(root,full),hash:hash.toLowerCase(),path:relative(root,full),name:basename(f.path),full,size:f.size,state:t.state||'Unknown',progress,torrent:t});
  }
 }return rows;
}
export async function probeMedia(path,executable=process.env.PACEARR_FFPROBE||'ffprobe'){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,['-v','error','-show_streams','-of','json',path],{stdio:['ignore','pipe','pipe']});let out='',error='';let settled=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Media probe timed out'))},30000);
  function finish(err,data){if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(data)}
  child.on('error',()=>finish(Error('Media probe unavailable; ffprobe is required')));
  child.stdout.on('data',x=>{out+=x;if(out.length>2*1024*1024){child.kill('SIGKILL');finish(Error('Media probe exceeded safe response limit'))}});child.stderr.on('data',x=>{if(error.length<1000)error+=x});
  child.on('close',code=>{if(code!==0)return finish(Error('Unable to inspect media streams'));try{
   const parsed=JSON.parse(out),streams=parsed.streams;if(!Array.isArray(streams))throw Error();const video=streams.find(s=>s.codec_type==='video'&&s.disposition?.attached_pic!==1);
   const languages=type=>[...new Set(streams.filter(s=>s.codec_type===type).map(s=>String(s.tags?.language||'und').toLowerCase()))];
   if(!video||!Number.isInteger(video.height)||video.height<=0)throw Error();finish(null,{height:video.height,width:video.width,audio:languages('audio'),subtitles:languages('subtitle')});
  }catch{finish(Error('Media stream metadata is invalid'))}});
 });
}
export function matchesProfile(media,profile){
 const audio=media.audio||[],subs=media.subtitles||[],has=(values,codes)=>codes.some(x=>values.includes(x));
 const jp=has(audio,['jpn','ja']),en=has(audio,['eng','en']),enSubs=has(subs,['eng','en']);
 if(media.height<profile.minimumQuality)return {ok:false,reason:`Below minimum ${profile.minimumQuality}p quality`};
 if(media.height>profile.targetQuality)return {ok:false,reason:`Above selected ${profile.targetQuality}p target; review required`};
 if(profile.language==='subbed'&&!(jp&&enSubs))return {ok:false,reason:'Japanese audio and English embedded subtitles required'};
 if(profile.language==='dubbed'&&!en&&!(jp&&enSubs))return {ok:false,reason:'No supported English-dub or English-subbed release details'};
 if(profile.language==='both'&&!(jp&&enSubs))return {ok:false,reason:'Japanese audio and English subtitles required for the dual-audio fallback'};
 if(['dubbed','both'].includes(profile.language)&&!en)return {ok:true,reason:'English dub not available on this release; accepted English-subbed fallback'};
 return {ok:true,reason:media.height<profile.targetQuality?'Allowed fallback quality; upgrade to target when a verified release becomes available':'Quality and language preferences satisfied'};
}
export function targetFilename(mapping,extension='.mkv'){
 const title=String(mapping.title||'Episode').replace(/[<>:"/\\|?*\x00-\x1f]/g,' - ').replace(/\s+/g,' ').trim().slice(0,160)||'Episode';
 return `One Pace - S${String(mapping.season).padStart(2,'0')}E${String(mapping.episode).padStart(2,'0')} - ${title}${extension}`;
}
// Missing episodes only. Replacements require review and are never overwritten by this function.
export async function importMissing({downloadRoot,sourceRel,libraryRoot,targetRel,expectedCRC,minimumFreeBytes=2*1024**3}){
 const down=await realpath(downloadRoot),lib=await realpath(libraryRoot);
 if(!isWithin(down,resolve(down,sourceRel))||!isWithin(lib,resolve(lib,targetRel)))throw Error('Import paths outside configured mounts');
 const source=await realpath(resolve(down,sourceRel));if(!isWithin(down,source))throw Error('Download resolves outside configured folder');
 const destination=resolve(lib,targetRel),folder=dirname(destination);
 // Only a direct season directory may be created; never traverse arbitrary directories.
 if(dirname(folder)!==lib)throw Error('Invalid destination season directory');
 try{await mkdir(folder)}catch(e){if(e.code!=='EEXIST')throw e}
 const folderInfo=await lstat(folder);if(!folderInfo.isDirectory()||folderInfo.isSymbolicLink()||await realpath(folder)!==folder)throw Error('Unsafe destination directory');
 const existing=await lstat(destination).catch(e=>{if(e.code==='ENOENT')return null;throw e});if(existing)throw Error('Destination already exists; replacement requires authorisation');
 const src=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);let temporary=null,writer=null;
 try{
  const before=await src.stat();if(!before.isFile())throw Error('Source is not a regular file');
  const free=await statfs(lib);if(Number(free.bavail)*Number(free.bsize)<before.size+minimumFreeBytes)throw Error('Insufficient library free space');
  temporary=join(folder,'.pacearr-partial-'+randomBytes(12).toString('hex'));writer=await open(temporary,'wx',0o640);
  const buffer=Buffer.alloc(256*1024);while(true){const {bytesRead}=await src.read(buffer,0,buffer.length,null);if(!bytesRead)break;let offset=0;while(offset<bytesRead){const {bytesWritten}=await writer.write(buffer,offset,bytesRead-offset,null);if(!bytesWritten)throw Error('Unable to copy source bytes');offset+=bytesWritten}}await writer.sync();await writer.close();writer=null;
  const copied=await hashLibraryFile(lib,relative(lib,temporary));const after=await src.stat();
  if(copied.size!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||copied.crc.toUpperCase()!==expectedCRC.toUpperCase())throw Error('Copied file checksum or source stability failed');
  // Hard-link publication is exclusive: another process's destination is never replaced.
  await link(temporary,destination);await unlink(temporary);temporary=null;
  const dir=await open(folder,constants.O_RDONLY);try{await dir.sync()}finally{await dir.close()}
  return {path:relative(lib,destination),crc:copied.crc,size:copied.size};
 }finally{if(writer)await writer.close().catch(()=>{});await src.close();if(temporary)await unlink(temporary).catch(()=>{})}
}

// Authorised replacement preserves the previous file and journals before publication.
export async function importReplacement(options,journal){
 const lib=await realpath(options.libraryRoot),target=resolve(lib,options.targetRel);
 if(!isWithin(lib,target))throw Error('Replacement outside library');
 const old=await hashLibraryFile(lib,options.targetRel);
 if(old.crc!==options.previousCRC)throw Error('Installed release changed; authorisation expired');
 const suffix=randomBytes(12).toString('hex'),stageRel=join(dirname(options.targetRel),'.pacearr-ready-'+suffix),backupRel=join(dirname(options.targetRel),'.pacearr-backup-'+suffix);
 await importMissing({...options,targetRel:stageRel});
 const stage=resolve(lib,stageRel),backup=resolve(lib,backupRel);
 await journal({targetRel:options.targetRel,stageRel,backupRel,previousCRC:old.crc,newCRC:options.expectedCRC});
 await link(target,backup);
 const current=await hashLibraryFile(lib,options.targetRel);if(current.crc!==old.crc)throw Error('Installed release changed during replacement; backup preserved');
 try{await unlink(target);await link(stage,target)}catch(e){await link(backup,target).catch(()=>{});throw e}
 await unlink(stage);const dir=await open(dirname(target),constants.O_RDONLY);try{await dir.sync()}finally{await dir.close()}
 return {path:options.targetRel,crc:options.expectedCRC,size:(await lstat(target)).size,backup:backupRel};
}
export async function recoverReplacement(libraryRoot,journal){
 const lib=await realpath(libraryRoot);for(const name of ['targetRel','stageRel','backupRel'])if(!isWithin(lib,resolve(lib,journal[name])))throw Error('Invalid recovery journal');
 const target=resolve(lib,journal.targetRel),backup=resolve(lib,journal.backupRel);if(!/^\.pacearr-ready-[a-f0-9]{24}$/.test(basename(journal.stageRel))||!/^\.pacearr-backup-[a-f0-9]{24}$/.test(basename(journal.backupRel)))throw Error('Invalid recovery staging names');
 async function cleanStage(){const path=resolve(lib,journal.stageRel),info=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e});if(!info)return;if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe recovery staging file');const hashed=await hashLibraryFile(lib,journal.stageRel);if(hashed.crc!==journal.newCRC)throw Error('Unexpected staging checksum; review required');await unlink(path)}
 const existing=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e});
 if(existing){const hash=await hashLibraryFile(lib,journal.targetRel);if(hash.crc===journal.newCRC){await cleanStage();return 'imported'}if(hash.crc===journal.previousCRC){await cleanStage();return 'restored'}throw Error('Recovery target has an unexpected checksum; review required')}
 const old=await hashLibraryFile(lib,journal.backupRel);if(old.crc!==journal.previousCRC)throw Error('Recovery backup checksum differs');await link(backup,target);await cleanStage();return 'restored';
}
