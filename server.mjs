import {episodeSuggestion} from './episode-mapping.mjs';
import {fetchTorrentMetadata,selectTorrentFiles,decodeTorrent,torrentMetadataURLs} from './torrent-metadata.mjs';
import {validateDownloadFiles,deleteDownloadFiles} from './download-actions.mjs';
import {fetchOfficialReleases,officialForCRC} from './official-releases.mjs';
import {scopedTorrents,probeMedia,matchesProfile,targetFilename,importMissing,importReplacement,recoverReplacement,recoverMissing,isWithin} from './import-engine.mjs';
import {defaultProfile,preferredRelease,assessInstalled,hashLibraryFile,replacementPolicy} from './beta-policy.mjs';
import {boundedJSON,metadataIndex,matchMetadata,delugeReader,verifyCompletion} from './beta-readonly.mjs';
import http from 'node:http';
import {readFile, writeFile, mkdir, rename, chmod, realpath, stat, access, readdir, lstat, link, open} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {randomBytes, pbkdf2Sync, timingSafeEqual, createCipheriv, createDecipheriv} from 'node:crypto';
import {join, extname, resolve, relative, isAbsolute, basename,dirname} from 'node:path';
import {isIP} from 'node:net';
const port=Number(process.env.PORT||3000), dir=process.env.PACEARR_STATE_DIR||'/data/state', file=join(dir,'setup.json');
let state={};try{state=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const sessions=new Map();let metadataCache=null;let verificationJob=null;const verifiedFiles=new Map(Object.entries(state.checksums||{}));let bulkRunning=false;let workerRunning=false;let feedCache={time:0,rows:[],error:null};let recovered=false;let officialCatalog=new Map();let officialFetched=0;let officialError=null;
async function cacheFile(name,data){const target=join(dir,name),tmp=target+'.tmp-'+randomBytes(5).toString('hex');await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,target)}
async function loadOfficial(){if(Date.now()-officialFetched<3600000&&officialCatalog.size)return;try{officialCatalog=await fetchOfficialReleases();officialFetched=Date.now();officialError=null;await cacheFile('official-releases.json',{time:officialFetched,entries:[...officialCatalog]})}catch(e){officialError=e.message}}
async function recordActivity(message,level='info',details={}){state.activity=[{...details,time:new Date().toISOString(),level,message},...(state.activity||[])].slice(0,1000);await persist()}
async function loadBetaMetadata(cfg){const base=cfg.metadataUrl||'https://onepacerr.com/api/v1';if(base.replace(/\/$/,'')!=='https://onepacerr.com/api/v1')throw Error('Use https://onepacerr.com/api/v1');try{const data=await boundedJSON(await fetch('https://onepacerr.com/api/v1/metadata',{redirect:'error',signal:AbortSignal.timeout(12000)}));metadataIndex(data);if(metadataCache?.lastUpdate!==data.lastUpdate){officialFetched=0;await cacheFile('beta-metadata.json',data)}metadataCache=data;metadataCache.fetchedAt=Date.now();metadataCache.stale=false;state.metadataWarning=null;return data}catch(e){state.metadataWarning=e.message;if(metadataCache){metadataCache.stale=true;metadataCache.fetchedAt=Date.now();return metadataCache}throw e}}

// Initialized before request handlers: inventory and reconciliation share this set.
const videoExt=new Set(['.mkv','.mp4','.m4v','.avi','.mov','.ts','.m2ts']);
// Phase 23: credentials are encrypted at rest and never returned by API.
// Key is persisted separately from the encrypted vault; both need NAS backup.
const vaultFile=join(dir,'credentials.enc.json'),keyFile=join(dir,'credentials.key');
let secrets={};let vaultKey;
async function initializeVault(){
 await mkdir(dir,{recursive:true});
 try{vaultKey=await readFile(keyFile)}catch(e){if(e.code!=='ENOENT')throw e;
  try{const h=await open(keyFile,'wx',0o600);try{await h.writeFile(randomBytes(32))}finally{await h.close()}}catch(err){if(err.code!=='EEXIST')throw err}
  vaultKey=await readFile(keyFile);
 }
 if(vaultKey.length!==32)throw Error('Credential key is invalid');
 await chmod(keyFile,0o600);
 let payload;try{payload=JSON.parse(await readFile(vaultFile,'utf8'))}catch(e){if(e.code==='ENOENT')return;throw e}
 const d=createDecipheriv('aes-256-gcm',vaultKey,Buffer.from(payload.iv,'base64'));
 d.setAuthTag(Buffer.from(payload.tag,'base64'));
 secrets=JSON.parse(Buffer.concat([d.update(Buffer.from(payload.data,'base64')),d.final()]).toString('utf8'));
}
await initializeVault();
try{const cached=JSON.parse(await readFile(join(dir,'beta-metadata.json'),'utf8'));metadataIndex(cached);metadataCache={...cached,fetchedAt:0,stale:true}}catch{}
try{const cached=JSON.parse(await readFile(join(dir,'official-releases.json'),'utf8'));if(Array.isArray(cached.entries)&&cached.entries.every(([h,v])=>/^[a-f0-9]{40}$/i.test(h)&&(v.crc===null||/^[a-f0-9]{8}$/i.test(v.crc))&&Number.isFinite(v.height)&&Array.isArray(v.audio)&&Array.isArray(v.subtitles)&&v.officialURL==='https://onepace.net/en/releases#urn:btih:'+h)){officialCatalog=new Map(cached.entries);officialFetched=cached.time||0}}catch{}

async function saveVault(){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',vaultKey,iv);
 const encrypted=Buffer.concat([c.update(JSON.stringify(secrets),'utf8'),c.final()]);
 const payload=JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
 const tmp=vaultFile+'.tmp-'+randomBytes(6).toString('hex');
 await writeFile(tmp,payload,{mode:0o600});await chmod(tmp,0o600);await rename(tmp,vaultFile);
}
function secretStatus(){return {plexToken:!!secrets.plexToken,delugePassword:!!secrets.delugePassword}}

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
function json(res,code,data,extra={}){res.writeHead(code,{...headers,'Content-Type':'application/json',...extra});res.end(JSON.stringify(data))}
function hash(pass,salt){return pbkdf2Sync(pass,salt,210000,32,'sha256').toString('hex')}
function authed(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)pacearr_session=([a-f0-9]{64})(?:;|$)/);return !!(match&&sessions.has(match[1]))}
let persistenceQueue=Promise.resolve();
function persist(){const snapshot=JSON.stringify(state,null,2);const operation=persistenceQueue.catch(()=>{}).then(async()=>{await mkdir(dir,{recursive:true});const tmp=file+'.tmp-'+randomBytes(5).toString('hex');await writeFile(tmp,snapshot,{mode:0o600});await chmod(tmp,0o600);await rename(tmp,file)});persistenceQueue=operation;return operation}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>262144)throw Error('Payload too large')}return JSON.parse(s||'{}')}
// Phase 18: all filesystem checks are metadata/access checks; no test files are created.
const roots={library:process.env.PACEARR_LIBRARY_ROOT||'/Media/Anime',download:process.env.PACEARR_DOWNLOAD_ROOT||'/Data/downloads'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function plexRead(url,headers){
  // Only retry read-only Plex GET requests. Never retry authorization failures.
  let last;
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep([0,2000,5000][attempt]);
    try{
      const r=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers});
      if(![429,502,503,504].includes(r.status)||attempt===2)return r;
      await r.body?.cancel();
    }catch(e){last=e;if(attempt===2)throw e;}
  }
  throw last||Error('Plex unavailable');
}
async function pathCheck(kind,configured){
  const root=roots[kind];
  if(typeof configured!=='string'||!configured||!isAbsolute(configured)||configured.includes('\\')||configured.split('/').includes('..'))return {ok:false,path:configured||'',message:'An absolute path inside the approved mount is required'};
  const normalized=resolve(configured),rel=relative(root,normalized);
  if(rel.startsWith('..')||isAbsolute(rel)||rel==='')return {ok:false,path:configured,message:'Path must be a subdirectory of '+root};
  try{
    const [actualRoot,actual]=await Promise.all([realpath(root),realpath(normalized)]);
    const within=relative(actualRoot,actual);
    if(within.startsWith('..')||isAbsolute(within)||within==='')return {ok:false,path:configured,message:'Path resolves outside the approved subdirectory'};
    const info=await stat(actual);if(!info.isDirectory())return {ok:false,path:configured,message:'Path is not a directory'};
    await access(actual,fsConstants.R_OK|fsConstants.X_OK);
    return {ok:true,path:configured,message:'Directory exists and passes read/traverse access checks (no files changed)'};
  }catch(e){return {ok:false,path:configured,message:e.code==='EACCES'?'Access denied':e.code==='ENOENT'?'Directory not found':'Unable to validate directory'};}
}
const allowed=['mediaServerType','mediaServerUrl','torrentType','torrentUrl','libraryPath','downloadPath','metadataUrl','delugeLabel'];
// Phase 21: bounded recursive library reconciliation and nested download discovery.
// No symlinks are followed. Any unreadable/oversized scan fails closed.

// Conservative release identity: arc + local installment, NOT global anime episode number alone.
function releaseInfo(name,rel=''){
 const stem=basename(name,extname(name));
 const range=/^\[One Pace\]\[(\d{1,4})-(\d{1,4})\]\s*(.+)$/i.exec(stem);
 const arcMatch=range? /^(.*?)\s+(\d{1,3})(?:\s|$)/.exec(range[3]):null;
 const rawArc=arcMatch?.[1]||null;
 const arc=rawArc?.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()||null;
 const installment=arcMatch?Number(arcMatch[2]):null;
 const quality=/(?:^|[\s\[(-])(2160|1080|720|480)p(?:[\s\])]|$)/i.exec(stem);
 const version=/\b(?:v|rev(?:ision)?)[ ._-]?(\d{1,2})\b/i.exec(stem);
 const releaseTag=/\[([0-9a-f]{8})\]$/i.exec(stem);
 const start=range?Number(range[1]):null,end=range?Number(range[2]):null;
 const valid=!!(range&&arc&&installment!==null&&start>0&&end>=start&&end-start<=30);
 return {recognized:valid,arc,installment,start,end,quality:quality?Number(quality[1]):null,version:version?Number(version[1]):null,releaseTag:releaseTag?.[1]?.toLowerCase()||null,stem};
}
function episodeRange(name){const x=releaseInfo(name);return x.recognized?{start:x.start,end:x.end}:null}
function sameArc(a,b){return !!(a.arc&&b.arc&&a.arc===b.arc)}
function compareRelease(candidate,existing){
 const a=candidate.release,b=existing.release;
 if(candidate.name.toLowerCase()===existing.name.toLowerCase())return {kind:'exact-name',reason:'Same filename'};
 if(!a.recognized||!b.recognized)return null;
 if(!sameArc(a,b))return null;
 // A release is not interchangeable with a different cut or installment.
 if(a.installment!==b.installment)return null;
 if(a.start!==b.start||a.end!==b.end)return {kind:'conflicting-range',reason:'Same arc installment but different episode coverage'};
 if(a.quality!==null&&b.quality!==null&&a.quality>b.quality)return {kind:'potential-upgrade',reason:`Higher resolution ${a.quality}p versus ${b.quality}p; review release variant`};
 if(a.version!==null&&b.version!==null&&a.version>b.version)return {kind:'potential-upgrade',reason:'Newer revision marker; review release variant'};
 return {kind:'existing-release',reason:'Same arc, installment and episode range; release variant needs review'};
}
async function scanTree(root,maxFiles=12000,maxDepth=12){
 const files=[];const queue=[{path:root,rel:'',depth:0}];let visited=0;
 while(queue.length){const next=queue.shift();if(next.depth>maxDepth)throw Error('Folder nesting exceeds safe scan limit');
  const entries=await readdir(next.path,{withFileTypes:true});
  for(const e of entries){if(++visited>maxFiles)throw Error('Scan exceeds safe entry limit');
   if(e.isSymbolicLink())throw Error('Symbolic link found; scan requires review');
   const rel=next.rel?next.rel+'/'+e.name:e.name,full=join(next.path,e.name);
   if(e.isDirectory())queue.push({path:full,rel,depth:next.depth+1});
   else if(e.isFile()&&videoExt.has(extname(e.name).toLowerCase())){const st=await lstat(full);if(st.size>=0)files.push({name:e.name,rel,size:st.size,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs,ino:st.ino,range:episodeRange(e.name),release:releaseInfo(e.name,rel)});}
  }
 }
 return {files,visited};
}
async function importPlan(){
 const cfg=state.settings||{};
 const [lib,down]=await Promise.all([pathCheck('library',cfg.libraryPath),pathCheck('download',cfg.downloadPath)]);
 if(!lib.ok||!down.ok)throw Error('Library and download paths must pass validation');
 const library=await realpath(cfg.libraryPath),download=await realpath(cfg.downloadPath);
 if(library===download||library.startsWith(download+'/')||download.startsWith(library+'/'))throw Error('Library and download directories must not overlap');
 const [libScan,downScan]=await Promise.all([scanTree(library),scanTree(download)]);
 let index=null,metadataError='',readTorrent=null,delugeError='';
 try{
  const data=await loadBetaMetadata(cfg);
  index=metadataIndex(data);
 }catch(e){metadataError=e.message}
 if(cfg.torrentType==='Deluge')try{readTorrent=await delugeReader(cfg.torrentUrl,secrets.delugePassword)}catch(e){delugeError=e.message}
 else delugeError='Select Deluge and save its credentials';
 const torrentCache=new Map();const checkDeadline=Date.now()+30000;

 const result=[];
 for(const f of downScan.files){if(!f.release.recognized)continue;
  const matches=libScan.files.map(x=>({file:x,match:compareRelease(f,x)})).filter(x=>x.match);
  // Unrecognized files are NOT automatically duplicates, but we cannot guarantee absence.
  // A safe auto-import requires a verified inventory/Deluge completion, not just a filename scan.
  const betaNamed=libScan.files.filter(x=>/^(?:Season \d{1,3})\//i.test(x.rel)&&/S\d{1,3}[-]?E\d{1,3}/i.test(x.name)).length;
  const unrecognized=libScan.files.filter(x=>!x.release.recognized&&!/S\d{1,3}[-]?E\d{1,3}/i.test(x.name)).length;
  let status='review-missing-candidate';
  if(matches.some(x=>x.match.kind==='exact-name'))status='already-in-library';
  else if(matches.some(x=>x.match.kind==='conflicting-range'))status='review-conflicting-coverage';
  else if(matches.some(x=>x.match.kind==='potential-upgrade'))status='potential-upgrade';
  else if(matches.length)status='already-in-library-or-variant';
  else if(f.rel.includes('/'))status='review-nested-download';
  const mapping=index?matchMetadata(index,f.release.releaseTag):{verified:false,reason:metadataError||'Metadata unavailable'};
  let completion={verified:false,reason:delugeError||'Metadata identity required'};let betaDecision=null;
  if(mapping.verified&&readTorrent){
   if(!torrentCache.has(mapping.hash)&&torrentCache.size<20&&Date.now()<checkDeadline){try{torrentCache.set(mapping.hash,await readTorrent(mapping.hash))}catch{torrentCache.set(mapping.hash,null)}}
   completion=verifyCompletion(mapping,torrentCache.get(mapping.hash),f,download);
  }
  if(mapping.verified){
   const existing=libScan.files.filter(x=>{const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(x.name);return m&&Number(m[1])===mapping.season&&Number(m[2])===mapping.episode});
   status=existing.length?'already-installed-or-potential-upgrade':completion.verified?'verified-missing-review-only':'review-incomplete-or-path';
   if(existing.length===1){const cached=verifiedFiles.get(existing[0].rel);if(cached&&cached.size===existing[0].size&&cached.mtimeMs===existing[0].mtimeMs&&cached.ctimeMs===existing[0].ctimeMs&&cached.ino===existing[0].ino){const ep=metadataCache?.arcs.find(a=>a.arc===mapping.season)?.episodes.find(e=>e.episode===mapping.episode);if(ep){betaDecision=assessInstalled(ep,cached.crc,{...defaultProfile,...state.betaProfile});status=betaDecision.status}}}
   for(const x of existing)matches.push({file:x,match:{kind:'metadata-season-episode',reason:'Existing season/episode; release version remains unverified'}});
  }
  const queueItem=state.importQueue?.[mapping.hash+'|'+f.rel];if(queueItem)status=queueItem.status;
  result.push({queue:queueItem||null,mapping,completion,betaDecision,importAllowed:false,name:f.name,relativePath:f.rel,size:f.size,range:`${f.release.start}-${f.release.end}`,arc:f.release.arc,installment:f.release.installment,quality:f.release.quality,status,unrecognizedLibraryFiles:unrecognized,betaNamedLibraryFiles:betaNamed,metadataMapping:mapping.verified?'verified':'unverified',matches:matches.slice(0,20).map(x=>({path:x.file.rel,kind:x.match.kind,reason:x.match.reason,quality:x.file.release.quality}))});
 }

 return {library,download,items:result,libraryFiles:libScan.files.length,downloadFiles:downScan.files.length,libraryEntries:libScan.visited,downloadEntries:downScan.visited,engine:'reconciliation-only',metadataError,delugeError,message:'Preview uses filename identity and read-only Deluge checks. The background queue computes actual checksums, verifies media tracks and imports only eligible episodes. Downloads, torrent changes and Plex mutations remain disabled; revisions and upgrades follow the automatic replacement profile.'};
}


function checksumValid(cached,f){return !!(cached&&/^[A-F0-9]{8}$/i.test(cached.crc||'')&&cached.size===f.size&&cached.mtimeMs===f.mtimeMs&&cached.ctimeMs===f.ctimeMs&&cached.ino===f.ino)}
function ignoredDownload(rel){const cfg=state.settings||{};return (state.ignoredDownloads||[]).some(x=>x.root===cfg.downloadPath&&(rel===x.path||x.folder&&rel.startsWith(x.path+'/')))}
async function saveChecksum(path,result){verifiedFiles.set(path,result);state.checksums=Object.fromEntries(verifiedFiles);await persist()}
function episodeFor(file){const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(file.name);return m?metadataCache?.arcs.find(a=>a.arc===Number(m[1]))?.episodes.find(e=>e.episode===Number(m[2])):null}
async function verifyAllLibrary(){
 if(bulkRunning||verificationJob?.status==='running'||workerRunning)return false;
 const cfg=state.settings||{};const check=await pathCheck('library',cfg.libraryPath);if(!check.ok)throw Error(check.message);
 if(bulkRunning||workerRunning||verificationJob?.status==='running')return false;
 bulkRunning=true;verificationJob={status:'running',kind:'bulk',done:0,total:0,failed:0,bytesDone:0,bytesTotal:0};
 void (async()=>{try{
  try{await loadBetaMetadata(cfg)}catch{}
  await loadOfficial();
  const root=await realpath(cfg.libraryPath),scan=await scanTree(root);if(state.checksumRoot!==root){verifiedFiles.clear();state.checksums={};state.checksumRoot=root}state.bulkVerification={root:cfg.libraryPath,kind:'bulk',status:'running',started:new Date().toISOString()};await recordActivity('Whole-library checksum verification started/resumed');verificationJob.total=scan.files.length;
  for(const f of scan.files){
   verificationJob.path=f.rel;verificationJob.bytesDone=0;verificationJob.bytesTotal=f.size;
   const cached=verifiedFiles.get(f.rel);try{
    const hashed=cached&&cached.size===f.size&&cached.mtimeMs===f.mtimeMs&&cached.ctimeMs===f.ctimeMs&&cached.ino===f.ino?cached:await hashLibraryFile(root,f.rel,(done,total)=>{verificationJob.bytesDone=done;verificationJob.bytesTotal=total});
    const published=officialForCRC(officialCatalog,hashed.crc);if(published)hashed.media=published;
    if(!hashed.media)try{hashed.media=await probeMedia(join(root,f.rel))}catch{hashed.mediaError='Media track inspection unavailable'}
    const ep=episodeFor(f),result={...hashed,...(ep?assessInstalled(ep,hashed.crc,{...defaultProfile,...state.betaProfile}):{status:'review-no-metadata',reason:'File hashed; episode metadata unavailable'}),checked:new Date().toISOString()};
    await saveChecksum(f.rel,result);if(state.checksumErrors)delete state.checksumErrors[f.rel];
   }catch(e){verificationJob.failed++;await recordActivity('Checksum failed for '+f.rel+': '+e.message,'error');state.checksumErrors={...state.checksumErrors,[f.rel]:e.message}}
   verificationJob.done++;state.bulkVerification={...state.bulkVerification,done:verificationJob.done,total:verificationJob.total,failed:verificationJob.failed};await persist();
  }
  verificationJob.status=verificationJob.failed?'complete-with-errors':'complete';state.bulkVerification={...state.bulkVerification,status:verificationJob.status,completed:new Date().toISOString()};await recordActivity(`Bulk checksum complete: ${verificationJob.done} files, ${verificationJob.failed} errors`);
 }catch(e){verificationJob={...verificationJob,status:'failed',error:e.message};state.bulkVerification={...state.bulkVerification,status:'failed'};await recordActivity('Bulk checksum failed: '+e.message,'error')}finally{bulkRunning=false}})();return true;
}
async function downloadFeed(force=false){
 const cfg=state.settings||{};
 if(!force&&Date.now()-feedCache.time<Math.max(250,Number(process.env.PACEARR_FEED_TTL_MS)||12000)&&feedCache.root===cfg.downloadPath)return feedCache;
 const check=await pathCheck('download',cfg.downloadPath);if(!check.ok)throw Error(check.message);
 if(cfg.torrentType!=='Deluge')throw Error('Select Deluge for the live download feed');
 const reader=await delugeReader(cfg.torrentUrl,secrets.delugePassword);const raw=await reader.list();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid Deluge torrent list');
 const down=await realpath(cfg.downloadPath),rows=scopedTorrents(raw,down),tracked=new Set(rows.map(r=>r.path));const disk=await scanTree(down);for(const f of disk.files)if(!tracked.has(f.rel))rows.push({key:'disk|'+f.rel,hash:null,path:f.rel,name:f.name,full:join(down,f.rel),size:f.size,mtimeMs:f.mtimeMs,ctimeMs:f.ctimeMs,state:'Untracked file',progress:null,selected:true,offline:true,torrent:null});feedCache={time:Date.now(),root:cfg.downloadPath,rows,torrents:raw,error:null};return feedCache;
}

const GRAB_CONFIRMATION_MS=5*60*1000;
function activeGrabHashes(feed,down){const active=new Set(feed.rows.filter(x=>x.hash&&x.selected!==false&&x.progress!==100).map(x=>x.hash));for(const [hash,t] of Object.entries(feed.torrents||{}))if((t.save_path===down||t.save_path?.startsWith(down+'/'))&&t.is_finished!==true)active.add(hash);for(const item of [...Object.values(state.manualGrabs||{}),...Object.values(state.acquisitions||{})])if(item.root===state.settings?.downloadPath&&['queued','confirming','downloading'].includes(item.status)&&!feed.torrents?.[item.hash]){if(!item.queuedAt)item.queuedAt=Date.now();if(Date.now()-item.queuedAt<GRAB_CONFIRMATION_MS)active.add(item.hash)};return active}
async function awaitingDelugeConfirmation(item,label){if(!['queued','confirming','downloading'].includes(item.status))return false;if(!item.queuedAt)item.queuedAt=Date.now();if(Date.now()-item.queuedAt<GRAB_CONFIRMATION_MS){if(item.status!=='confirming'){item.status='confirming';item.reason='Deluge accepted this torrent; waiting for it to appear in the feed';await recordActivity(label+': Deluge accepted the grab; waiting for metadata/feed confirmation','info',{event:'grab',season:item.season,episode:item.episode})}await persist();return true}item.status='error';item.attempts=5;item.reason='Deluge previously accepted this torrent but it is absent from the feed. Check Deluge, then Retry; no repeat add was sent.';await recordActivity(label+': '+item.reason,'error',{event:'grab',season:item.season,episode:item.episode});return true}
async function acquireUpdates(feed,library,lib,down,profile){
 if(!profile.fetchUpdates||metadataCache?.stale||state.autoImport===false||state.stoppedDownloads||state.bulkVerification?.status!=='complete')return;
 for(const file of library.files){
  const ep=episodeFor(file);if(!ep||ep.arc===0&&!profile.includeSpecials)continue;
  if(library.files.filter(f=>{const other=episodeFor(f);return other?.arc===ep.arc&&other.episode===ep.episode}).length!==1)continue;
  const wanted=releaseCandidates(ep.arc,ep.episode,profile).find(c=>c.preferred&&c.available&&c.profileMatch.ok);if(!wanted||releaseSuppressed(wanted.hash)||grabFor(wanted.hash,ep.arc,ep.episode))continue;
  let existing=verifiedFiles.get(file.rel);if(!checksumValid(existing,file)){existing=await hashLibraryFile(lib,file.rel);await saveChecksum(file.rel,existing)}
  const installed=assessInstalled(ep,existing.crc,profile);if(installed.status==='current')continue;
  const published=officialCatalog.get(wanted.hash);if(!published||published.crc!==wanted.crc)continue;
  const oldMedia=existing.media||await probeMedia(join(lib,file.rel)),decision=replacementPolicy(installed,oldMedia,published,profile);if(!decision.allowed||!decision.automatic)continue;
  state.manualGrabs=state.manualGrabs||{};state.manualGrabs[grabKey(wanted)]={...wanted,key:grabKey(wanted),root:state.settings.downloadPath,status:'requested',automatic:true,origin:decision.kind,reason:decision.reason,installedQuality:oldMedia.height,requested:new Date().toISOString()};await recordActivity(`Automatic ${decision.reason}: S${ep.arc}E${ep.episode}`,'info',{event:'grab',origin:decision.kind});
 }
}
function releaseCandidates(season,episode,profile){
 const ep=metadataCache?.arcs.find(a=>a.arc===season)?.episodes.find(e=>e.episode===episode);if(!ep)throw Error('Episode not found in current Beta metadata');
 const preferred=preferredRelease(ep,profile);return ['standard','extended','alternate'].filter(v=>ep.files?.[v]).map(variant=>{const f=ep.files[variant],published=officialCatalog.get(String(f.hash||'').toLowerCase()),identity=published&&published.crc===String(f.CRC32).toUpperCase()?published:null;let available=false;try{const uri=new URL(f.magnetURI);available=/^[a-f0-9]{40}$/i.test(f.hash)&&/^[a-f0-9]{8}$/i.test(f.CRC32)&&uri.protocol==='magnet:'&&uri.searchParams.getAll('xt').length===1&&uri.searchParams.get('xt').toLowerCase()==='urn:btih:'+f.hash.toLowerCase()&&!identity?.outdated}catch{}return {season,episode,title:ep.title,variant,hash:f.hash?.toLowerCase(),crc:f.CRC32?.toUpperCase(),available,preferred:preferred?.variant===variant,quality:identity?.height||null,audio:identity?.audio||[],subtitles:identity?.subtitles||[],profileMatch:identity?matchesProfile(identity,profile):{ok:true,deferred:true,reason:'Track details checked on completed file before import'},officialURL:identity?.officialURL,nyaaURL:published?.nyaaURL}});
}
function grabKey(c){return `${c.hash}|${c.season}:${c.episode}`}
function grabFor(hash,season,episode){return Object.values(state.manualGrabs||{}).find(x=>x.hash===hash&&x.season===season&&x.episode===episode&&x.root===state.settings?.downloadPath&&!['cancelled','expired'].includes(x.status))}
function releaseSuppressed(hash){return state.stoppedDownloads===true||(state.cancelledReleases||[]).some(x=>x.hash===hash&&x.root===state.settings?.downloadPath)}
async function queueGrabs(requests,profile){
 if(!Array.isArray(requests)||!requests.length||requests.length>600)throw Error('Select at least one episode');
 state.manualGrabs=state.manualGrabs||{};let queued=0;const skipped=[],scan=await scanTree(await realpath(state.settings.libraryPath));
 for(const req of requests){
  const candidates=releaseCandidates(req.season,req.episode,profile),choice=candidates.find(x=>x.variant===(req.variant||candidates.find(x=>x.preferred)?.variant));
  let reason=!choice?.available?'No current torrent available':!choice.profileMatch.ok&&!req.overrideProfile&&choice.quality?choice.profileMatch.reason:null;
  if(!reason){const files=scan.files.filter(f=>{const ep=episodeFor(f);return ep?.arc===req.season&&ep.episode===req.episode});if(files.some(f=>checksumValid(verifiedFiles.get(f.rel),f)&&verifiedFiles.get(f.rel).crc.toUpperCase()===choice.crc))reason='Identical release already installed'}
  const previous=choice&&grabFor(choice.hash,choice.season,choice.episode);if(!reason&&previous&&!['error','expired','imported'].includes(previous.status))reason='Already requested';
  if(reason){skipped.push({season:req.season,episode:req.episode,reason});continue}
  state.cancelledReleases=(state.cancelledReleases||[]).filter(x=>!(x.hash===choice.hash&&x.root===state.settings.downloadPath));
  if(state.torrentControls?.[choice.hash]?.action==='cancel')state.torrentControls[choice.hash]={root:state.settings.downloadPath,action:'resume',pending:true};
  state.manualGrabs[grabKey(choice)]={...choice,key:grabKey(choice),root:state.settings.downloadPath,status:'requested',overrideProfile:!!req.overrideProfile,requested:new Date().toISOString(),origin:'manual',reason:scan.files.some(f=>{const ep=episodeFor(f);return ep?.arc===choice.season&&ep.episode===choice.episode})?'Manual release/quality upgrade':'Manual missing episode'};queued++;
 }
 for(const item of skipped)await recordActivity(`S${item.season}E${item.episode}: grab skipped — ${item.reason}`,'info',{event:'grab',origin:'manual',season:item.season,episode:item.episode});await recordActivity(`Manual episode search: ${requests.length} selected, ${queued} grabs queued, ${skipped.length} skipped`,'info',{event:'grab',origin:'manual'});return {queued,skipped};
}
async function managedWriter(){return delugeReader(state.settings.torrentUrl,secrets.delugePassword,fetch,{allowAdd:true,allowManage:true,allowRemove:true})}
async function applyLabel(reader,hash,torrent){
 const name=state.settings?.delugeLabel;if(!name||torrent?.label===name)return;if(Date.now()<(state.labelRetryAt?.[hash]||0))return;
 try{const labels=await reader.labels();if(!labels.includes(name))throw Error('Saved label no longer exists');const options=await reader.labelOptions(name);if(options?.apply_move_completed&&options.move_completed)throw Error('Label moves completed files; disable its move rule in Deluge before applying');await reader.manage('label',hash,name);const verified=await reader(hash);if(verified.label!==name)throw Error('Deluge label assignment not yet confirmed');if(state.labelWarnings)delete state.labelWarnings[hash];if(state.labelRetryAt)delete state.labelRetryAt[hash];}
 catch(e){state.labelWarnings=state.labelWarnings||{};if(state.labelWarnings[hash]!==e.message)await recordActivity('Label '+name+' for '+hash+': '+e.message,'warning',{event:'label'});state.labelWarnings[hash]=e.message;state.labelRetryAt={...state.labelRetryAt,[hash]:Date.now()+60000}}
}
function torrentOwned(hash,torrent,down){
 if(!torrent||typeof torrent.save_path!=='string')return false;const scoped=torrent.save_path===down||torrent.save_path.startsWith(down+'/')||Array.isArray(torrent.files)&&torrent.files.length>0&&torrent.files.every(f=>typeof f.path==='string'&&!isAbsolute(f.path)&&!f.path.split('/').includes('..')&&isWithin(down,resolve(torrent.save_path,f.path)));if(!scoped)return false;
 return Object.values(state.manualGrabs||{}).some(x=>x.hash===hash&&x.root===state.settings.downloadPath)||Object.values(state.acquisitions||{}).some(x=>x.hash===hash&&x.root===state.settings.downloadPath)||Object.values(state.importQueue||{}).some(x=>x.hash===hash&&x.downloadRoot===down);
}
async function syncManagedTorrents(feed,down){
 let writer;const requests=Object.values(state.manualGrabs||{}),index=metadataIndex(metadataCache);
 for(const [hash,t] of Object.entries(feed.torrents||{})){
  if(!torrentOwned(hash,t,down))continue;writer=writer||await managedWriter();
  const control=state.torrentControls?.[hash];
  if(control?.root===state.settings.downloadPath&&(control.action==='pause'||control.action==='cancel')){if(control.pending||t.state!=='Paused')await writer.manage('pause',hash);control.pending=false;await applyLabel(writer,hash,t);continue}
  if(control?.action==='resume'&&control.pending){await writer.manage('resume',hash);control.pending=false}
  const tracking=state.torrentSelections?.[hash];
  if(tracking?.root===state.settings.downloadPath&&Array.isArray(t.files)&&t.files.length){
   const selected=requests.filter(x=>x.hash===hash&&!['cancelled','expired'].includes(x.status));let priorities,matched;try{const selection=selectTorrentFiles(t.files,index,selected,matchMetadata,metadataCache);priorities=selection.priorities;matched=new Set(selection.matched)}catch(e){tracking.reason=e.message;continue}
   const signature=JSON.stringify(priorities);if(!matched.size){tracking.reason='Waiting for unambiguous episode/file metadata; torrent stays paused';continue}
   if(tracking.signature!==signature){await writer.manage('pause',hash);await writer.manage('priorities',hash,priorities);tracking.signature=signature;tracking.needsResume=true;tracking.reason=`${matched.size} selected episode files; ${priorities.filter(x=>x===0).length} files skipped`;tracking.selectedBytes=t.files.reduce((n,f)=>n+(priorities[f.index]?f.size:0),0);await persist();if(!releaseSuppressed(hash)&&control?.action!=='pause'){await writer.manage('resume',hash);tracking.needsResume=false}await recordActivity('Bundle selection '+hash+': '+tracking.reason,'info',{event:'selection'})}
  }
  if(tracking?.needsResume&&!releaseSuppressed(hash)&&control?.action!=='pause'){await writer.manage('resume',hash);tracking.needsResume=false}
  await applyLabel(writer,hash,t);
 }
}
function untrackedConfirmed(row){const a=state.manualAssignments?.[row.key];return !!(a?.status==='imported'&&a.size===row.size&&a.mtimeMs===row.mtimeMs&&a.ctimeMs===row.ctimeMs)}
async function bundleMetadata(hash,url,reader){
 state.torrentMetadata=state.torrentMetadata||{};const cached=state.torrentMetadata[hash];
 if(cached){try{if(cached.cachedFile===('torrent-'+hash+'.json')){const saved=JSON.parse(await readFile(join(dir,cached.cachedFile),'utf8'));return decodeTorrent(Buffer.from(saved.base64,'base64'),hash)}if(cached.remotePath)return await reader.inspectMetadata(cached.remotePath,hash)}catch{delete state.torrentMetadata[hash]}}
 let directError;
 try{const metadata=await fetchTorrentMetadata(hash,url);await cacheFile('torrent-'+hash+'.json',{base64:metadata.base64});state.torrentMetadata[hash]={cachedFile:'torrent-'+hash+'.json'};await persist();return metadata}catch(e){directError=e.message}
 const errors=[directError];
 for(const source of torrentMetadataURLs(hash,url))try{const metadata=await reader.fetchMetadata(source,hash);state.torrentMetadata[hash]={remotePath:metadata.remotePath};await persist();return metadata}catch(e){errors.push('Deluge '+new URL(source).hostname+': '+e.message)}
 throw Error('Bundle metadata unavailable; no payload started. '+errors.join(' | ').slice(0,1800));
}
async function acquireRequested(feed,library,lib,down,profile){
 if(state.stoppedDownloads)return;
 const cfg=state.settings||{},raw=feed.torrents||{},active=activeGrabHashes(feed,down);
 const requests=Object.values(state.manualGrabs||{}).filter(x=>x.root===cfg.downloadPath&&!['imported','expired','cancelled'].includes(x.status)&&(state.autoImport!==false||!x.automatic)&&!releaseSuppressed(x.hash));let writer;
 let submitted=0;const attemptedHashes=new Set();for(const request of requests){
  if(releaseSuppressed(request.hash)||state.torrentControls?.[request.hash]?.action==='pause')continue;
  if(request.origin==='automatic-missing'&&library.files.some(f=>{const ep=episodeFor(f),identity=state.manualLibrary?.[f.rel],cached=verifiedFiles.get(f.rel);return ep?.arc===request.season&&ep.episode===request.episode&&identity?.root===lib&&identity.crc===cached?.crc&&checksumValid(cached,f)})){request.status='imported';request.reason='User-confirmed library file fills this episode; missing grab no longer needed';continue}
  const outcome=Object.values(state.importQueue||{}).find(x=>x.hash===request.hash&&x.season===request.season&&x.episode===request.episode&&x.libraryRoot===lib&&['imported','already-current'].includes(x.status));if(outcome){request.status='imported';continue}
  if(raw[request.hash]){const path=raw[request.hash].save_path;if(!torrentOwned(request.hash,raw[request.hash],down)){request.status='blocked-path';request.reason='Torrent exists in another Deluge folder; configured Download path required';continue}request.status='downloading';request.reason=state.torrentSelections?.[request.hash]?.reason||'Torrent already present in Deluge';continue}
  if(await awaitingDelugeConfirmation(request,`S${request.season}E${request.episode}`))continue;
  if(active.size>=profile.maxConcurrentDownloads||request.status==='error'&&(request.attempts>=5||Date.now()<(request.retryAt||0)))continue;
  const ep=metadataCache?.arcs.find(a=>a.arc===request.season)?.episodes.find(e=>e.episode===request.episode),file=ep?.files?.[request.variant];if(file?.hash?.toLowerCase()!==request.hash||file?.CRC32?.toUpperCase()!==request.crc){request.status='expired';request.reason='Release metadata changed; search again';continue}
  if(attemptedHashes.has(request.hash))continue;if(submitted>=2)break;submitted++;attemptedHashes.add(request.hash);
  try{writer=writer||await managedWriter();state.torrentSelections=state.torrentSelections||{};state.torrentSelections[request.hash]={root:cfg.downloadPath,reason:'Waiting for torrent file metadata; payload paused'};await persist();if(file.partOfBundle){const metadata=await bundleMetadata(request.hash,officialCatalog.get(request.hash)?.nyaaURL||request.nyaaURL,writer);const selection=selectTorrentFiles(metadata.files,metadataIndex(metadataCache),requests.filter(x=>x.hash===request.hash),matchMetadata,metadataCache);if(releaseSuppressed(request.hash)||state.torrentControls?.[request.hash]?.action==='pause')continue;if(metadata.remotePath)await writer.addRemoteFile(request.hash,metadata,down,selection.priorities);else await writer.addFile(request.hash,metadata,down,selection.priorities)}else await writer.add(file.magnetURI,request.hash,down);request.status=(state.cancelledReleases||[]).some(x=>x.hash===request.hash&&x.root===cfg.downloadPath)?'cancelled':'queued';request.queuedAt=Date.now();request.reason=releaseSuppressed(request.hash)?'Accepted while stop/cancel was requested; awaiting Deluge pause confirmation':'Accepted; selecting requested episode files before downloading';active.add(request.hash);raw[request.hash]={save_path:down,is_finished:false};await recordActivity(`${request.origin||'manual'} S${request.season}E${request.episode}: ${writer.lastAddOutcome==='added'?'Deluge accepted paused torrent':'Existing torrent reused'}; ${request.reason}`,'info',{event:'grab',origin:request.origin||'manual',season:request.season,episode:request.episode})}
  catch(e){request.status='error';request.reason=e.message;request.attempts=(request.attempts||0)+1;request.retryAt=Date.now()+Math.min(3600000,60000*2**(request.attempts-1));for(const sibling of requests)if(sibling.hash===request.hash){sibling.status='error';sibling.reason=e.message;sibling.attempts=request.attempts;sibling.retryAt=request.retryAt}await recordActivity(`Grab S${request.season}E${request.episode} attempt ${request.attempts}: ${e.message}; ${request.attempts>=5?'manual retry required':'retry scheduled'}`,'error')}
 }
}
async function manualImportRow(row,assignment,library,lib,down){
 const item=state.importQueue[row.key]={key:row.key,path:row.path,hash:row.hash,libraryRoot:lib,downloadRoot:down,status:'importing',reason:'User-assigned manual import',season:assignment.season,episode:assignment.episode};
 try{
  if(assignment.root!==down||assignment.libraryRoot!==lib)throw Error('Configured paths changed; assign this file again');
  if(row.offline){if(!assignment.confirmUntracked)throw Error('Confirm the untracked file is fully downloaded before importing')}else{const complete=verifyCompletion({verified:true,hash:row.hash},row.torrent,{rel:row.path,size:row.size},down,{allowBundles:true,selectedFiles:true});if(!complete.verified)throw Error(complete.reason)}
  const [selected]=await validateDownloadFiles(down,[row.path]);if(selected.size!==assignment.size||selected.mtimeMs!==assignment.mtimeMs||selected.ctimeMs!==assignment.ctimeMs)throw Error('Source changed since manual import was requested');
  const ep=metadataCache?.arcs.find(a=>a.arc===assignment.season)?.episodes.find(e=>e.episode===assignment.episode);if(!ep)throw Error('Selected episode metadata is unavailable');
  const existing=library.files.filter(f=>{const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(f.name);return m&&+m[1]===assignment.season&&+m[2]===assignment.episode});if(existing.length>1)throw Error('Multiple installed copies; resolve them before replacing');
  const source=await hashLibraryFile(down,row.path),media=await probeMedia(row.full);const targetRel=existing[0]?.rel||join(`Season ${String(assignment.season).padStart(2,'0')}`,targetFilename({season:assignment.season,episode:assignment.episode,title:ep.title},extname(row.name)));
  const options={downloadRoot:down,sourceRel:row.path,libraryRoot:lib,targetRel,expectedCRC:source.crc,journalMissing:existing.length?undefined:async journal=>{item.missingJournal=journal;await persist()}};let result;
  if(existing.length){const old=await hashLibraryFile(lib,existing[0].rel);if(old.crc===source.crc){item.status='already-current';item.reason='Identical bytes already installed';item.destination=existing[0].rel;assignment.status='imported';return}if(!assignment.replaceConfirmed)throw Error('Existing episode replacement must be confirmed');result=await importReplacement({...options,previousCRC:old.crc},async journal=>{item.journal=journal;await persist()})}else result=await importMissing(options);
  const info=await lstat(join(lib,result.path));await saveChecksum(result.path,{crc:source.crc,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino,media,status:'manual-import',checked:new Date().toISOString()});state.manualLibrary={...state.manualLibrary,[result.path]:{crc:source.crc,season:assignment.season,episode:assignment.episode,root:lib}};assignment.status='imported';item.status='imported';item.reason='Manual assignment imported; original download retained';item.destination=result.path;item.backup=result.backup||null;delete item.journal;delete item.missingJournal;
  const fresh={name:basename(result.path),rel:result.path,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino};const i=library.files.findIndex(x=>x.rel===result.path);if(i<0)library.files.push(fresh);else library.files[i]=fresh;await recordActivity(`Manually imported ${row.path} as S${assignment.season}E${assignment.episode}${result.backup?'; previous file: '+result.backup:''}`);
 }catch(e){assignment.status='error';assignment.reason=e.message;item.status='error';item.reason=e.message;await recordActivity(`Manual import failed for ${row.path}: ${e.message}`,'error')}
}

async function workerCycle(){
 if(workerRunning||bulkRunning||verificationJob?.status==='running'||Date.now()<(state.workerRetryAt||0))return;
 const cfg=state.settings||{};if(!cfg.libraryPath||!cfg.downloadPath)return;
 if(!state.bulkVerification||state.bulkVerification.root!==cfg.libraryPath||state.bulkVerification.status==='running'){try{await verifyAllLibrary()}catch{}return}
 workerRunning=true;state.lastWorkerCheck=new Date().toISOString();
 try{
  const libraryCheck=await pathCheck('library',cfg.libraryPath),downloadCheck=await pathCheck('download',cfg.downloadPath);if(!libraryCheck.ok||!downloadCheck.ok)throw Error(!libraryCheck.ok?'Library: '+libraryCheck.message:'Downloads: '+downloadCheck.message);
  const lib=await realpath(cfg.libraryPath),down=await realpath(cfg.downloadPath);if(lib===down||lib.startsWith(down+'/')||down.startsWith(lib+'/'))throw Error('Library and download paths overlap');
  state.importQueue=state.importQueue||{};const previousOutcomes=new Map(Object.values(state.importQueue).map(x=>[x.key,x.status+'|'+x.reason]));
  {for(const item of Object.values(state.importQueue)){if((item.journal||item.missingJournal)&&item.libraryRoot!==lib){item.status='review';item.reason='Recovery journal belongs to the previous library folder; restore that path before retrying';continue}if(item.missingJournal){try{const result=await recoverMissing(lib,item.missingJournal);if(result==='imported'){item.destination=item.missingJournal.targetRel;const info=await lstat(join(lib,item.destination));await saveChecksum(item.destination,{crc:item.missingJournal.expectedCRC,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino,media:item.media,checked:new Date().toISOString()})}delete item.missingJournal;item.status=result==='imported'?'imported':'pending';item.reason=result==='imported'?'Recovered completed verified import':'Interrupted copy cleaned; source retained for retry'}catch(e){item.status='error';item.reason=e.message;item.attempts=5}}if(item.journal){try{const result=await recoverReplacement(lib,item.journal);item.status=result==='imported'?'imported':'error';item.reason=result==='imported'?'Recovered verified import':'Original file restored after interrupted replacement; retry scheduled';if(result!=='imported'){item.attempts=(item.attempts||0)+1;item.retryAt=Date.now()+60000}delete item.journal;item.approved=false}catch(e){item.status='error';item.reason=e.message}}}await persist();recovered=true}
  const feed=await downloadFeed();
  if(!metadataCache||Date.now()-metadataCache.fetchedAt>Math.max(500,Number(process.env.PACEARR_METADATA_TTL_MS)||300000))await loadBetaMetadata(cfg);
  await loadOfficial();
  const index=metadataIndex(metadataCache),library=await scanTree(lib),profile={...defaultProfile,...state.betaProfile};
  for(const row of feed.rows){
   const previous=state.importQueue[row.key];const sameScope=previous?.libraryRoot===lib&&previous?.downloadRoot===down;const assignment=state.manualAssignments?.[row.key];if(!sameScope&&(previous?.journal||previous?.missingJournal))continue;if(ignoredDownload(row.path)&&assignment?.status!=='pending'){state.importQueue[row.key]={...previous,key:row.key,path:row.path,hash:row.hash,status:'ignored',reason:'Ignored by user',libraryRoot:lib,downloadRoot:down};continue}if(assignment?.status==='pending'){await manualImportRow(row,assignment,library,lib,down);continue}if(releaseSuppressed(row.hash)){state.importQueue[row.key]={...previous,key:row.key,path:row.path,hash:row.hash,status:'cancelled',reason:'Stopped/cancelled by user',libraryRoot:lib,downloadRoot:down};continue}if(sameScope&&(previous?.status==='imported'||previous?.status==='already-current')){const target=previous.destination;if((!row.offline||untrackedConfirmed(row))&&(!target||library.files.some(x=>x.rel===target)))continue}
   if(previous?.status==='error'&&(previous.attempts>=5||Date.now()<(previous.retryAt||0)))continue;
   const item={...(sameScope?previous:{}),libraryRoot:lib,downloadRoot:down,key:row.key,path:row.path,hash:row.hash,progress:row.progress,name:row.name,status:'downloading',reason:'Waiting for selected file completion',updated:new Date().toISOString()};state.importQueue[row.key]=item;
   if(state.torrentSelections?.[row.hash]&&row.selected===false){item.status='not-selected';item.reason='Not requested; bundle file skipped';continue}
   if(row.offline){if(assignment?.status==='error'){item.status='error';item.reason=assignment.reason}else{item.status='review-untracked';item.reason=assignment?.status==='imported'?'Untracked source changed since its previous import; confirm completion and assignment again':'File exists in download folder but is not tracked by Deluge; confirm completion and episode assignment';item.suggestion=episodeSuggestion(metadataCache,row.path,null)}continue}
   if(row.selected===false){item.status='not-selected';item.reason='Not selected for this torrent';continue}
   if(row.progress!==100){if(row.state==='Error'){item.status='error';item.reason='Deluge reports a torrent error; fix Deluge then retry'}continue}
   const crc=/\[([a-f0-9]{8})\](?=\.[^.]+$)/i.exec(row.name)?.[1];let mapping=matchMetadata(index,crc,row.hash);
   if(!mapping.verified){try{const source=await lstat(row.full),signature=`${source.size}:${source.mtimeMs}:${source.ctimeMs}:${source.ino}`;const hashed=item.identitySignature===signature&&item.computedCRC?{crc:item.computedCRC}:await hashLibraryFile(down,row.path);item.identitySignature=signature;item.computedCRC=hashed.crc;mapping=matchMetadata(index,hashed.crc,row.hash);if(!mapping.verified)item.computedCRC=hashed.crc}catch(e){item.status='error';item.reason=e.message;continue}}
   if(!mapping.verified){item.status='review';item.reason=mapping.reason;item.suggestion=episodeSuggestion(metadataCache,row.path,row.hash);if(item.suggestion){item.reason+='; '+item.suggestion.reason;const installed=library.files.filter(f=>{const ep=episodeFor(f);return ep?.arc===item.suggestion.season&&ep.episode===item.suggestion.episode});if(installed.length){item.status='review-existing-alternative';item.reason=`Episode S${item.suggestion.season}E${item.suggestion.episode} is already present; retained installed copy. Downloaded alternative identity needs confirmation; no missing import required`}}continue}
   item.season=mapping.season;item.episode=mapping.episode;
   const complete=verifyCompletion(mapping,row.torrent,{rel:row.path,size:row.size},down,{allowBundles:true,selectedFiles:true});if(!complete.verified){item.status='review';item.reason=complete.reason;continue}
   if(mapping.hash!==row.hash)item.torrentIdentityNote='Known release content verified inside a different completed torrent';
   const requested=grabFor(row.hash,mapping.season,mapping.episode);const manualGrab=!requested?.automatic&&requested?.root===cfg.downloadPath&&requested?.crc?.toLowerCase()===mapping.crc&&requested.season===mapping.season&&requested.episode===mapping.episode?requested:null;
   const arc=metadataCache.arcs.find(a=>a.arc===mapping.season),ep=arc?.episodes.find(e=>e.episode===mapping.episode),preferred=ep?(manualGrab?{variant:manualGrab.variant,...ep.files?.[manualGrab.variant]}:preferredRelease(ep,profile)):null;
   if(mapping.season===0&&!profile.includeSpecials&&!manualGrab){item.status='excluded';item.reason='Specials disabled';continue}
   const preferredIdentity=preferred&&String(preferred.CRC32).toLowerCase()===mapping.crc&&String(preferred.hash).toLowerCase()===row.hash;
   item.variantNote=preferredIdentity?'':'Verified available variant used to fill a missing episode';
   try{
    const info=await lstat(row.full);if(!info.isFile()||info.isSymbolicLink())throw Error('Download is not a regular file');
    const signature=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if(item.rejectedSignature===signature){item.status='review';item.reason='Downloaded checksum does not match Beta release';continue}
    if(item.sourceSignature!==signature){const hashed=await hashLibraryFile(down,row.path);if(hashed.crc.toLowerCase()!==mapping.crc){item.rejectedSignature=signature;item.status='review';item.reason='Downloaded checksum does not match Beta release';continue}delete item.rejectedSignature;item.sourceCRC=hashed.crc;const published=officialCatalog.get(mapping.hash);item.media=published&&published.crc===hashed.crc&&published.audio?.length?published:await probeMedia(row.full);item.sourceSignature=signature}
    const published=officialCatalog.get(mapping.hash);if(published&&published.crc===item.sourceCRC&&published.audio?.length){item.media=published;item.officialURL=published.officialURL;item.nyaaURL=published.nyaaURL;if(published.outdated)item.variantNote='Verified older release used to fill a missing episode'}
    const mediaCheck=matchesProfile(item.media,profile);item.languageNote=mediaCheck.ok?mediaCheck.reason:manualGrab?.overrideProfile?'Explicit manual profile exception':'';
    const existing=library.files.filter(f=>{const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(f.name);return m&&Number(m[1])===mapping.season&&Number(m[2])===mapping.episode});
    if(existing.length>1){item.status='review';item.reason='Multiple installed files for this episode';continue}
    let existingCRC=null;
    if(existing.length){
     const f=existing[0];const cached=verifiedFiles.get(f.rel);existingCRC=cached&&cached.size===f.size&&cached.mtimeMs===f.mtimeMs&&cached.ctimeMs===f.ctimeMs&&cached.ino===f.ino?cached:await hashLibraryFile(lib,f.rel);
     await saveChecksum(f.rel,existingCRC);
     if(existingCRC.crc===item.sourceCRC){item.status='already-current';item.reason='Identical release already installed';continue}
     if(!preferredIdentity&&!manualGrab){item.status='already-current';item.reason='Existing episode retained; downloaded fallback is not a preferred upgrade';continue}
     const installed=assessInstalled(ep,existingCRC.crc,profile);
     const oldMedia=existingCRC.media||await probeMedia(join(lib,f.rel));item.installedHeight=oldMedia.height;
     const replacement=replacementPolicy(installed,oldMedia,item.media,profile);if(!replacement.allowed&&(!manualGrab?.overrideProfile||item.media.height<oldMedia.height)){item.status='review';item.reason=replacement.reason;continue}item.changeKind=replacement.kind;item.changeDescription=replacement.reason;
     if(!manualGrab&&oldMedia.height===item.media.height&&installed.status==='current'){item.status='already-current';item.reason='Preferred release already installed';continue}
     item.replacementPath=f.rel;
     if(!manualGrab&&!replacement.automatic&&(!item.approved||item.approvedCRC!==item.sourceCRC||item.approvedPreviousCRC!==existingCRC.crc)){item.status='awaiting-authorisation';item.reason=`Replacement: ${oldMedia.height}p → ${item.media.height}p; old file will be preserved`;continue}
    }
    if(!mediaCheck.ok&&!manualGrab?.overrideProfile){item.status='awaiting-profile';item.reason=mediaCheck.reason;continue}
    if(state.bulkVerification?.status!=='complete'){item.status='awaiting-checksums';item.reason='Complete the library checksum baseline first';continue}
    if(state.autoImport===false&&!manualGrab){item.status='awaiting-authorisation';item.reason='Automatic imports paused';continue}
    if(!existing.length&&library.files.some(f=>!episodeFor(f))){item.status='review';item.reason='Unmapped library files must be reviewed before adding episodes';continue}
    const targetRel=existing.length?existing[0].rel:join(`Season ${String(mapping.season).padStart(2,'0')}`,targetFilename(mapping,extname(row.name).toLowerCase()));
    if(releaseSuppressed(row.hash)){item.status='cancelled';item.reason='Stopped/cancelled before import started';continue}
    item.status='importing';item.reason='Copying verified release';await persist();
    const options={downloadRoot:down,sourceRel:row.path,libraryRoot:lib,targetRel,expectedCRC:item.sourceCRC,journalMissing:existing.length?undefined:async journal=>{item.missingJournal=journal;await persist()}};
    const result=existing.length?await importReplacement({...options,previousCRC:existingCRC.crc},async journal=>{item.journal=journal;await persist()}):await importMissing(options);
    item.status='imported';item.reason='Verified copy imported; source torrent and Plex untouched. '+[item.variantNote,item.languageNote,item.torrentIdentityNote].filter(Boolean).join('; ');if(manualGrab){manualGrab.status='imported';manualGrab.destination=result.path}item.destination=result.path;item.backup=result.backup||null;delete item.journal;delete item.missingJournal;
    // Update the snapshot to prevent two candidates for the same episode in one cycle.
    const importedStat=await lstat(join(lib,result.path));await saveChecksum(result.path,{crc:result.crc,size:importedStat.size,mtimeMs:importedStat.mtimeMs,ctimeMs:importedStat.ctimeMs,ino:importedStat.ino,media:item.media,...assessInstalled(ep,result.crc,profile),checked:new Date().toISOString()});const freshFile={name:basename(result.path),rel:result.path,size:result.size,mtimeMs:importedStat.mtimeMs,ctimeMs:importedStat.ctimeMs,ino:importedStat.ino};const oldIndex=library.files.findIndex(x=>x.rel===result.path);if(oldIndex>=0)library.files[oldIndex]=freshFile;else library.files.push(freshFile);
    await recordActivity(`${existing.length?(item.changeKind==='quality-upgrade'?'Quality upgraded':item.changeKind==='variant-change'?'Release variant changed':'Release revised'):'Imported'} S${mapping.season}E${mapping.episode}; ${existing.length?'previous file backed up; ':''}seeding source retained${result.backup?'; backup: '+result.backup:''}`);
   }catch(e){item.status='error';item.reason=e.message;item.attempts=(item.attempts||0)+1;item.retryAt=Date.now()+Math.min(3600000,60000*2**(item.attempts-1));await recordActivity(`Import attempt ${item.attempts} failed for ${item.path}: ${e.message}; retry ${item.attempts>=5?'requires manual action':new Date(item.retryAt).toISOString()}`,'error')}
  }
  if(profile.autoMissing&&!state.stoppedDownloads&&state.autoImport!==false&&state.bulkVerification?.status==='complete'){
   state.manualGrabs=state.manualGrabs||{};
   const installedPairs=new Set(library.files.map(episodeFor).filter(Boolean).map(x=>x.arc+':'+x.episode));
   for(const arc of metadataCache.arcs)for(const ep of arc.episodes){
    if(arc.arc===0&&!profile.includeSpecials||installedPairs.has(arc.arc+':'+ep.episode))continue;
    const choice=releaseCandidates(arc.arc,ep.episode,profile).find(x=>x.preferred&&x.available&&x.profileMatch.ok);
    if(!choice||releaseSuppressed(choice.hash)||grabFor(choice.hash,arc.arc,ep.episode))continue;
    const cancelled=Object.values(state.manualGrabs).some(x=>x.root===cfg.downloadPath&&x.hash===choice.hash&&x.season===arc.arc&&x.episode===ep.episode&&x.status==='cancelled');
    if(cancelled)continue;
    state.manualGrabs[grabKey(choice)]={...choice,key:grabKey(choice),root:cfg.downloadPath,status:'requested',automatic:true,origin:'automatic-missing',reason:'Missing episode',requested:new Date().toISOString()};
   }
  }
  await acquireUpdates(feed,library,lib,down,profile);await acquireRequested(feed,library,lib,down,profile);await syncManagedTorrents(feed,down);
  for(const item of Object.values(state.importQueue)){if(previousOutcomes.get(item.key)!==item.status+'|'+item.reason)await recordActivity(`${item.path}: ${item.status.replaceAll('-',' ')} — ${item.reason}`,item.status==='error'?'error':item.status==='review'?'warning':'info')}
  // Keep active queue bounded while retaining the most recent completed outcomes.
  const items=Object.values(state.importQueue).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  state.importQueue=Object.fromEntries(items.slice(0,1000).map(x=>[x.key,x]));if(state.workerError)await recordActivity('Import worker recovered; verified processing resumed');state.workerError=null;state.workerFailures=0;state.workerRetryAt=0;await persist();
 }catch(e){if(state.workerError!==e.message)await recordActivity('Import worker deferred: '+e.message,'error');state.workerError=e.message;state.workerFailures=(state.workerFailures||0)+1;state.workerRetryAt=Date.now()+Math.min(3600000,15000*2**Math.min(8,state.workerFailures-1));await persist()}finally{workerRunning=false;state.nextWorkerCheck=new Date(Math.max(state.workerRetryAt||0,Date.now()+Math.max(500,Number(process.env.PACEARR_WORKER_INTERVAL_MS)||15000))).toISOString()}
}

const server=http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');const path=url.pathname;
if(path==='/api/healthz'&&req.method==='GET')return json(res,200,{ok:true,mode:'standalone-setup',engine:'verified-import-worker'});
if(path==='/api/setup/status'&&req.method==='GET')return json(res,200,{initialized:!!state.passwordHash,authenticated:authed(req),engine:'verified-import-worker'});
if(path==='/api/setup/create'&&req.method==='POST'){
 if(state.passwordHash)return json(res,409,{error:'Already initialized'});
 const b=await body(req);if(typeof b.username!=='string'||!/^[a-zA-Z0-9_-]{3,32}$/.test(b.username)||typeof b.password!=='string'||b.password.length<12||b.password.length>256)return json(res,400,{error:'Username 3–32 characters; password at least 12 characters'});
 const salt=randomBytes(16).toString('hex');state={username:b.username,salt,passwordHash:hash(b.password,salt),settings:{}};await persist();return json(res,201,{ok:true});}
if(path==='/api/setup/login'&&req.method==='POST'){
 const b=await body(req);if(!state.passwordHash||typeof b.password!=='string')return json(res,401,{error:'Invalid credentials'});
 const check=Buffer.from(hash(b.password,state.salt),'hex'),actual=Buffer.from(state.passwordHash,'hex');if(b.username!==state.username||check.length!==actual.length||!timingSafeEqual(check,actual))return json(res,401,{error:'Invalid credentials'});
 const token=randomBytes(32).toString('hex');sessions.set(token,Date.now());return json(res,200,{ok:true},{'Set-Cookie':`pacearr_session=${token}; HttpOnly; SameSite=Strict; Path=/`});}
if(path==='/api/setup/logout'&&req.method==='POST'){const m=(req.headers.cookie||'').match(/pacearr_session=([a-f0-9]{64})/);if(m)sessions.delete(m[1]);return json(res,200,{ok:true},{'Set-Cookie':'pacearr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
if(path==='/api/setup/credentials'&&req.method==='GET'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 return json(res,200,{saved:secretStatus()});
}
if(path==='/api/setup/credentials'&&req.method==='PUT'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const b=await body(req);
 if(!['plexToken','delugePassword'].includes(b.name)||typeof b.value!=='string'||b.value.length>1024||!['save','clear'].includes(b.action))return json(res,400,{error:'Invalid credential update'});
 if(b.action==='save'&&!b.value)return json(res,400,{error:'Empty secret cannot be saved'});
 if(b.action==='clear')delete secrets[b.name];else secrets[b.name]=b.value;
 await saveVault();return json(res,200,{ok:true,saved:secretStatus()});
}
// A saved secret is never sent on ordinary page load. Explicit administrator
// password verification is required for each reveal; no persistent reveal token.
if(path==='/api/setup/credentials/reveal'&&req.method==='POST'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const b=await body(req);
 if(!['plexToken','delugePassword'].includes(b.name)||typeof b.password!=='string'||b.password.length>256)return json(res,400,{error:'Invalid reveal request'});
 const check=Buffer.from(hash(b.password,state.salt),'hex'),actual=Buffer.from(state.passwordHash,'hex');
 if(check.length!==actual.length||!timingSafeEqual(check,actual))return json(res,403,{error:'Administrator password incorrect'});
 if(!secrets[b.name])return json(res,404,{error:'No saved credential'});
 return json(res,200,{value:secrets[b.name]});
}
// Read-only bridge to the original Beta local-folder library conventions:
// Season NN / SxxExx, Sxx-Eyy and NN-EE, with no file mutations.
if(path==='/api/setup/beta-library-inventory'&&req.method==='GET'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 const check=await pathCheck('library',state.settings?.libraryPath);
 if(!check.ok)return json(res,400,{error:check.message});
 const root=await realpath(state.settings.libraryPath),scan=await scanTree(root);
 const entries=[];let unrecognized=0;
 for(const f of scan.files){
  const season=/^Season (\d{1,3})$/i.exec(f.rel.split('/').slice(-2,-1)[0]||'');
  const code=/S(\d{1,3})[-]?E(\d{1,3})/i.exec(f.name);
  const fallback=season?new RegExp('(?:^|[^0-9])'+season[1].padStart(2,'0')+'-(\\d{2,3})(?:[^0-9]|$)').exec(f.name):null;
  const episode=code?Number(code[2]):fallback?Number(fallback[1]):null;
  const arc=code?Number(code[1]):season?Number(season[1]):null;
  if(arc!==null&&episode!==null){if(entries.length<150)entries.push({path:f.rel,season:arc,episode});}
  else unrecognized++;
 }
 return json(res,200,{ok:true,scanned:scan.files.length,recognizedCount:scan.files.length-unrecognized,unrecognizedCount:unrecognized,sample:entries,source:'Beta local-folder naming conventions',engine:'verified-import-worker'});
}
if(path==='/api/setup/test-connection'&&req.method==='POST'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const b=await body(req);
 if(!b.token&&secrets.plexToken)b.token=secrets.plexToken;
 if(!b.password&&secrets.delugePassword)b.password=secrets.delugePassword;
 if(!['Plex','Deluge'].includes(b.type)||typeof b.url!=='string'||b.url.length>256)return json(res,400,{error:'Invalid test parameters'});
 let target;try{target=new URL(b.url)}catch{return json(res,400,{error:'Invalid URL'})}
 if(target.protocol!=='http:'||target.username||target.password||target.hash||target.search||!isIP(target.hostname.replace(/^\[|\]$/g,'')))return json(res,400,{error:'Use a private-network HTTP IP address without credentials or query parameters'});
 const host=target.hostname.replace(/^\[|\]$/g,'');
 const parts=host.split('.').map(Number);
 const private4=isIP(host)===4&&(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168));
 if(!private4)return json(res,400,{error:'Only RFC1918 private IPv4 addresses are supported for connection testing'});
 const expected=b.type==='Plex'?'Plex':'Deluge';
 if(b.type==='Plex' && (typeof b.token!=='string'||b.token.length>1024))return json(res,400,{error:'Invalid token'});
 if(b.type==='Deluge' && (typeof b.password!=='string'||!b.password||b.password.length>1024))return json(res,400,{error:'Enter your Deluge WebUI password for the test'});
 try{
  let response;
  if(expected==='Plex'){
   const dest=new URL('/identity',target);
   response=await plexRead(dest,{...(b.token?{'X-Plex-Token':b.token}:{})});
   if(!response.ok)return json(res,200,{ok:false,message:'Plex returned HTTP '+response.status+'; verify address and token'});
   const txt=(await response.text()).slice(0,4000);
   if(!/<MediaContainer\b/i.test(txt))return json(res,200,{ok:false,message:'Endpoint responded but did not return a Plex identity'});
   return json(res,200,{ok:true,message:'Plex identity endpoint responded successfully (read-only)'});
  }
  const dest=new URL('/json',target);
  response=await fetch(dest,{method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'auth.login',params:[b.password],id:1})});
  if(!response.ok)return json(res,200,{ok:false,message:'Deluge returned HTTP '+response.status});
  const data=await response.json();
  if(data.result===true)return json(res,200,{ok:true,message:'Deluge WebUI authentication succeeded (no torrents modified)'});
  return json(res,200,{ok:false,message:'Deluge authentication failed; verify WebUI URL and password'});
 }catch(e){return json(res,200,{ok:false,message:'Connection failed or timed out; check service address and network access'})}
}
if(path==='/api/setup/discover'&&req.method==='POST'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const b=await body(req);
 if(!b.token&&secrets.plexToken)b.token=secrets.plexToken;
 if(!b.password&&secrets.delugePassword)b.password=secrets.delugePassword;
 if(!['Plex','Deluge'].includes(b.type)||typeof b.url!=='string'||b.url.length>256)return json(res,400,{error:'Invalid discovery request'});
 let target;try{target=new URL(b.url)}catch{return json(res,400,{error:'Invalid URL'})}
 const host=target.hostname.replace(/^\[|\]$/g,'');const parts=host.split('.').map(Number);
 if(target.protocol!=='http:'||target.username||target.password||target.hash||target.search||target.pathname!=='/'||isIP(host)!==4||!(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168)))return json(res,400,{error:'Use an RFC1918 private IPv4 HTTP server URL with no path, credentials or query'});
 if(b.type==='Plex'){
  if(typeof b.token!=='string'||!b.token||b.token.length>1024)return json(res,400,{error:'Plex token required for library discovery'});
  try{
   const dest=new URL('/library/sections',target);
   const r=await plexRead(dest,{'X-Plex-Token':b.token,'Accept':'application/json'});
   if(!r.ok)return json(res,200,{ok:false,message:'Plex returned HTTP '+r.status});
   const raw=await r.text();if(raw.length>2097152)return json(res,200,{ok:false,message:'Plex library response exceeded size limit'});
   let data;try{data=JSON.parse(raw)}catch{return json(res,200,{ok:false,message:'Plex did not return JSON; verify server and token'})}
   const dirs=data?.MediaContainer?.Directory;if(!Array.isArray(dirs))return json(res,200,{ok:false,message:'No library list found in Plex response'});
   const libraries=dirs.slice(0,200).map(x=>({id:String(x.key??'').slice(0,80),title:String(x.title??'').slice(0,160),type:String(x.type??'').slice(0,60),agent:String(x.agent??'').slice(0,120)}));
   return json(res,200,{ok:true,libraries,count:libraries.length,message:'Plex libraries retrieved (read-only)'});
  }catch(e){return json(res,200,{ok:false,message:'Plex discovery failed or timed out'})}
 }
 if(typeof b.password!=='string'||!b.password||b.password.length>1024)return json(res,400,{error:'Deluge WebUI password required'});
 try{
  const cfg=state.settings||{},check=await pathCheck('download',cfg.downloadPath);if(!check.ok)return json(res,200,{ok:false,message:check.message});
  const reader=await delugeReader(b.url,b.password),rows=scopedTorrents(await reader.list(),await realpath(cfg.downloadPath));
  return json(res,200,{ok:true,torrents:rows.map(x=>({id:x.hash,name:x.path,state:x.state,progress:x.progress,save_path:cfg.downloadPath})),count:rows.length,message:'Only torrent video files beneath the configured download folder are shown'});
 }catch(e){return json(res,200,{ok:false,message:e.message})}
}
// Phase 19: bounded, strictly read-only preview. No file operations are performed.
if(path==='/api/setup/processing-preview'&&req.method==='GET'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 const cfg=state.settings||{};
 const [lib,down]=await Promise.all([pathCheck('library',cfg.libraryPath),pathCheck('download',cfg.downloadPath)]);
 if(!lib.ok||!down.ok)return json(res,200,{ok:false,engine:'verified-import-worker',message:'Validate both saved paths first',checks:{library:lib,download:down}});
 const allowedExt=new Set(['.mkv','.mp4','.m4v','.avi','.mov','.ts','.m2ts']);
 const rootLib=await realpath(cfg.libraryPath),rootDown=await realpath(cfg.downloadPath);
 if(rootLib===rootDown)return json(res,200,{ok:false,message:'Library and download folders must be different'});
 const entries=(await readdir(rootDown,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
 const preview=[];let ignored=0,unsafe=0,duplicates=0,candidates=0;
 for(const entry of entries.slice(0,500)){
  if(preview.length>=100)break;
  if(!entry.isFile()||!allowedExt.has(extname(entry.name).toLowerCase())){ignored++;continue}
  const source=join(rootDown,entry.name),dest=join(rootLib,entry.name);
  const sourceInfo=await lstat(source).catch(()=>null);
  if(!sourceInfo||!sourceInfo.isFile()||sourceInfo.isSymbolicLink()){unsafe++;continue}
  // Verify path containment, including unexpected symlinks.
  const actualSource=await realpath(source).catch(()=>null);
  if(!actualSource||relative(rootDown,actualSource).startsWith('..')||isAbsolute(relative(rootDown,actualSource))){unsafe++;continue}
  const targetInfo=await lstat(dest).catch(e=>e.code==='ENOENT'?null:({blocked:true}));
  let status='candidate',reason='Preview only — naming and metadata matching not yet verified';
  if(targetInfo){status='duplicate-or-conflict';reason='Destination already exists or cannot be safely inspected';duplicates++}
  else candidates++;
  preview.push({name:entry.name,size:sourceInfo.size,status,reason});
 }
 return json(res,200,{ok:true,engine:'verified-import-worker',mode:'read-only-preview',source:cfg.downloadPath,destination:cfg.libraryPath,scanned:Math.min(entries.length,500),totalTopLevelEntries:entries.length,limited:entries.length>500||preview.length>=100,counts:{candidates,duplicates,ignored,unsafe},items:preview,message:'No files moved, renamed, deleted, downloaded or written. Only top-level video files were inspected. Candidates are NOT approved for automatic processing.'});
}

if(path==='/api/setup/import-plan'&&req.method==='POST'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 try{return json(res,200,{ok:true,...await importPlan()})}catch(e){return json(res,200,{ok:false,error:e.message})}
}
if(path==='/api/setup/import-one'&&req.method==='POST')return json(res,409,{error:'Phase 26 keeps all imports disabled; verification is read-only'});
if(path==='/api/setup/path-health'&&req.method==='GET'){
 if(!authed(req))return json(res,401,{error:'Login required'});
 const settings=state.settings||{};
 const [library,download]=await Promise.all([pathCheck('library',settings.libraryPath),pathCheck('download',settings.downloadPath)]);
 return json(res,200,{ok:library.ok&&download.ok,engine:'verified-import-worker',checks:{library,download},selectedLibraryCount:Array.isArray(settings.selectedLibraryIds)?settings.selectedLibraryIds.length:0});
}

// Phase 27 management endpoints: actions remain read-only except saved preferences/state.
if(path.startsWith('/api/setup/manage/')){
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const cfg=state.settings||{},profile={...defaultProfile,...state.betaProfile};
 
 
 if(path==='/api/setup/manage/labels'&&req.method==='POST'){
  const b=await body(req),reader=await delugeReader(b.url||cfg.torrentUrl,b.password||secrets.delugePassword,fetch,{allowManage:true});try{if(b.create)await reader.createLabel(String(b.create).trim().toLowerCase());const labels=await reader.labels();let options=null;if(b.name){if(!labels.includes(b.name))return json(res,400,{error:'Selected label was not found in Deluge'});options=await reader.labelOptions(b.name)}return json(res,200,{ok:true,labels,verified:b.name||null,moveConflict:!!(options?.apply_move_completed&&options.move_completed)})}catch(e){return json(res,400,{error:e.message})}
 }
 if(path==='/api/setup/manage/torrents'&&req.method==='POST'){
  const deferControl=workerRunning;
  const b=await body(req);if(!['pause','resume','cancel','stop-all','resume-all','clear-queue'].includes(b.action))return json(res,400,{error:'Invalid download action'});
  const down=await realpath(cfg.downloadPath),feed=await downloadFeed(true),all=['stop-all','resume-all','clear-queue'].includes(b.action);
  if(!all&&(!Array.isArray(b.hashes)||!b.hashes.length||b.hashes.length>200))return json(res,400,{error:'Select 1–200 torrents'});
  const owned=new Set([...Object.values(state.manualGrabs||{}),...Object.values(state.acquisitions||{})].filter(x=>x.root===cfg.downloadPath).map(x=>x.hash));for(const row of feed.rows)if(torrentOwned(row.hash,row.torrent,down))owned.add(row.hash);
  const hashes=all?[...owned]:[...new Set(b.hashes)];if(hashes.some(h=>!owned.has(h)))return json(res,400,{error:'Torrent is not managed by Pacearr in this download folder'});
  if(b.action==='stop-all')state.stoppedDownloads=true;if(b.action==='resume-all')state.stoppedDownloads=false;
  state.torrentControls=state.torrentControls||{};state.cancelledReleases=state.cancelledReleases||[];
  const results=[];let writer;
  for(const hash of hashes){const torrent=feed.torrents?.[hash],pending=Object.values(state.manualGrabs||{}).filter(x=>x.hash===hash&&x.root===cfg.downloadPath);
   if(b.action==='clear-queue'&&(torrent||!pending.some(x=>x.status==='requested'||x.status==='error')))continue;
   const action=b.action==='resume-all'?'resume':b.action==='stop-all'?'pause':b.action==='clear-queue'?'cancel':b.action;
   state.torrentControls[hash]={root:cfg.downloadPath,action,pending:true};if(action==='cancel'){if(!state.cancelledReleases.some(x=>x.hash===hash&&x.root===cfg.downloadPath))state.cancelledReleases.push({hash,root:cfg.downloadPath});for(const x of pending)x.status='cancelled'}
   if(action==='resume'){state.cancelledReleases=state.cancelledReleases.filter(x=>!(x.hash===hash&&x.root===cfg.downloadPath));for(const x of pending)if(x.status==='cancelled')x.status='requested'}
   await persist();
   if(torrent){if(deferControl){results.push({hash,status:'pending',reason:'Control saved; current file operation may finish before Deluge confirmation'});continue}if(!torrentOwned(hash,torrent,down)){results.push({hash,status:'blocked-path',reason:'Torrent is outside configured folder'});continue}try{writer=writer||await managedWriter();await writer.manage(action==='cancel'?'pause':action,hash);state.torrentControls[hash].pending=false;results.push({hash,status:action==='cancel'?'cancelled; torrent paused, files retained':action})}catch(e){results.push({hash,status:'pending',reason:e.message})}}
   else results.push({hash,status:action==='cancel'?'cancelled; late torrent will be paused':'pending until torrent appears'});
  }
  feedCache.time=0;await recordActivity(`Download control ${b.action}: ${results.length} managed torrents; source files retained`,'info',{event:'download-control'});return json(res,200,{ok:true,results});
 }
 if(path==='/api/setup/manage/recheck'&&req.method==='POST'){
  if(workerRunning||bulkRunning)return json(res,409,{error:'File operation active; retry shortly'});
  for(const item of Object.values(state.importQueue||{}))if(!item.journal&&!['imported','already-current','ignored','cancelled'].includes(item.status)){item.status='pending';item.attempts=0;item.retryAt=0;delete item.rejectedSignature;delete item.sourceSignature}
  metadataCache&&(metadataCache.fetchedAt=0);officialFetched=0;feedCache.time=0;state.workerRetryAt=0;await recordActivity('Rechecking completed downloads; existing files reused, saved pause/ignore decisions respected');void workerCycle();return json(res,202,{ok:true});
 }
 if(path==='/api/setup/manage/search'&&req.method==='POST'){
  const b=await body(req);await loadBetaMetadata(cfg);await loadOfficial();
  if(b.scope==='library'){
   const check=await pathCheck('library',cfg.libraryPath);if(!check.ok)return json(res,400,{error:check.message});const scan=await scanTree(await realpath(cfg.libraryPath)),plan=[];
   for(const arc of metadataCache.arcs)for(const ep of arc.episodes){if(arc.arc===0&&!profile.includeSpecials)continue;const files=scan.files.filter(f=>{const other=episodeFor(f);return other?.arc===arc.arc&&other?.episode===ep.episode});if(files.length>1)continue;const installed=files[0]&&verifiedFiles.get(files[0].rel);if(files[0]&&(!checksumValid(installed,files[0])||assessInstalled(ep,installed.crc,profile).status==='current'))continue;const choices=releaseCandidates(arc.arc,ep.episode,profile),choice=choices.find(c=>c.preferred&&c.available);if(choice)plan.push({...choice,present:!!files.length,reason:files.length?'Update available':'Missing episode'})}
   return json(res,200,{ok:true,scope:'library',candidates:plan,missing:plan.filter(x=>!x.present).length,updates:plan.filter(x=>x.present).length});
  }
  if(!Number.isInteger(b.season)||!Number.isInteger(b.episode))return json(res,400,{error:'Choose a season and episode'});return json(res,200,{ok:true,candidates:releaseCandidates(b.season,b.episode,profile)});
 }
 if(path==='/api/setup/manage/grab'&&req.method==='POST'){
  const b=await body(req);await loadBetaMetadata(cfg);await loadOfficial();return json(res,202,{ok:true,...await queueGrabs(b.requests,profile)});
 }
 if(path==='/api/setup/manage/review'&&req.method==='POST'){
  const b=await body(req),feed=await downloadFeed(),row=feed.rows.find(x=>x.key===b.key);if(!row)return json(res,404,{error:'File not found in the scoped download feed'});const info=await lstat(row.full),episodes=metadataCache?.arcs.flatMap(a=>a.episodes.map(e=>({season:a.arc,episode:e.episode,title:e.title})))||[];const suggestion=episodeSuggestion(metadataCache,row.path,row.hash);return json(res,200,{ok:true,file:{key:row.key,path:row.path,size:info.size,state:row.state,progress:row.progress,hash:row.hash,suggestion:episodeSuggestion(metadataCache,row.path,row.hash),queue:state.importQueue?.[row.key]||null},episodes,suggestion,offline:!!row.offline});
 }
 if(path==='/api/setup/manage/ignore'&&req.method==='POST'){
  const b=await body(req),feed=await downloadFeed(),row=feed.rows.find(x=>x.key===b.key);if(!row)return json(res,404,{error:'Download file not found'});const ignored=b.folder?dirname(row.path):row.path;if(b.folder&&ignored==='.')return json(res,400,{error:'Cannot ignore the entire download root'});state.ignoredDownloads=(state.ignoredDownloads||[]).filter(x=>!(x.root===cfg.downloadPath&&x.path===ignored));if(b.ignored!==false)state.ignoredDownloads.push({root:cfg.downloadPath,path:ignored,folder:!!b.folder});await recordActivity(`${b.ignored===false?'Restored':'Ignored'} download ${ignored}`);return json(res,200,{ok:true});
 }
 if(path==='/api/setup/manage/manual-import'&&req.method==='POST'){
  const b=await body(req);if(!Array.isArray(b.assignments)||!b.assignments.length||b.assignments.length>200)return json(res,400,{error:'Select 1–200 files'});await loadBetaMetadata(cfg);const feed=await downloadFeed(),root=await realpath(cfg.downloadPath),lib=await realpath(cfg.libraryPath);const targets=new Set(),prepared=[];
  for(const request of b.assignments){const row=feed.rows.find(x=>x.key===request.key);if(!row)return json(res,400,{error:'Selected file is not in the configured folder'});const ep=metadataCache.arcs.find(a=>a.arc===request.season)?.episodes.find(e=>e.episode===request.episode);if(!ep)return json(res,400,{error:'Choose an existing metadata episode for every file'});const pair=request.season+':'+request.episode;if(targets.has(pair))return json(res,400,{error:'Multiple selected files cannot target the same episode'});targets.add(pair);const [info]=await validateDownloadFiles(root,[row.path]);if(row.offline){if(request.confirmUntracked!==true)return json(res,400,{error:'Confirm each untracked file is fully downloaded before importing'})}else{const complete=verifyCompletion({verified:true,hash:row.hash},row.torrent,{rel:row.path,size:row.size},root,{allowBundles:true,selectedFiles:true});if(!complete.verified)return json(res,400,{error:row.path+': '+complete.reason})}prepared.push({...request,root,libraryRoot:lib,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,status:'pending'})}
  state.manualAssignments=state.manualAssignments||{};for(const item of prepared){state.manualAssignments[item.key]=item;state.ignoredDownloads=(state.ignoredDownloads||[]).filter(x=>!(x.root===cfg.downloadPath&&x.path===feed.rows.find(r=>r.key===item.key).path));const existing=state.importQueue?.[item.key];if(existing){existing.status='pending';existing.attempts=0;existing.retryAt=0}}
  await recordActivity(`${prepared.length} manual imports queued with explicit episode assignments`);return json(res,202,{ok:true,queued:prepared.length});
 }
 if(path==='/api/setup/manage/delete'&&req.method==='POST'){
  if(workerRunning||bulkRunning)return json(res,409,{error:'Pause automation and wait for the current file operation before deleting'});const b=await body(req);if(b.confirm!=='DELETE_SELECTED_FILES'||!Array.isArray(b.keys)||!b.keys.length||b.keys.length>200)return json(res,400,{error:'Confirm deletion of 1–200 selected files'});
  const feed=await downloadFeed(true),root=await realpath(cfg.downloadPath),rows=b.keys.map(key=>feed.rows.find(x=>x.key===key));if(rows.some(x=>!x))return json(res,400,{error:'Selected download no longer exists in this folder'});if(rows.some(x=>x.offline?!untrackedConfirmed(x):x.progress!==100||!verifyCompletion({verified:true,hash:x.hash},x.torrent,{rel:x.path,size:x.size},root,{allowBundles:true,selectedFiles:true}).verified))return json(res,400,{error:'Only completed downloads can be deleted'});await validateDownloadFiles(root,[...new Set(rows.map(x=>x.path))]);
  if(b.removeTorrents){const hashes=[...new Set(rows.filter(x=>!x.offline).map(x=>x.hash))];for(const h of hashes){const t=feed.torrents[h];if(!t.files.every(f=>typeof f.path==='string'&&!isAbsolute(f.path)&&!f.path.split('/').includes('..')&&isWithin(root,resolve(t.save_path,f.path))))return json(res,400,{error:'Torrent also contains files outside this folder; delete files without removing its record'})}const writer=await delugeReader(cfg.torrentUrl,secrets.delugePassword,fetch,{allowRemove:true});for(const h of hashes)await writer.removeRecord(h)}
  const result=await deleteDownloadFiles(root,[...new Set(rows.map(x=>x.path))]);state.ignoredDownloads=state.ignoredDownloads||[];for(const path of result.deleted){state.ignoredDownloads.push({root:cfg.downloadPath,path,folder:false});await recordActivity('Deleted selected download file: '+path,'warning')}for(const error of result.failed)await recordActivity('Download deletion failed: '+error.path+' — '+error.error,'error');feedCache.time=0;return json(res,200,{ok:!result.failed.length,...result});
 }
 if(path==='/api/setup/manage/verify-all'&&req.method==='POST'){
  const started=await verifyAllLibrary();return json(res,started?202:409,{ok:started,error:started?null:'Another verification/import is running',job:verificationJob});
 }
 if(path==='/api/setup/manage/feed'&&req.method==='GET'){
  try{const feed=await downloadFeed();return json(res,200,{ok:true,root:cfg.downloadPath,updated:feed.time,rows:await Promise.all(feed.rows.map(async({torrent,full,...row})=>({...row,finished:row.progress===100||row.offline&&untrackedConfirmed(row),ignored:ignoredDownload(row.path),exists:await lstat(full).then(x=>x.isFile()&&!x.isSymbolicLink()).catch(()=>false),suggestion:episodeSuggestion(metadataCache,row.path,row.hash),queue:state.importQueue?.[row.key]||null}))),queue:Object.values(state.importQueue||{}).filter(x=>feed.rows.some(r=>r.key===x.key)),autoImport:state.autoImport!==false,workerError:state.workerError||null,selections:state.torrentSelections||{},acquisitions:[...Object.values(state.acquisitions||{}),...Object.values(state.manualGrabs||{}).filter(x=>x.automatic&&x.origin!=='automatic-missing')].filter(x=>x.root===cfg.downloadPath),grabs:Object.values(state.manualGrabs||{}).filter(x=>x.root===cfg.downloadPath)})}catch(e){return json(res,200,{ok:false,error:e.message})}
 }
 if(path==='/api/setup/manage/automation'&&req.method==='PUT'){
  const b=await body(req);if(typeof b.enabled!=='boolean')return json(res,400,{error:'Invalid automation preference'});state.autoImport=b.enabled;await recordActivity(b.enabled?'Automatic verified imports enabled':'Automatic imports paused');return json(res,200,{ok:true,enabled:b.enabled});
 }
 if(path==='/api/setup/manage/retry'&&req.method==='POST'){
  const b=await body(req),item=state.importQueue?.[b.key]||state.acquisitions?.[b.key]||state.manualGrabs?.[b.key]||Object.values(state.manualGrabs||{}).find(x=>x.hash===b.key);if(!item)return json(res,404,{error:'Queue item not found'});if(item.journal)return json(res,409,{error:'Interrupted replacement needs recovery; restart container first'});if(workerRunning)return json(res,409,{error:'Import worker is active; retry shortly'});item.attempts=0;item.retryAt=0;item.status='pending';delete item.queuedAt;delete item.rejectedSignature;delete item.sourceSignature;if(state.manualAssignments?.[b.key])state.manualAssignments[b.key].status='pending';await recordActivity('Queued failed item for recheck');return json(res,200,{ok:true});
 }
 if(path==='/api/setup/manage/authorise'&&req.method==='POST'){
  const b=await body(req),item=state.importQueue?.[b.key];if(workerRunning)return json(res,409,{error:'Import worker is active; retry shortly'});if(!item||item.status!=='awaiting-authorisation'||!item.replacementPath)return json(res,400,{error:'No verified replacement awaiting authorisation'});const hashed=await hashLibraryFile(cfg.libraryPath,item.replacementPath);item.approved=true;item.approvedCRC=item.sourceCRC;item.approvedPreviousCRC=hashed.crc;item.status='pending';await recordActivity('Episode replacement authorised; previous file will be preserved');return json(res,200,{ok:true});
 }
 if(path==='/api/setup/manage/status'&&req.method==='GET')return json(res,200,{profile,activity:state.activity||[],job:verificationJob,metadataUpdated:metadataCache?.lastUpdate||null,automation:state.autoImport!==false,imports:state.autoImport!==false,plexMutations:false,bulk:state.bulkVerification||null,workerError:state.workerError||null,officialUpdated:officialFetched||null,officialError,workerBusy:workerRunning,bulkBusy:bulkRunning,version:'1.1.2',downloadsStopped:!!state.stoppedDownloads,lastCheck:state.lastWorkerCheck||null,nextCheck:workerRunning?null:state.nextWorkerCheck||null,labelWarnings:state.labelWarnings||{},metadataWarning:state.metadataWarning||null,manualGrabs:Object.values(state.manualGrabs||{}),acquisitions:[...Object.values(state.acquisitions||{}),...Object.values(state.manualGrabs||{}).filter(x=>x.automatic&&x.origin!=='automatic-missing')].filter(x=>x.root===cfg.downloadPath)});
 if(path==='/api/setup/manage/profile'&&req.method==='PUT'){
  if(workerRunning||(!bulkRunning&&verificationJob?.status==='running'))return json(res,409,{error:'Wait for the active verification/import job before changing the profile'});
  const b=await body(req);if(Object.keys(b).some(k=>!Object.hasOwn(defaultProfile,k)||(['minimumQuality','targetQuality'].includes(k)?![480,720,1080].includes(b[k]):k==='maxConcurrentDownloads'?(!Number.isInteger(b[k])||b[k]<1||b[k]>10):k==='language'?!['subbed','dubbed','both'].includes(b[k]):typeof b[k]!=='boolean'))||(b.minimumQuality??profile.minimumQuality)>(b.targetQuality??profile.targetQuality))return json(res,400,{error:'Unsupported release preference'});
  state.betaProfile={...profile,...b};if(!bulkRunning)verificationJob=null;await recordActivity('Release preferences saved; eligible imports follow the profile');return json(res,200,{ok:true,profile:state.betaProfile});
 }
 if(path==='/api/setup/manage/library'&&req.method==='POST'){
  const request=await body(req);
  const check=await pathCheck('library',cfg.libraryPath);if(!check.ok)return json(res,200,{ok:false,error:check.message});
  const scan=await scanTree(await realpath(cfg.libraryPath));let metadataError='';
  try{await loadBetaMetadata(cfg)}catch(e){metadataError=e.message}
  await loadOfficial();metadataError=metadataError||state.metadataWarning||'';
  const rows=scan.files.map(f=>{
   const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(f.name),season=m?Number(m[1]):null,episode=m?Number(m[2]):null;
   const ep=metadataCache?.arcs.find(a=>a.arc===season)?.episodes.find(e=>e.episode===episode),preferred=ep?preferredRelease(ep,profile):null;
   const cached=verifiedFiles.get(f.rel);const verified=checksumValid(cached,f)?{...cached,...(state.manualLibrary?.[f.rel]?.crc===cached.crc?{status:'manual-import',reason:'User-assigned custom release'}:ep?assessInstalled(ep,cached.crc,profile):{status:'review-no-metadata'})}:null;
   return {path:f.rel,name:f.name,size:f.size,season,episode,title:ep?.title||f.name,present:true,preferred:preferred?.variant||null,verification:verified||null,media:verified?.media||null,status:verified?.status||'present-unverified'};
  });
  if(metadataCache)for(const arc of metadataCache.arcs)for(const ep of arc.episodes){
   if(rows.some(r=>r.season===arc.arc&&r.episode===ep.episode))continue;
   rows.push({season:arc.arc,episode:ep.episode,title:ep.title,present:false,status:arc.arc===0&&!profile.includeSpecials?'excluded-special':'missing',preferred:preferredRelease(ep,profile)?.variant||null});
  }
  if(request.silent!==true)await recordActivity(`Library refreshed: ${scan.files.length} video files inspected`);
  return json(res,200,{ok:true,rows,videoCount:scan.files.length,metadataError,verifiedCount:rows.filter(x=>x.present&&x.verification).length,metadataUpdated:metadataCache?.lastUpdate||null,checksumPolicy:profile.skipVerifyPresent?'Beta skips verification unless its variant override applies':'Beta verifies present files'});
 }
 if(path==='/api/setup/manage/downloads'&&req.method==='POST'){
  const check=await pathCheck('download',cfg.downloadPath);if(!check.ok)return json(res,200,{ok:false,error:check.message});
  const scan=await scanTree(await realpath(cfg.downloadPath));await recordActivity(`Downloads refreshed: ${scan.files.length} video files inspected`);
  return json(res,200,{ok:true,rows:scan.files.map(f=>({path:f.rel,name:f.name,size:f.size,recognized:f.release.recognized,crc:f.release.releaseTag})),count:scan.files.length});
 }
 if(path==='/api/setup/manage/verify'&&req.method==='POST'){
  if(bulkRunning||workerRunning||verificationJob?.status==='running')return json(res,409,{error:'A verification or import job is already running'});
  const b=await body(req),check=await pathCheck('library',cfg.libraryPath);if(!check.ok)return json(res,400,{error:check.message});
  const root=await realpath(cfg.libraryPath),scan=await scanTree(root),file=scan.files.find(f=>f.rel===b.path);
  if(!file)return json(res,400,{error:'Choose a file from the current library inventory'});
  if(!metadataCache)return json(res,400,{error:'Refresh Library metadata first'});
  const m=/S(\d{1,3})-?E(\d{1,3})/i.exec(file.name),ep=m?metadataCache.arcs.find(a=>a.arc===Number(m[1]))?.episodes.find(e=>e.episode===Number(m[2])):null;
  if(!ep)return json(res,400,{error:'No authoritative metadata for this library file'});
  if(bulkRunning||workerRunning||verificationJob?.status==='running')return json(res,409,{error:'A verification or import job is already running'});
  verificationJob={status:'running',path:file.rel,started:new Date().toISOString()};
  // Explicit verification overrides Beta skip preference for this file only; no pipeline is started.
  const activeProfile={...profile};
  void (async()=>{try{
   const hashed=await hashLibraryFile(root,file.rel);const published=officialForCRC(officialCatalog,hashed.crc);if(published)hashed.media=published;const result={...hashed,...assessInstalled(ep,hashed.crc,activeProfile),checked:new Date().toISOString()};
   const profileUnchanged=JSON.stringify(activeProfile)===JSON.stringify({...defaultProfile,...state.betaProfile});if(profileUnchanged)await saveChecksum(file.rel,result);
   verificationJob={...verificationJob,status:profileUnchanged?'complete':'discarded-profile-changed',...(profileUnchanged?{result}:{})};await recordActivity('Installed release checksum verification completed');
  }catch(e){verificationJob={...verificationJob,status:'failed',error:e.message};await recordActivity('Installed release checksum verification failed; review required')}})();
  return json(res,202,{ok:true,job:verificationJob});
 }
 return json(res,404,{error:'Unknown management action'});
}

if(path==='/api/setup/settings'&&req.method==='GET'){if(!authed(req))return json(res,401,{error:'Login required'});return json(res,200,{settings:state.settings||{},engine:'verified-import-worker'})}
if(path==='/api/setup/settings'&&req.method==='PUT'){
 if(workerRunning||bulkRunning||verificationJob?.status==='running')return json(res,409,{error:'Wait for the active verification/import job before changing paths'});
 if(!authed(req))return json(res,401,{error:'Login required'});
 if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origin mismatch'});
 const b=await body(req);if(b.selectedLibraryIds!==undefined&&(!Array.isArray(b.selectedLibraryIds)||b.selectedLibraryIds.length>200||b.selectedLibraryIds.some(v=>typeof v!=='string'||!/^[0-9]{1,20}$/.test(v))))return json(res,400,{error:'Invalid Plex library selection'});const clean={};for(const key of allowed){const v=b[key];if(v!==undefined){if(typeof v!=='string'||v.length>1024)return json(res,400,{error:'Invalid '+key});clean[key]=v.trim()}}
 for(const key of ['mediaServerUrl','torrentUrl','metadataUrl'])if(clean[key]&& !/^https?:\/\//i.test(clean[key]))return json(res,400,{error:'URL must start with http:// or https://'});
 if(clean.delugeLabel){if(!/^[a-z0-9_.-]{1,64}$/.test(clean.delugeLabel))return json(res,400,{error:'Invalid Deluge label name'});try{const reader=await delugeReader(clean.torrentUrl||state.settings?.torrentUrl,secrets.delugePassword);if(!(await reader.labels()).includes(clean.delugeLabel))throw Error('Label not found; refresh/create labels before saving');const options=await reader.labelOptions(clean.delugeLabel);if(options?.apply_move_completed&&options.move_completed)throw Error('Disable this label’s move rule in Deluge before saving')}catch(e){return json(res,400,{error:e.message})}}
 state.settings={...state.settings,...clean,...(b.selectedLibraryIds!==undefined?{selectedLibraryIds:[...new Set(b.selectedLibraryIds)]}:{})};await persist();return json(res,200,{ok:true,settings:state.settings,engine:'verified-import-worker'});}
if(req.method!=='GET')return json(res,404,{error:'Not found'});
const files={'/':'index.html','/index.html':'index.html','/app.css':'app.css','/app.js':'app.js','/manager.js':'manager.js','/download-state.mjs':'download-state.mjs','/hero.svg':'hero.svg','/ship.png':'ship.png','/banner.png':'banner.png','/logo.png':'logo.png'};const name=files[path];if(!name)return json(res,404,{error:'Not found'});
const buf=await readFile(join(process.env.PACEARR_WEB_DIR||'/app/web',name));res.writeHead(200,{...headers,'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[extname(name)]});res.end(buf)
}catch(e){console.error('Request failed:',e.message);json(res,e.message==='Payload too large'?413:400,{error:'Invalid request'})}});
if(state.importPolicyVersion!==2){officialFetched=0;metadataCache&&(metadataCache.fetchedAt=0);for(const item of Object.values(state.importQueue||{}))if(!item.journal&&!['imported','already-current','ignored','cancelled'].includes(item.status)){item.status='pending';item.attempts=0;item.retryAt=0;delete item.sourceSignature;delete item.rejectedSignature}state.importPolicyVersion=2;await recordActivity('Updated import policy: completed downloads will be rechecked; checksums, sources and saved pause decisions retained')}
server.listen(port,'0.0.0.0',()=>console.log(`Pacearr Alpha manager listening on ${port}`));
if(process.env.PACEARR_DISABLE_WORKER!=='1'){setTimeout(()=>void workerCycle(),2500);setInterval(()=>void workerCycle(),Math.max(500,Number(process.env.PACEARR_WORKER_INTERVAL_MS)||15000)).unref()}
