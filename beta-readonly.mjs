import {isIP} from 'node:net';
import {resolve, relative, isAbsolute} from 'node:path';
export async function boundedJSON(response, limit=8*1024*1024){
 if(!response.ok)throw Error('Remote HTTP '+response.status);
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Response exceeds safe limit');chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function metadataIndex(data){
 if(!data||typeof data.lastUpdate!=='string'||!Array.isArray(data.arcs)||data.arcs.length>200)throw Error('Invalid Beta metadata');
 const index=new Map();let count=0;
 for(const arc of data.arcs){
  if(!Number.isInteger(arc.arc)||arc.arc<0||!Array.isArray(arc.episodes))throw Error('Invalid metadata arc');
  for(const ep of arc.episodes){
   if(++count>20000||!Number.isInteger(ep.episode)||ep.episode<0||ep.arc!==arc.arc)throw Error('Invalid metadata episode');
   for(const variant of ['standard','extended','alternate','archived']){
    const values=variant==='archived'?(ep.files?.archived||[]):[ep.files?.[variant]];
    if(!Array.isArray(values)||values.length>100)throw Error('Invalid release variants');
    for(const f of values){if(!f)continue;
     if(!/^[a-f0-9]{8}$/i.test(f.CRC32)||! /^[a-f0-9]{40}$/i.test(f.hash||''))continue;
     const entry={season:arc.arc,episode:ep.episode,title:String(ep.title||'').slice(0,300),variant,hash:f.hash.toLowerCase(),crc:f.CRC32.toLowerCase(),bundle:f.partOfBundle===true};
     const key=entry.crc;index.set(key,[...(index.get(key)||[]),entry]);
    }
   }
  }
 }
 if(!index.size)throw Error('Metadata contains no usable CRC32/torrent identities');
 return index;
}
export function matchMetadata(index,crc){
 const hits=index.get(String(crc||'').toLowerCase())||[];
 // Multiple records are deliberately ambiguous, even when they share an episode.
 return hits.length===1?{verified:true,...hits[0]}:{verified:false,reason:hits.length?'Ambiguous metadata CRC32':'CRC32 absent from metadata'};
}
export function privateDelugeURL(value){
 const u=new URL(value);const ip=u.hostname,parts=ip.split('.').map(Number);
 if(u.protocol!=='http:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||isIP(ip)!==4||!(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168)))throw Error('Deluge requires a private IPv4 HTTP URL without path or credentials');
 return new URL('/json',u);
}
export async function delugeReader(url,password,fetcher=fetch,{allowAdd=false,allowRemove=false}={}){
 const dest=privateDelugeURL(url);let cookie='',id=0;
 const allowed=new Set(['auth.login','web.connected','core.get_torrent_status','core.get_torrents_status','core.add_torrent_magnet','core.remove_torrent']);
 async function rpc(method,params){
  if(!allowed.has(method)||(method==='core.add_torrent_magnet'&&!allowAdd)||(method==='core.remove_torrent'&&!allowRemove))throw Error('RPC mutation blocked');
  const response=await fetcher(dest,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({method,params,id:++id})});
  if(method==='auth.login')cookie=response.headers.get('set-cookie')?.match(/(?:^|[,;\s])(_session_id=[^;\s,]+)/)?.[1]||'';
  const data=await boundedJSON(response,(method==='core.get_torrents_status'?16:2)*1024*1024);if(data.error)throw Error('Deluge rejected read-only query');return data.result;
 }
 if(typeof password!=='string'||!password||await rpc('auth.login',[password])!==true||!cookie)throw Error('Deluge authentication failed');
 if(await rpc('web.connected',[])!==true)throw Error('Deluge daemon is not connected');
 const fields=['name','state','progress','save_path','total_size','total_done','total_remaining','is_finished','files','file_progress'];const reader=async hash=>{if(!/^[a-f0-9]{40}$/i.test(hash))throw Error('Invalid torrent identity');return rpc('core.get_torrent_status',[hash,fields])};reader.list=()=>rpc('core.get_torrents_status',[{},fields]);reader.add=async(magnet,hash,downloadLocation)=>{if(!allowAdd)throw Error('Torrent additions disabled for read-only connection');const uri=new URL(magnet);const identities=uri.searchParams.getAll('xt');if(uri.protocol!=='magnet:'||! /^[a-f0-9]{40}$/i.test(hash)||identities.length!==1||identities[0].toLowerCase()!=='urn:btih:'+hash.toLowerCase()||!isAbsolute(downloadLocation)||downloadLocation.split('/').includes('..'))throw Error('Invalid authoritative magnet or download path');const result=await rpc('core.add_torrent_magnet',[magnet,{download_location:downloadLocation}]);if(String(result).toLowerCase()!==hash.toLowerCase())throw Error('Deluge did not confirm the expected torrent hash');return result};reader.removeRecord=async hash=>{if(!allowRemove||! /^[a-f0-9]{40}$/i.test(hash))throw Error('Torrent record removal disabled');const result=await rpc('core.remove_torrent',[hash,false]);if(result!==true)throw Error('Deluge did not confirm torrent record removal');return result};return reader;
}
export function verifyCompletion(mapping,torrent,candidate,downloadRoot,{allowBundles=false}={}){
 const fail=reason=>({verified:false,reason});
 if(!mapping.verified)return fail('Metadata identity unverified');
 if(mapping.bundle&&!allowBundles)return fail('Bundle requires review');
 if(!torrent||typeof torrent!=='object')return fail('Torrent not found');
 // Deluge core progress uses percent (0..100), unlike @ctrl/deluge normalized progress.
 if(torrent.is_finished!==true||torrent.progress!==100||torrent.total_remaining!==0||!Number.isFinite(torrent.total_size)||torrent.total_size<=0||torrent.total_done!==torrent.total_size||!['Seeding','Paused'].includes(torrent.state))return fail('Torrent completion not verified');
 if(typeof torrent.save_path!=='string'||!isAbsolute(torrent.save_path)||!Array.isArray(torrent.files)||!Array.isArray(torrent.file_progress))return fail('Torrent path or file data unavailable');
 const expected=resolve(downloadRoot,candidate.rel);const matches=[];
 for(const file of torrent.files){
  if(typeof file.path!=='string'||isAbsolute(file.path)||file.path.includes('\\')||file.path.split('/').includes('..'))return fail('Unsafe torrent file path');
  const full=resolve(torrent.save_path,file.path),within=relative(downloadRoot,full);
  if(within.startsWith('..')||isAbsolute(within))return fail('Deluge path does not match container download mount');
  if(full===expected)matches.push(file);
 }
 if(matches.length!==1)return fail('Exact download file not found in torrent');
 const f=matches[0];if(!Number.isInteger(f.index)||f.index<0||torrent.file_progress[f.index]!==1||f.size!==candidate.size)return fail('File completion or size mismatch');
 return {verified:true,reason:'Metadata torrent hash, completed torrent and exact file path/size verified',hash:mapping.hash};
}
