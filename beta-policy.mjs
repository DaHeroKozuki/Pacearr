import {coverageRelation} from './episode-catalogue.mjs';
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
export const defaultProfile={preferAlternate:false,preferExtended:false,skipVerifyPresent:true,verifyVariants:false,includeSpecials:false,minimumQuality:720,targetQuality:1080,language:'subbed',autoRevisions:true,autoQualityUpgrades:true,fetchUpdates:true,maxConcurrentDownloads:3,autoMissing:false};
export function preferredRelease(ep,profile=defaultProfile){
 if(profile.preferAlternate&&ep.files?.alternate)return {variant:'alternate',...ep.files.alternate};
 if(profile.preferExtended&&ep.files?.extended)return {variant:'extended',...ep.files.extended};
 return ep.files?.standard?{variant:'standard',...ep.files.standard}:null;
}
export function assessInstalled(ep,crc,profile=defaultProfile){
 const wanted=preferredRelease(ep,profile);if(!wanted)return {status:'review',reason:'Preferred release metadata is absent'};
 const matches=f=>f&&[f.CRC32,f.CRC32_inFileName].some(x=>typeof x==='string'&&x.toUpperCase()===crc.toUpperCase());
 if(matches(wanted))return {status:'current',variant:wanted.variant,preferred:wanted.variant,reason:'Installed checksum matches the preferred Beta release'};
 for(const variant of ['standard','extended','alternate'])if(matches(ep.files?.[variant]))return {status:'replacement-candidate',variant,preferred:wanted.variant,reason:`Installed ${variant}; Beta preference selects ${wanted.variant}. Review replacement; no download scheduled.`};
 const archived=(ep.files?.archived||[]).find(matches);if(archived)return {status:'replacement-candidate',variant:'archived',originalVariant:archived.variant||null,preferred:wanted.variant,reason:'Installed archived release; preferred current release differs'};
 return {status:'review-checksum-mismatch',preferred:wanted.variant,reason:'Checksum absent from this episode metadata. Beta would request its preferred release when downloads are enabled; Alpha requires review.'};
}
const table=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
export function crcChunk(buf,crc=0xffffffff){for(let i=0;i<buf.length;i++)crc=table[(crc^buf[i])&255]^(crc>>>8);return crc>>>0}
export async function hashLibraryFile(root,rel,onProgress){
 if(typeof rel!=='string'||isAbsolute(rel)||rel.split('/').includes('..')||rel.includes('\\'))throw Error('Invalid library path');
 const base=await realpath(root),path=await realpath(resolve(base,rel)),within=relative(base,path);
 if(within.startsWith('..')||isAbsolute(within)||!within)throw Error('File outside library');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat();if(!before.isFile())throw Error('Not a regular file');
  let crc=0xffffffff,done=0;
  for await(const chunk of handle.createReadStream({autoClose:false,highWaterMark:256*1024})){crc=crcChunk(chunk,crc);done+=chunk.length;onProgress?.(done,before.size)}
  const after=await handle.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('File changed during verification');
  return {crc:((crc^0xffffffff)>>>0).toString(16).toUpperCase().padStart(8,'0'),size:before.size,mtimeMs:before.mtimeMs,ctimeMs:before.ctimeMs,ino:before.ino};
 }finally{await handle.close()}
}

export function replacementPolicy(installed,oldMedia,newMedia,profile){
 if(!Number.isFinite(oldMedia?.height)||!Number.isFinite(newMedia?.height))return {allowed:false,reason:'Installed/source resolution is unverified'};
 if(newMedia.height<oldMedia.height)return {allowed:false,reason:'Quality downgrade blocked'};
 if(oldMedia.mangaChapters&&newMedia.mangaChapters&&coverageRelation(oldMedia.mangaChapters,newMedia.mangaChapters)!=='exact')return {allowed:true,automatic:false,requiresIdentityApproval:true,kind:'coverage-change',reason:'Episode coverage changed; confirm the replacement and any split/merged episode assignments'};
 const officialSameRelease=oldMedia.source==='official-release'&&newMedia.source==='official-release'&&typeof oldMedia.title==='string'&&oldMedia.title.trim()&&oldMedia.title.trim().toLowerCase()===newMedia.title?.trim().toLowerCase();
 if(installed.status==='review-checksum-mismatch'&&!officialSameRelease)return {allowed:true,kind:newMedia.height>oldMedia.height?'quality-upgrade':'release-revision',automatic:false,requiresIdentityApproval:true,reason:'Incoming release verified; installed version is unknown. Confirm replacement of this episode; previous file will be preserved'};
 const knownCuts=['standard','extended','alternate'];const oldCut=knownCuts.includes(installed.originalVariant)?installed.originalVariant:knownCuts.includes(installed.variant)?installed.variant:oldMedia.source==='official-release'?( /\balternate\b/i.test(oldMedia.title||'')?'alternate':/\bextended\b/i.test(oldMedia.title||'')?'extended':'standard'):null;
 if(oldCut&&knownCuts.includes(installed.preferred)&&oldCut!==installed.preferred)return {allowed:true,kind:'variant-change',automatic:false,reason:'Preferred release is a different cut; authorisation required'};
 const kind=newMedia.height>oldMedia.height?'quality-upgrade':'release-revision';
 return {allowed:true,kind,automatic:kind==='quality-upgrade'?profile.autoQualityUpgrades:profile.autoRevisions,reason:kind==='quality-upgrade'?`Quality upgrade ${oldMedia.height}p → ${newMedia.height}p`:'Current preferred Beta release has a different verified checksum'};
}
