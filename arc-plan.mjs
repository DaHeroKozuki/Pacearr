import {manifestEpisodes,coversSameChapters,arcKey} from './release-identity.mjs';
export function arcPlan({release,files,arc,installed,profile}){
 const wanted=manifestEpisodes(release,files),canonical=wanted.filter(f=>!f.optional),optional=wanted.filter(f=>f.optional);if(!canonical.length||![0,1].includes(canonical[0]?.episodeNumber)||canonical.some((f,i)=>f.episodeNumber!==i+canonical[0].episodeNumber))throw Error('Batch canonical episode sequence has gaps; mapping review required');if(arcKey(release.arcName)!==arcKey(arc.title))throw Error('Batch and library arc disagree');
 if(installed.some(f=>!f.known||!f.coverage))throw Error('Installed arc identities or chapter coverage require review');
 if(!coversSameChapters(installed.map(f=>f.coverage),canonical.map(f=>f.coverage)))throw Error('Replacement chapter coverage differs from the installed arc; review required');
 if(installed.some(f=>!Number.isFinite(f.height)||f.height>release.height))throw Error('Unknown installed resolution or quality downgrade blocked');
 const quality=installed.some(f=>f.height<release.height);if(quality?!profile.autoQualityUpgrades:!profile.autoRevisions)throw Error('Automatic '+(quality?'quality upgrades':'revisions')+' are disabled');
 const current=installed.length===canonical.length&&canonical.every(f=>installed.some(old=>old.episode===f.episodeNumber&&old.crc===f.crc));
 return {season:arc.arc,arcName:arc.title,hash:release.hash,variant:release.variant,published:release.published,height:release.height,kind:quality?'quality-upgrade':'arc-revision',files:canonical,optional,chapterSafe:true,status:current?'current':'planned',reason:current?'Verified canonical arc already installed':'Verified full-arc chapter coverage; stage '+canonical.length+' canonical episodes before replacing the installed set'};
}
