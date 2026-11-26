export const CHECK_INTERVALS=[15,30,45,60,180,360,720,1440];
export function checkMinutes(settings){return CHECK_INTERVALS.includes(Number(settings?.checkIntervalMinutes))?Number(settings.checkIntervalMinutes):15;}
export function discoveryDue(last,settings,now=Date.now()){return !last||now-Number(last)>=checkMinutes(settings)*60000;}
// A removed torrent does not erase a proven source identity. A changed file does.
export function retainedOutcome(row,queue,downloadRoot,libraryRoot){
 if(row.exists===false)return null;
 return Object.values(queue||{}).find(item=>{
  if(item.path!==row.path||item.downloadRoot!==downloadRoot||item.libraryRoot!==libraryRoot||!['imported','already-current'].includes(item.status))return false;
  const f=item.sourceFingerprint;
  if(f)return f.size===(row.actualSize??row.size)&&f.mtimeMs===row.mtimeMs&&f.ctimeMs===row.ctimeMs&&f.ino===row.ino;
  // Existing v1.2 completion records include a stat signature; migrate without rehashing.
  return !!item.sourceSignature&&item.sourceSignature===`${row.actualSize??row.size}:${row.mtimeMs}:${row.ctimeMs}`;
 })||null;
}

export function retireObsoleteGrabs(state){let count=0;for(const g of Object.values(state.manualGrabs||{})){const plan=state.arcUpgrades?.[g.season];if(g.root&&state.settings?.downloadPath&&g.root!==state.settings.downloadPath)continue;if(!plan||plan.root!==state.settings?.libraryPath||!['committed','current'].includes(plan.status)||['imported','expired','cancelled'].includes(g.status)||plan.files?.some(f=>f.episodeNumber===g.episode))continue;g.status='expired';g.reason='Resolved: completed arc upgrade superseded this obsolete episode number';g.retryAt=0;count++;}return count;}
