export function downloadGroup(row){
 if(row.selected===false)return 'skipped';
 if(row.queue?.status==='error')return 'errors';
 if(row.offline)return row.finished&&!row.ignored&&['imported','already-current'].includes(row.queue?.status)?'completed':'awaiting';
 if(row.progress!==100)return 'downloading';
 if(!row.ignored&&['imported','already-current'].includes(row.queue?.status))return 'completed';
 return 'awaiting';
}
