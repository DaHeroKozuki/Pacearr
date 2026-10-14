import {spawn} from 'node:child_process';
import {join} from 'node:path';
for(const args of [['worker-auto-smoke.mjs'],['worker-auto-smoke.mjs','--revision','--acquisition'],['worker-smoke.mjs'],['live-actions-smoke.mjs'],['update-worker-smoke.mjs'],['bundle-acquisition-smoke.mjs'],['untracked-import-smoke.mjs'],['official-worker-smoke.mjs']]){
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[join(import.meta.dirname,args[0]),...args.slice(1)],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(args.join(' ')+' exited '+code)))})
}
