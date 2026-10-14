import {episodeSuggestion} from './episode-mapping.mjs';
import {createHash} from 'node:crypto';
import {officialTorrentURL} from './onepace-feed.mjs';
export function decodeTorrent(bytes,expectedHash){
 const data=Buffer.from(bytes);if(!data.length||data.length>8*1024*1024)throw Error('Invalid torrent metadata size');let pos=0,infoStart,infoEnd,nodes=0;
 function parse(depth=0){if(depth>40||++nodes>100000)throw Error('Torrent metadata too complex');const c=data[pos];if(c===105){const end=data.indexOf(101,++pos);if(end<0)throw Error('Invalid torrent integer');const value=Number(data.subarray(pos,end).toString());if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid torrent integer');pos=end+1;return value}if(c===108){pos++;const out=[];while(data[pos]!==101){if(pos>=data.length)throw Error('Truncated torrent list');out.push(parse(depth+1))}pos++;return out}if(c===100){pos++;const out=Object.create(null);while(data[pos]!==101){if(pos>=data.length)throw Error('Truncated torrent dictionary');const key=parse(depth+1);if(!Buffer.isBuffer(key))throw Error('Invalid torrent key');const name=key.toString();if(Object.hasOwn(out,name))throw Error('Duplicate torrent key');const start=pos;out[name]=parse(depth+1);if(depth===0&&name==='info'){infoStart=start;infoEnd=pos}}pos++;return out}const colon=data.indexOf(58,pos);if(colon<0||colon-pos>10)throw Error('Invalid torrent string');const text=data.subarray(pos,colon).toString();if(!/^\d+$/.test(text))throw Error('Invalid torrent string');const len=Number(text);pos=colon+1;if(pos+len>data.length)throw Error('Truncated torrent string');const out=data.subarray(pos,pos+len);pos+=len;return out}
 const root=parse();if(pos!==data.length||infoStart===undefined)throw Error('Invalid torrent info dictionary');const hash=createHash('sha1').update(data.subarray(infoStart,infoEnd)).digest('hex');if(hash!==expectedHash.toLowerCase())throw Error('Torrent metadata hash differs from authoritative release');const info=root.info;
 const text=x=>{if(!Buffer.isBuffer(x))throw Error('Invalid torrent path');const value=x.toString('utf8');if(!value||value==='.'||value==='..'||/[\\/\x00]/.test(value))throw Error('Unsafe torrent path');return value},name=text(info['name.utf-8']||info.name);
 const files=info.files?info.files.map((f,index)=>({index,path:[name,...(f['path.utf-8']||f.path).map(text)].join('/'),size:f.length})):[{index:0,path:name,size:info.length}];if(!files.length||files.length>10000||files.some(f=>!Number.isSafeInteger(f.size)||f.size<0))throw Error('Invalid torrent file lengths');return {hash,files,base64:data.toString('base64')};
}
export function torrentMetadataURLs(hash,nyaaURL,directURL){
 if(!/^[a-f0-9]{40}$/i.test(hash))throw Error('Invalid torrent identity');const urls=[];
 if(directURL){if(!officialTorrentURL(directURL,hash))throw Error('Invalid official torrent source');urls.push(directURL)}
 if(typeof nyaaURL==='string'&&/^https:\/\/nyaa\.si\/view\/\d+$/.test(nyaaURL))urls.push(nyaaURL.replace('/view/','/download/')+'.torrent');
 urls.push('https://itorrents.org/torrent/'+hash.toUpperCase()+'.torrent');return urls;
}
export function networkFailure(error){const cause=error.cause;return [error.name==='TimeoutError'?'request timed out':error.message,cause?.code,cause?.message].filter(Boolean).join(': ').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,350)}
export async function fetchTorrentMetadata(hash,nyaaURL,fetcher=fetch,directURL){
 const failures=[];
 for(const original of torrentMetadataURLs(hash,nyaaURL,directURL)){
  let url=original;try{for(let hop=0;hop<4;hop++){
   const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Redirect lacks destination');const next=new URL(location,url);if(next.protocol!=='https:'||next.username||next.password||!['onepace.net','nyaa.si','itorrents.org','itorrents.net'].includes(next.hostname))throw Error('Redirect to an unapproved torrent source: '+next.hostname);url=next.href;continue}
   if(!response.ok){await response.body?.cancel();throw Error('HTTP '+response.status)}let size=0,chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Torrent metadata too large');chunks.push(chunk)}return decodeTorrent(Buffer.concat(chunks),hash);
  }throw Error('Too many redirects')}catch(e){failures.push(new URL(original).hostname+': '+networkFailure(e))}
 }
 throw Error('Bundle file metadata unavailable; no payload started. '+failures.join(' | '));
}
export function validRemoteTorrentPath(path){return typeof path==='string'&&path.length<2048&&!/[\x00-\x1f\\]/.test(path)&&path.startsWith('/')&&!path.split('/').includes('..')&&/\/(?:delugeweb-[a-zA-Z0-9_-]+|deluge-web)\/[^/]+$/.test(path)}
export function delugeMetadata(info,hash,remotePath){
 if(!/^[a-f0-9]{40}$/i.test(hash)||info?.info_hash?.toLowerCase()!==hash.toLowerCase())throw Error('Deluge torrent metadata hash differs from authoritative release');
 if(!validRemoteTorrentPath(remotePath))throw Error('Invalid Deluge temporary torrent path');
 const files=[];let nodes=0;
 function walk(node,prefix=[]){if(++nodes>20000||prefix.length>40||!node||typeof node!=='object')throw Error('Invalid Deluge file tree');if(node.type==='file'){const path=node.path||prefix.join('/');if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').some(x=>!x||x==='.'||x==='..')||!Number.isSafeInteger(node.index)||node.index<0||!Number.isSafeInteger(node.length)||node.length<0)throw Error('Unsafe Deluge torrent file');files.push({index:node.index,path,size:node.length});return}if(!node.contents||typeof node.contents!=='object')throw Error('Invalid Deluge directory');for(const [name,child] of Object.entries(node.contents)){if(!name||name==='.'||name==='..'||/[\\/\x00]/.test(name))throw Error('Unsafe Deluge file name');walk(child,[...prefix,name])}}
 walk(info.files_tree);files.sort((a,b)=>a.index-b.index);if(!files.length||files.length>10000||files.some((f,i)=>f.index!==i))throw Error('Invalid Deluge file indexes');return {hash:hash.toLowerCase(),remotePath,files};
}
export function selectTorrentFiles(files,index,requests,matchMetadata,metadata,catalogue){
 const priorities=files.map(()=>0),matched=new Set();
 for(const f of files){
  const crc=/\[([a-f0-9]{8})\](?=\.[^.]+$)/i.exec(f.path)?.[1],mapping=matchMetadata(index,crc),hint=!mapping.verified&&catalogue?.suggestion(f.path,requests[0]?.hash),suggestion=!mapping.verified&&metadata&&episodeSuggestion(metadata,f.path,requests[0]?.hash);
  const historical=hint?.relation==='exact'&&hint.metadataCRC&&requests.some(r=>r.hash===hint.hash&&r.season===hint.season&&r.episode===hint.episode&&r.crc===hint.metadataCRC)?hint:null;
  const selected=mapping.verified?mapping:historical||suggestion?.selectionVerified&&suggestion;
  if(selected&&requests.some(r=>r.hash===selected.hash&&r.season===selected.season&&r.episode===selected.episode)){priorities[f.index]=1;matched.add(selected.season+':'+selected.episode)}
 }
 if(files.length===1&&requests.length===1){priorities[0]=1;matched.add(requests[0].season+':'+requests[0].episode)}
 const missing=requests.filter(r=>!matched.has(r.season+':'+r.episode));
 if(!matched.size||missing.length)throw Error('Requested episodes could not be identified in torrent files'+(missing.length?': '+missing.map(r=>'S'+r.season+'E'+r.episode).join(', '):'')+'; no payload started');return {priorities,matched:[...matched]};
}
