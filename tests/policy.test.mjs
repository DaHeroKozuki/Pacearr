import test from 'node:test';import assert from 'node:assert/strict';
import {defaultProfile,preferredRelease,assessInstalled,crcChunk,hashLibraryFile,replacementPolicy} from '../beta-policy.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
const ep={files:{standard:{CRC32:'11111111'},extended:{CRC32:'22222222'},alternate:{CRC32:'33333333'},archived:[{CRC32:'44444444'}]}};
test('Beta preference precedence and defaults',()=>{assert.equal(preferredRelease(ep).variant,'standard');assert.equal(preferredRelease(ep,{preferExtended:true}).variant,'extended');assert.equal(preferredRelease(ep,{preferExtended:true,preferAlternate:true}).variant,'alternate');assert.equal(defaultProfile.skipVerifyPresent,true)});
test('Checksum decisions use explicit comparison, including filename alias',()=>{assert.equal(assessInstalled(ep,'11111111').status,'current');assert.equal(assessInstalled(ep,'33333333',{preferAlternate:true}).status,'current');assert.equal(assessInstalled(ep,'11111111',{preferAlternate:true}).status,'replacement-candidate');assert.equal(assessInstalled(ep,'44444444').variant,'archived');assert.equal(assessInstalled(ep,'aaaaaaaa').status,'review-checksum-mismatch');const alias={files:{standard:{CRC32:'11111111',CRC32_inFileName:'ABCDEF00'}}};assert.equal(assessInstalled(alias,'abcdef00').status,'current');assert.equal(assessInstalled(alias,'aaaaaaaa').status,'review-checksum-mismatch')});
test('CRC32 standard vector and secure read-only file hashing',async()=>{assert.equal(((crcChunk(Buffer.from('123456789'))^0xffffffff)>>>0).toString(16),'cbf43926');const dir=await mkdtemp(tmpdir()+'/pacearr-crc-');try{await writeFile(dir+'/video.mkv','123456789');assert.equal((await hashLibraryFile(dir,'video.mkv')).crc,'CBF43926');await assert.rejects(hashLibraryFile(dir,'../outside'))}finally{await rm(dir,{recursive:true,force:true})}});

test('Automatic revision and quality upgrade policy rejects downgrades and unknown installed identities',()=>{
 const known={status:'replacement-candidate'},old={height:720},fresh={height:1080};
 assert.equal(replacementPolicy(known,old,fresh,defaultProfile).kind,'quality-upgrade');assert.equal(replacementPolicy(known,old,fresh,defaultProfile).automatic,true);
 assert.equal(replacementPolicy(known,{height:1080},fresh,defaultProfile).kind,'release-revision');assert.equal(replacementPolicy(known,{height:1080},fresh,defaultProfile).automatic,true);
 assert.equal(replacementPolicy(known,old,fresh,{...defaultProfile,autoQualityUpgrades:false}).automatic,false);
 assert.equal(replacementPolicy(known,{height:1080},old,defaultProfile).allowed,false);
 assert.equal(replacementPolicy({status:'review-checksum-mismatch'},old,fresh,defaultProfile).allowed,false);
 const official={source:'official-release',title:'Skypiea 25 Alternate',height:1080};assert.equal(replacementPolicy({status:'review-checksum-mismatch'},official,official,defaultProfile).allowed,true);
});

test('Automatic edits and quality updates do not silently change between standard, extended and alternate cuts',()=>{const result=replacementPolicy({status:'replacement-candidate',variant:'archived',originalVariant:'alternate',preferred:'standard'},{height:720},{height:1080},defaultProfile);assert.equal(result.allowed,true);assert.equal(result.kind,'variant-change');assert.equal(result.automatic,false)});
