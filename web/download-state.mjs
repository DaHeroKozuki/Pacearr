export function downloadGroup(row){
 if(row.queue?.status==='error')return 'errors';
 if(row.progress!==100)return 'downloading';
 if(!row.ignored&&['imported','already-current'].includes(row.queue?.status))return 'completed';
 return 'awaiting';
}
