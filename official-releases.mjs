export function parseOfficialReleases(html){
 if(typeof html!=='string'||html.length>12*1024*1024)throw Error('Official release page exceeds limit');
 const starts=[...html.matchAll(/<li\b[^>]*\bid="urn:btih:([a-f0-9]{40})"[^>]*>/gi)];
 const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex||dec,hex?16:10))).replace(/\s+/g,' ').trim();
 const result=new Map();
 for(let i=0;i<starts.length;i++){
  const hash=starts[i][1].toLowerCase(),block=html.slice(starts[i].index,starts[i+1]?.index??html.indexOf('</main>',starts[i].index));
  const info=block.slice(0,block.indexOf('<h4'));
  function field(label,end){const a=info.indexOf(label+'</span>');if(a<0)return null;const value=info.slice(a+label.length+7);const b=end?value.indexOf(end):value.indexOf('</div>');return clean(b>=0?value.slice(0,b):value)}
  const audio=field('Audio tracks'),subtitles=field('Subtitle tracks','Audio tracks'),quality=field('Resolution','Subtitle tracks');
  const codes=value=>value?(value.match(/\b(?:en|ja|de|es-419|fr|fi|it|ru|tr|pt-BR|ar|pl|zh|ko)\b/g)||[]):[];
  const magnet=block.match(/href="(magnet:[^"]+)"/)?.[1]?.replace(/&amp;/g,'&');let crc=null;
  if(magnet)try{const dn=new URL(magnet).searchParams.get('dn')||'';crc=/\[([a-f0-9]{8})\](?:\.[^.]+)?$/i.exec(dn)?.[1]?.toUpperCase()||null}catch{}
  const height=quality?Number(/(480|720|1080|2160)p/i.exec(quality)?.[1]):null;
  if(!height||!audio||!crc)continue;
  const nyaa=block.match(/href="(https:\/\/nyaa\.si\/view\/\d+)"/)?.[1]||null;
  const item={hash,crc,height,audio:codes(audio),subtitles:codes(subtitles),title:clean(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]||''),outdated:/\bOutdated\b/.test(clean(info)),officialURL:'https://onepace.net/en/releases#urn:btih:'+hash,nyaaURL:nyaa,source:'official-release'};
  const existing=result.get(hash);if(existing&&JSON.stringify(existing)!==JSON.stringify(item))throw Error('Ambiguous official release hash');result.set(hash,item);
 }
 if(!result.size)throw Error('Official release page format unavailable');return result;
}
export async function fetchOfficialReleases(fetcher=fetch){
 const response=await fetcher('https://onepace.net/en/releases',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Official release HTTP '+response.status);let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>12*1024*1024)throw Error('Official releases response exceeds safe limit');chunks.push(chunk)}
 return parseOfficialReleases(Buffer.concat(chunks).toString('utf8'));
}
export function officialForCRC(catalog,crc){const found=[...catalog.values()].filter(x=>x.crc===String(crc).toUpperCase());return found.length===1?found[0]:null}
