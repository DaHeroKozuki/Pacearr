import {canonicalRelease} from './release-identity.mjs';
import {retryAfterMS} from './reliability.mjs';
import {XMLParser,XMLValidator,XMLBuilder} from 'fast-xml-parser';
const list=x=>x===undefined?[]:Array.isArray(x)?x:[x];
const text=x=>typeof x==='string'?x:typeof x==='number'?String(x):x?.['#text']||'';
const clean=s=>text(s).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi,(_,h,d)=>String.fromCodePoint(parseInt(h||d,h?16:10))).replace(/\s+/g,' ').trim();
function contentMarkup(value){const plain=text(value).trim();if(plain)return plain;let markup='';const builder=new XMLBuilder({ignoreAttributes:false,attributeNamePrefix:'@_'});function walk(n){if(Array.isArray(n)){for(const x of n)walk(x);return}if(!n||typeof n!=='object')return;for(const [key,v] of Object.entries(n)){if(key==='dl'){for(const dl of list(v)){const labels=list(dl.dt),values=list(dl.dd);for(let i=0;i<labels.length;i++)markup+=builder.build({dt:clean(labels[i]),dd:clean(values[i])})}}else if(key==='a')for(const a of list(v))markup+=builder.build({a});else if(key==='#text')markup+=' '+v;else if(!key.startsWith('@_'))walk(v)}}walk(value);return markup;}
export const feedURLs=['https://onepace.net/en/releases/rss.xml','https://onepace.net/en/releases/atom.xml'];
export function officialTorrentURL(url,hash){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='onepace.net'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/torrents/'+hash.toLowerCase()+'.torrent'}catch{return false}}
export function parseOnePaceFeed(xml){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>8*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid or oversized One Pace feed');
 if(XMLValidator.validate(xml)!==true)throw Error('Invalid One Pace XML');
 const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false,trimValues:false,processEntities:true}).parse(xml);
 const atom=!!parsed.feed,items=atom?list(parsed.feed.entry):list(parsed.rss?.channel?.item);if(!items.length||items.length>3000)throw Error('One Pace feed contains no supported release entries');
 const result=new Map();result.quarantined=[];const blocked=new Set();
 for(const e of items){try{
  const identity=text(e.guid||e.id).trim(),rawHash=text(e.infoHash||identity).trim().replace(/^urn:btih:/i,'').toLowerCase(),hash=/^[a-f0-9]{40}$/.test(rawHash)?rawHash:null,legacyCRC=/^urn:crc32:([a-f0-9]{8})$/i.exec(identity)?.[1]?.toUpperCase()||null;if(!hash&&!legacyCRC)throw Error('Invalid official release identity');
  const links=list(e.link),description=contentMarkup(e.description||e.content||e.summary),title=clean(e.title),categories=list(e.category).map(c=>text(c)||c?.['@_term']||'');
  const magnet=text(e.magnetURI)||links.find(l=>text(l?.['@_href']).startsWith('magnet:'))?.['@_href']||description.match(/href=["'](magnet:[^"']+)["']/)?.[1]?.replace(/&amp;/g,'&');
  const outdated=/\bOutdated\b/.test(clean(description));if(!magnet&&!outdated)throw Error('Current official release lacks magnet identity');let name='';if(magnet)try{const u=new URL(magnet),xt=u.searchParams.getAll('xt');if(u.protocol!=='magnet:'||xt.length!==1||xt[0].toLowerCase()!=='urn:btih:'+hash)throw Error();name=u.searchParams.get('dn')||text(e.fileName).replace(/\.torrent$/i,'')}catch{throw Error('Official magnet and release hash disagree')}
  let torrentURL=e.enclosure?.['@_url']||links.find(l=>l?.['@_rel']==='enclosure'||officialTorrentURL(l?.['@_href'],hash))?.['@_href']||description.match(/href=["'](https:\/\/onepace\.net\/torrents\/[^"']+)["']/)?.[1];
  if(torrentURL&&!officialTorrentURL(torrentURL,hash))throw Error('Invalid official torrent URL');if(!torrentURL&&!outdated&&hash&&magnet)torrentURL='https://onepace.net/torrents/'+hash+'.torrent';
  const fields=new Map([...description.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)].map(m=>[clean(m[1]),clean(m[2])]));
  const languages=label=>(fields.get(label)||'').match(/\b(?:en|ja|de|es-419|es|fr|fi|it|ru|tr|pt-BR|ar|pl|zh|ko)\b/g)||[];
  const height=Number(/(480|720|1080|2160)p/i.exec(fields.get('Resolution')||name)?.[1]);if(!height)throw Error('Official release resolution missing');
  const match=/^(.*?)\s+(\d{1,3})(?:\s+(.*))?$/.exec(title),variant=/extended/i.test(categories.join(' ')+' '+match?.[3])?'extended':/alternate/i.test(categories.join(' ')+' '+match?.[3])?'alternate':'standard';
  const published=Date.parse(text(e.pubDate||e.published)),updated=Date.parse(text(e.updated||e.pubDate||e.published));if(!Number.isFinite(published))throw Error('Invalid release date');
  const crc=/\[([a-f0-9]{8})\](?:\.[^.]+)?$/i.exec(name)?.[1]?.toUpperCase()||legacyCRC;
  const record={identity,hash,crc,filename:name,magnetURI:magnet,torrentURL,title,arcName:match?.[1]||null,episodeNumber:match?Number(match[2]):null,variant,height,audio:languages('Audio tracks'),subtitles:languages('Subtitle tracks'),mangaChapters:fields.get('Covered manga chapters')||null,animeEpisodes:fields.get('Covered anime episodes')||null,published,updated:Number.isFinite(updated)?updated:published,outdated,changelog:clean(description.match(/<details\b[\s\S]*?<\/details>/i)?.[0]||''),nyaaURL:(atom?links.map(x=>x?.['@_href']):[text(e.link)]).find(x=>/^https:\/\/nyaa\.si\/view\/\d+$/.test(x||''))||null,officialURL:'https://onepace.net/en/releases#urn:btih:'+hash,source:'official-release'};
  const key=hash||identity;const previous=result.get(key);if(blocked.has(key))continue;if(previous&&JSON.stringify(previous)!==JSON.stringify(canonicalRelease(record))){result.delete(key);blocked.add(key);throw Error('Conflicting official feed entries')}result.set(key,canonicalRelease(record));
 }catch(error){result.quarantined.push({identity:text(e?.guid||e?.id),reason:error.message})}
 }
 if(!result.size)throw Error('No valid official release entries: '+result.quarantined.map(x=>x.reason).slice(0,3).join('; '));return result;
}
export async function fetchOnePaceFeed(fetcher=fetch){const errors=[];let retryAfter=0;for(const url of feedURLs)try{const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){retryAfter=Math.max(retryAfter,retryAfterMS(r.headers.get('retry-after')));await r.body?.cancel();throw Error('HTTP '+r.status)}let size=0,parts=[];for await(const part of r.body){size+=part.length;if(size>8*1024*1024)throw Error('Feed exceeds limit');parts.push(part)}const entries=parseOnePaceFeed(Buffer.concat(parts).toString('utf8'));return {entries,url,warnings:errors,quarantined:entries.quarantined,retryAfter}}catch(e){errors.push(url+': '+e.message)}const error=Error(errors.join(' | '));error.retryAfter=retryAfter;throw error}
