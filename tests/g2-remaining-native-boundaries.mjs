/** TEST_ONLY: targeted native Chromium/IndexedDB evidence for unresolved G1 DB gates. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const report=process.env.RUNLOAD_REMAINING_NATIVE_REPORT||'audit/g2_remaining_native_actions.json';
let browser;
const results=[];
async function caseCheck(id,detail,fn){try{const result=await fn();results.push({id,status:'PASS',detail,result});console.log(`PASS ${id} ${detail}`)}catch(e){results.push({id,status:'FAIL',detail,error:String(e?.stack||e)});throw e}}
async function visit(page){const r=await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(r.status(),200);await page.locator('#app').waitFor({state:'attached'});}
try{
 browser=await chromium.launch({headless:true});
 const c1=await browser.newContext(),p1=await c1.newPage();await visit(p1);
 const original=await p1.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();w.resetDraft();
   w.draft={...w.draft,recordDate:'2026-10-12',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
   const saved=await w.saveCurrent();return {recordId:saved.recordId,status:saved.status,revision:saved.revision};
 });assert.equal(original.status,'saved');assert.equal(original.revision,1);
 await caseCheck('DB01','native IndexedDB survives complete page closure and fresh tab',async()=>{
   await p1.close();const p2=await c1.newPage();await visit(p2);
   const info=await p2.evaluate(async(id)=>{
     const {openDatabase}=await import('/js/storage/database.js');const {loadRecord}=await import('/js/storage/repository.js');
     const db=await openDatabase();try{const row=await loadRecord(db,id);return {id:row?.run?.recordId,revision:row?.run?.revision,snapshotCount:row?.snapshot?.regionResults?.length};}finally{db.close();}
   },original.recordId);
   assert.deepEqual(info,{id:original.recordId,revision:1,snapshotCount:12});return info;
 });
 const p2=c1.pages()[0];
 const exported=await p2.evaluate(async()=>{
   const {openDatabase}=await import('/js/storage/database.js');const {createBackup}=await import('/js/storage/interchange.js');
   const db=await openDatabase();try{return await createBackup(db);}finally{db.close();}
 });
 await caseCheck('DB06','native restore into isolated new profile reproduces all backed-up record content and references',async()=>{
   const c2=await browser.newContext();const p3=await c2.newPage();await visit(p3);
   const result=await p3.evaluate(async(text)=>{
     const {openDatabase}=await import('/js/storage/database.js');const {inspectBackup,previewRestore,restoreBackup,createBackup,canonicalJson}=await import('/js/storage/interchange.js');
     const db=await openDatabase();try{
       const parsed=await inspectBackup(text);const preview=await previewRestore(db,parsed);const restored=await restoreBackup(db,parsed);
       const exportedAgain=await inspectBackup(await createBackup(db));
       const names=Object.keys(parsed.stores).filter(name=>name!=='appMetadata');
       const match=names.every(n=>canonicalJson(parsed.stores[n].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))===canonicalJson(exportedAgain.stores[n].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
       return {restored:restored.status,previewAdded:preview.added.records,recordCount:exportedAgain.stores.records.length,recordsEqual:match,storeCounts:exportedAgain.counts};
     }finally{db.close();}
   },exported);
   assert.equal(result.restored,'restored');assert.equal(result.previewAdded,1);assert.equal(result.recordCount,1);assert.equal(result.recordsEqual,true);
   await c2.close();return result;
 });
 await caseCheck('DB09','separate browser profiles do not silently synchronize native IndexedDB',async()=>{
   const c3=await browser.newContext();const p4=await c3.newPage();await visit(p4);
   await p4.locator('[data-action="navigate"][data-id="S14"]').first().click();
   const info=await p4.evaluate(async()=>{
     const {openDatabase,readAll}=await import('/js/storage/database.js');const db=await openDatabase();try{return {records:(await readAll(db)).records.length,hasManualBackupNotice:document.body.textContent.includes('別端末との自動同期はありません')};}finally{db.close();}
   });assert.equal(info.records,0);assert.equal(info.hasManualBackupNotice,true);
   await c3.close();return info;
 });
 await caseCheck('DB07','backup preview detects subsequent native IndexedDB record collision and refuses restore',async()=>{
   const dbResult=await p2.evaluate(async({recordId,text})=>{
     const {openDatabase}=await import('/js/storage/database.js');const {inspectBackup,previewRestore}=await import('/js/storage/interchange.js');
     const {saveRecord,loadRecord}=await import('/js/storage/repository.js');const db=await openDatabase();try{
       const backup=await inspectBackup(text);const before=await previewRestore(db,backup);
       const stored=await loadRecord(db,recordId);
       const revised=await saveRecord(db,{recordId,expectedRevision:1,run:{...stored.run,reflection:'TEST_ONLY concurrent backup change'},snapshot:stored.snapshot});
       let fail=false,collisions=[];try{await previewRestore(db,backup);}catch(e){fail=true;collisions=e.conflicts??[];}
       const after=await loadRecord(db,recordId);
       return {beforeConflicts:before.conflicts.length,revised:revised.status,blocked:fail,collisions:collisions.length,revision:after.run.revision};
     }finally{db.close();}
   },{recordId:original.recordId,text:exported});
   assert.equal(dbResult.beforeConflicts,0);assert.equal(dbResult.revised,'saved');assert.equal(dbResult.blocked,true);assert.ok(dbResult.collisions>0);assert.equal(dbResult.revision,2);return dbResult;
 });
 await c1.close();
} catch(err){console.error(err);process.exitCode=1}
finally{await browser?.close();await fs.mkdir(report.split('/').slice(0,-1).join('/')||'.',{recursive:true});await fs.writeFile(report,JSON.stringify({status:results.every(x=>x.status==='PASS')&&results.length===4?'PASS':'FAIL',results},null,2));}