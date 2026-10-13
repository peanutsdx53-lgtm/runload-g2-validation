import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
let browser,failure;const checks=[];
async function check(id,title,fn){try{const detail=await fn();checks.push({id,status:'PASS',title,detail});console.log('PASS '+id+' '+title)}catch(e){checks.push({id,status:'FAIL',title,reason:String(e.message??e)});throw e}}
const validDraft=date=>({recordDate:date,distanceKm:6,durationSeconds:2100,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving',distanceConfidence:'known',recordSource:'manual'});
async function page(ctx){const p=await ctx.newPage();const response=await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await p.locator('#main-content').waitFor();return p}
try{
browser=await chromium.launch();
await check('G1-E2E02','Save failure preserves draft and retry saves exactly one revision',async()=>{
 const ctx=await browser.newContext();try{
 const p=await page(ctx);const result=await p.evaluate(async draft=>{
   const {Workflow}=await import('/js/app/workflow.js');
   const {readAll}=await import('/js/storage/database.js');
   const w=new Workflow();await w.init();w.resetDraft();w.draft={...w.draft,...draft};
   const original=IDBObjectStore.prototype.add;let injected=0;
   IDBObjectStore.prototype.add=function(...a){if(this.name==='recordRevisions'&&!injected++){throw new DOMException('TEST_ONLY_ABORT','QuotaExceededError')}return original.apply(this,a)};
   let failure;try{failure=await w.saveCurrent()}catch(e){failure={status:'rejected',error:e.message}}finally{IDBObjectStore.prototype.add=original}
   const afterError=await readAll(w.db,['records','recordRevisions','resultSnapshots']);
   const preserved=w.draft.recordDate===draft.recordDate&&w.draft.distanceKm===draft.distanceKm;
   const retry=await w.saveCurrent();
   const afterRetry=await readAll(w.db,['records','recordRevisions','resultSnapshots']);
   return {failureStatus:failure.status,preserved,before:[afterError.records.length,afterError.recordRevisions.length,afterError.resultSnapshots.length],after:[afterRetry.records.length,afterRetry.recordRevisions.length,afterRetry.resultSnapshots.length],retryStatus:retry.status,revision:afterRetry.records[0]?.revision};
 },validDraft('2026-10-11'));
 assert.equal(result.preserved,true);assert.deepEqual(result.before,[0,0,0]);assert.deepEqual(result.after,[1,1,1]);assert.equal(result.retryStatus,'saved');assert.equal(result.revision,1);
 return result;
 }finally{await ctx.close()}
});
await check('G1-E2E06','Column reading does not automatically create followup; explicit user choice does',async()=>{
 const ctx=await browser.newContext();try{
 const p=await page(ctx);const r=await p.evaluate(async draft=>{
  const {Workflow}=await import('/js/app/workflow.js');const {readAll}=await import('/js/storage/database.js');
  const w=new Workflow();await w.init();w.resetDraft();w.draft={...w.draft,...draft};
  const saved=await w.saveCurrent();if(saved.status!=='saved')throw Error('seed save failed');
  w.selectedRegion='R01';const col=w.column();w.openModal('S08');w.closeModal();
  const before=(await readAll(w.db,['followups'])).followups.length;
  const writing=await w.saveReflection('', '本人が次回に確認する事項', '', 'R01','unknown');
  const after=(await readAll(w.db,['followups'])).followups;
  return {column:col?.id??null,source:col?.source??null,before,after:after.length,status:writing.status,text:after[0]?.text,sourceRecordMatch:after[0]?.sourceRecordId===w.active.run.recordId};
 },validDraft('2026-10-11'));
 assert.equal(r.before,0);assert.equal(r.after,1);assert.equal(r.status,'saved');assert.equal(r.sourceRecordMatch,true);assert.ok(/^COL0[1-6]$/.test(r.column));assert.ok(['28','29','30'].includes(r.source));return r;
 }finally{await ctx.close()}
});
await check('G1-E2E11','PRE draft session survives browser reload; original capture timestamp remains immutable after linking',async()=>{
 const ctx=await browser.newContext();try{
 const p=await page(ctx);const before=await p.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();w.resetDraft();
   const id=await w.observePre(0);return {id,time:w.currentPre.firstCapturedAt}
 });
 await p.reload({waitUntil:'domcontentloaded'});await p.locator('#main-content').waitFor();
 const after=await p.evaluate(async ({before,draft})=>{
   const {Workflow}=await import('/js/app/workflow.js');const {readAll}=await import('/js/storage/database.js');
   const w=new Workflow();await w.init();w.resetDraft();await w.resumePendingPre();
   const resumed=w.draftSessionId===before.id&&w.currentPre?.firstCapturedAt===before.time;
   w.draft={...w.draft,...draft};const saved=await w.saveCurrent();
   const stores=await readAll(w.db,['records','fatigueObservations','draftSessions']);
   return {resumed,saved:saved.status,linkedSession:stores.draftSessions[0]?.linkedRecordId===stores.records[0]?.recordId,initialTimestampUnchanged:stores.fatigueObservations[0]?.firstCapturedAt===before.time,zeroPreserved:stores.fatigueObservations[0]?.value===0};
 },{before,draft:validDraft('2026-10-11')});
 assert.equal(after.resumed,true);assert.equal(after.saved,'saved');assert.equal(after.linkedSession,true);assert.equal(after.initialTimestampUnchanged,true);assert.equal(after.zeroPreserved,true);return after;
 }finally{await ctx.close()}
});
}catch(e){failure={reason:String(e.message??e),stack:String(e.stack??'').slice(0,2200)};console.error(e)}
finally{await browser?.close().catch(()=>{});const report={schema:'RunLoad-G2-G1-E2E-PreUI-V1',runAt:new Date().toISOString(),checks,failure};await fs.writeFile('audit/g1_e2e_preui_actions.json',JSON.stringify(report,null,2)+'\n');console.log('E2E residual:',checks.filter(x=>x.status==='PASS').length+'/'+checks.length,'PASS');if(failure||checks.length!==3)process.exitCode=1}
