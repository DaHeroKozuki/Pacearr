import {basename,extname} from 'node:path';
const normalize=value=>String(value||'').replace(/\[[^\]]*\]/g,' ').replace(/\([^)]*\)/g,' ').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function variants(ep){return ['standard','extended','alternate','archived'].flatMap(variant=>(variant==='archived'?ep.files?.archived||[]:[ep.files?.[variant]]).filter(Boolean).map(f=>({variant,...f})))}
export function episodeSuggestion(metadata,path,hash){
 const name=basename(path,extname(path)),stem=name.replace(/\[[^\]]*\]/g,' ').replace(/\([^)]*\)/g,' ').trim();
 const numbered=/^(\d{1,3})\s*-\s*(.+)$/.exec(stem);const title=normalize(numbered?numbered[2]+' '+Number(numbered[1]):stem.includes(' - ')?stem.split(' - ').slice(1).join(' - '):stem);
 const knownArcs=new Set((metadata?.arcs||[]).filter(a=>a.episodes.some(e=>variants(e).some(f=>hash&&f.hash?.toLowerCase()===hash.toLowerCase()))).map(a=>a.arc));
 const coverage=/\[(\d{1,4}(?:-\d{1,4})?)\]/.exec(name)?.[1];const hits=[];
 for(const arc of metadata?.arcs||[])for(const ep of arc.episodes||[]){
  const normalized=normalize(ep.title).replace(/\b0+(\d+)\b/g,'$1');const titleMatch=title&&normalized===title.replace(/\b0+(\d+)\b/g,'$1');
  const release=hash&&variants(ep).find(f=>f.hash?.toLowerCase()===hash.toLowerCase());
  const coverageMatch=coverage&&String(ep.mangaChapters||'').replace(/\s/g,'')===coverage;
  const contextMatch=knownArcs.size===1&&knownArcs.has(arc.arc)&&coverageMatch;
  if(titleMatch||release&&coverageMatch||contextMatch)hits.push({season:arc.arc,episode:ep.episode,title:ep.title,variant:release?.variant||null,hash:release?.hash?.toLowerCase()||null,metadataCRC:release?.CRC32?.toUpperCase()||null,selectionVerified:!!(release&&titleMatch&&coverageMatch),reason:release&&titleMatch&&coverageMatch?'Exact authoritative bundle, title and coverage match; content checksum still required':titleMatch?'Matching title/cut number; confirm this episode assignment':'Known bundle arc and exact coverage match, but this file version is unverified; confirm this episode assignment'});
 }
 const unique=new Map(hits.map(h=>[h.season+':'+h.episode,h]));return unique.size===1?unique.values().next().value:null;
}
