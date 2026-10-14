import {delugeMetadata} from './torrent-metadata.mjs';
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
     if(/^[a-f0-9]{8}$/i.test(f.CRC32_inFileName||'')&&f.CRC32_inFileName.toLowerCase()!==key){const alias=f.CRC32_inFileName.toLowerCase();index.set(alias,[...(index.get(alias)||[]),entry])}
    }
   }
  }
 }
 if(!index.size)throw Error('Metadata contains no usable CRC32/torrent identities');
 return index;
}
export function matchMetadata(index,crc,torrentHash){
 const all=index.get(String(crc||'').toLowerCase())||[],exact=torrentHash?all.filter(x=>x.hash===torrentHash):[];
 const hits=exact.length?exact:all,unique=new Map();for(const hit of hits){const key=hit.season+':'+hit.episode+':'+hit.crc;if(!unique.has(key))unique.set(key,hit)}
 return unique.size===1?{verified:true,...unique.values().next().value}:{verified:false,reason:unique.size?'Ambiguous metadata CRC32':crc?'Checksum not listed in authoritative metadata':'Filename has no checksum tag; content verification required'};
}
export function privateDelugeURL(value){
 const u=new URL(value);const ip=u.hostname,parts=ip.split('.').map(Number);
 if(u.protocol!=='http:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||isIP(ip)!==4||!(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168)))throw Error('Deluge requires a private IPv4 HTTP URL without path or credentials');
 return new URL('/json',u);
}
export async function delugeReader(url,password,fetcher=fetch,{allowAdd=false,allowRemove=false,allowManage=false}={}){
 const dest=privateDelugeURL(url);let cookie='',id=0;
 const allowed=new Set(['auth.login','web.connected','core.get_torrent_status','core.get_torrents_status','core.add_torrent_magnet','core.add_torrent_file','core.remove_torrent','core.pause_torrent','core.resume_torrent','core.set_torrent_options','core.get_enabled_plugins','label.get_labels','label.add','label.get_options','label.set_torrent','web.download_torrent_from_url','web.get_torrent_info','web.add_torrents']);
 async function rpc(method,params){
  if(!allowed.has(method)||(['core.add_torrent_magnet','core.add_torrent_file','web.add_torrents'].includes(method)&&!allowAdd)||(method==='core.remove_torrent'&&!allowRemove)||(['core.pause_torrent','core.resume_torrent','core.set_torrent_options','label.add','label.set_torrent','web.download_torrent_from_url'].includes(method)&&!allowManage))throw Error('RPC mutation blocked');
  const response=await fetcher(dest,{method:'POST',redirect:'error',signal:AbortSignal.timeout(method==='web.download_torrent_from_url'?20000:8000),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({method,params,id:++id})});
  if(method==='auth.login')cookie=response.headers.get('set-cookie')?.match(/(?:^|[,;\s])(_session_id=[^;\s,]+)/)?.[1]||'';
  const data=await boundedJSON(response,(['core.get_torrents_status','web.get_torrent_info'].includes(method)?16:2)*1024*1024);if(data.error){const detail=String(data.error.message||'RPC request rejected').replaceAll(password,'[redacted]').replace(/[\r\n\x00-\x1f]+/g,' ').slice(0,400);const operation=({'auth.login':'sign-in','web.connected':'daemon check','core.get_torrent_status':'torrent lookup','core.get_torrents_status':'torrent list','core.add_torrent_magnet':'add torrent','core.remove_torrent':'remove torrent record'})[method]||method;const error=Error(`Deluge ${operation} rejected (${method}${data.error.code!==undefined?', code '+data.error.code:''}): ${detail}`);error.rpcMethod=method;error.rpcMessage=detail;throw error}return data.result;
 }
 if(typeof password!=='string'||!password||await rpc('auth.login',[password])!==true||!cookie)throw Error('Deluge authentication failed');
 if(await rpc('web.connected',[])!==true)throw Error('Deluge daemon is not connected');
 const fields=['name','state','progress','save_path','total_size','total_done','total_remaining','is_finished','files','file_progress','file_priorities','label'];const reader=async hash=>{if(!/^[a-f0-9]{40}$/i.test(hash))throw Error('Invalid torrent identity');return rpc('core.get_torrent_status',[hash,fields])};reader.list=()=>rpc('core.get_torrents_status',[{},fields]);reader.add=async(magnet,hash,downloadLocation,{paused=false}={})=>{if(!allowAdd)throw Error('Torrent additions disabled for read-only connection');const uri=new URL(magnet);const identities=uri.searchParams.getAll('xt');if(uri.protocol!=='magnet:'||! /^[a-f0-9]{40}$/i.test(hash)||identities.length!==1||identities[0].toLowerCase()!=='urn:btih:'+hash.toLowerCase()||!isAbsolute(downloadLocation)||downloadLocation.split('/').includes('..'))throw Error('Invalid authoritative magnet or download path');reader.lastAddOutcome='added';const present=await reader.list();if(present&&Object.hasOwn(present,hash.toLowerCase())){reader.lastAddOutcome='existing';return hash}let result;try{result=await rpc('core.add_torrent_magnet',[magnet,{download_location:downloadLocation,...(paused?{add_paused:true}: {})}])}catch(error){if(error.rpcMethod==='core.add_torrent_magnet'&&/(already.*(?:session|add|exist)|duplicate)/i.test(error.rpcMessage||'')&&(error.rpcMessage||'').toLowerCase().includes(hash.toLowerCase())){reader.lastAddOutcome='pending';return hash}throw error}if(String(result).toLowerCase()!==hash.toLowerCase())throw Error('Deluge did not confirm the expected torrent hash');return result};reader.removeRecord=async hash=>{if(!allowRemove||! /^[a-f0-9]{40}$/i.test(hash))throw Error('Torrent record removal disabled');const result=await rpc('core.remove_torrent',[hash,false]);if(result!==true)throw Error('Deluge did not confirm torrent record removal');return result};
 reader.addFile=async(hash,metadata,downloadLocation,priorities)=>{if(!allowAdd||!allowManage||! /^[a-f0-9]{40}$/i.test(hash)||metadata.hash!==hash||!isAbsolute(downloadLocation)||downloadLocation.split('/').includes('..')||priorities.length!==metadata.files.length)throw Error('Invalid selected torrent metadata');const present=await reader.list();if(Object.hasOwn(present||{},hash)){reader.lastAddOutcome='existing';return hash}const result=await rpc('core.add_torrent_file',[hash+'.torrent',metadata.base64,{download_location:downloadLocation,add_paused:true,file_priorities:priorities,auto_managed:false}]);if(String(result).toLowerCase()!==hash)throw Error('Deluge did not confirm selected torrent identity');reader.lastAddOutcome='added';return hash};
 reader.inspectMetadata=async(path,hash)=>{if(typeof path!=='string'||!/^\/tmp\/delugeweb-[a-zA-Z0-9_-]+\/[^/]+\.torrent$/.test(path))throw Error('Invalid Deluge temporary torrent path');return delugeMetadata(await rpc('web.get_torrent_info',[path]),hash,path)};
 reader.fetchMetadata=async(url,hash)=>{if(!allowManage||! /^[a-f0-9]{40}$/i.test(hash)||!(/^https:\/\/nyaa\.si\/download\/\d+\.torrent$/.test(url)||url==='https://itorrents.org/torrent/'+hash.toUpperCase()+'.torrent'))throw Error('Invalid torrent metadata source');const path=await rpc('web.download_torrent_from_url',[url]);return reader.inspectMetadata(path,hash)};
 reader.addRemoteFile=async(hash,metadata,downloadLocation,priorities)=>{if(!allowAdd||!allowManage||!isAbsolute(downloadLocation)||downloadLocation.split('/').includes('..'))throw Error('Torrent additions disabled');const checked=await reader.inspectMetadata(metadata.remotePath,hash);if(JSON.stringify(checked.files)!==JSON.stringify(metadata.files)||priorities.length!==checked.files.length||priorities.some(x=>![0,1,4,7].includes(x)))throw Error('Torrent selection changed');const present=await reader.list();if(Object.hasOwn(present||{},hash)){reader.lastAddOutcome='existing';return hash}const result=await rpc('web.add_torrents',[[{path:checked.remotePath,options:{download_location:downloadLocation,add_paused:true,file_priorities:priorities,auto_managed:false}}]]);if(!Array.isArray(result)||result.length!==1||result[0][0]!==true||String(result[0][1]).toLowerCase()!==hash)throw Error('Deluge did not confirm the selected torrent identity');reader.lastAddOutcome='added';return hash};
 reader.manage=async(action,hash,value)=>{if(!allowManage||! /^[a-f0-9]{40}$/i.test(hash))throw Error('Torrent management disabled');if(action==='pause'||action==='resume')return rpc('core.'+action+'_torrent',[[hash]]);if(action==='priorities'){if(!Array.isArray(value)||!value.length||value.some(x=>![0,1,4,7].includes(x)))throw Error('Invalid file priorities');return rpc('core.set_torrent_options',[[hash],{file_priorities:value}])}if(action==='label')return rpc('label.set_torrent',[hash,value]);throw Error('Invalid torrent action')};
 reader.labels=async()=>{const plugins=await rpc('core.get_enabled_plugins',[]);if(!Array.isArray(plugins)||!plugins.includes('Label'))throw Error('Enable the Label plugin in Deluge to use labels');return rpc('label.get_labels',[])};
 reader.labelOptions=name=>rpc('label.get_options',[name]);reader.createLabel=async name=>{if(!/^[a-z0-9_.-]{1,64}$/.test(name))throw Error('Use lowercase letters, numbers, dots, underscores or hyphens for labels');const labels=await reader.labels();if(!labels.includes(name))await rpc('label.add',[name]);if(!(await reader.labels()).includes(name))throw Error('Label creation could not be verified');return name};return reader;
}
export function verifyCompletion(mapping,torrent,candidate,downloadRoot,{allowBundles=false,selectedFiles=false}={}){
 const fail=reason=>({verified:false,reason});
 if(!mapping.verified)return fail('Metadata identity unverified');
 if(mapping.bundle&&!allowBundles)return fail('Bundle requires review');
 if(!torrent||typeof torrent!=='object')return fail('Torrent not found');
 // Deluge core progress uses percent (0..100), unlike @ctrl/deluge normalized progress.
 if(!['Downloading','Seeding','Paused','Queued'].includes(torrent.state)||( !selectedFiles&&(torrent.is_finished!==true||torrent.progress!==100||torrent.total_remaining!==0||!Number.isFinite(torrent.total_size)||torrent.total_size<=0||torrent.total_done!==torrent.total_size||!['Seeding','Paused'].includes(torrent.state))))return fail('Torrent completion not verified');
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
 return {verified:true,reason:selectedFiles?'Completed selected file and exact torrent path/size verified':'Metadata torrent hash, completed torrent and exact file path/size verified',hash:mapping.hash};
}
