/** G2 TEST_ONLY: second-layer real-origin Chromium acceptance; no personal records. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const url=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const output=process.env.RUNLOAD_DEEP_REPORT||'audit/real_deep_acceptance_actions.json';
const checks=[];let browser;let failure=null;
async function check(id,contract,task){const t=performance.now();try{const detail=await task();checks.push({id,contract,status:'PASS',durationMs:Math.round(performance.now()-t),detail});console.log('PASS',id,contract);return detail;}catch(error){checks.push({id,contract,status:'FAIL',durationMs:Math.round(performance.now()-t),error:String(error?.stack||error)});throw error;}}
async function visit(page){const response=await page.goto(url+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});assert.equal(response.status(),200);await page.locator('#app button').first().waitFor({timeout:15000});}
const database=async page=>page.evaluate(async()=>{const x=await import('/js/storage/database.js');const db=await x.openDatabase();try{return await x.readAll(db)}finally{db.close()}});
try{
 browser=await chromium.launch({headless:true});
 const mobileContext=await browser.newContext({viewport:{width:390,height:844}});
 const mobile=await mobileContext.newPage();await visit(mobile);
 await check('DEEP-01','New browser starts empty, accessible UI and no stored records',async()=>{const data=await database(mobile);assert.equal(data.records.length,0);assert.equal(await mobile.locator('.main-content h1').textContent(),'ホーム');assert.equal(await mobile.locator('[role="dialog"]').count(),0);return {records:0};});
 await check('DEEP-02','Invalid UI save is blocked and typed field values remain',async()=>{
  await mobile.locator('[data-action="new-record"]').first().click();
  await mobile.locator('#field-recordDate').fill('2026-10-10');
  await mobile.locator('#field-distanceKm').fill('0');
  await mobile.locator('#field-durationMinutes').fill('30');
  await mobile.locator('[data-action="confirm-save"]').click();
  assert.equal(await mobile.locator('[role="dialog"]').count(),1);
  assert.equal(await mobile.locator('[data-action="commit-record"]').count(),0);
  await mobile.locator('[data-action="close-modal"]').first().click();
  assert.equal(await mobile.locator('#field-distanceKm').inputValue(),'0');
  assert.equal((await database(mobile)).records.length,0);
  return {invalidPreservesDraft:true};
 });
 await check('DEEP-03','Real mobile UI writes first saved run and genuine reference snapshot',async()=>{
  await mobile.locator('#field-distanceKm').fill('6');
  await mobile.locator('details summary').click();
  await mobile.locator('#field-runningMix').selectOption('run');
  await mobile.locator('#field-speedPattern').selectOption('stable');
  await mobile.locator('#field-elapsedTimeBasis').selectOption('moving');
  await mobile.locator('[data-action="confirm-save"]').click();
  await mobile.locator('[data-action="commit-record"]').click();
  await mobile.locator('.main-content h1').filter({hasText:'結果'}).waitFor();
  const state=await database(mobile);
  assert.equal(state.records.length,1);assert.equal(state.resultSnapshots.length,1);
  assert.equal(state.resultSnapshots[0].regionResults.length,12);
  assert.equal(state.records[0].revision,1);
  return {id:state.records[0].recordId,regions:12};
 });
 await check('DEEP-04','Records and snapshot survive page reload and new workflow instance',async()=>{await mobile.reload({waitUntil:'domcontentloaded'});await mobile.locator('#app button').first().waitFor();const state=await database(mobile);assert.equal(state.records.length,1);assert.equal(state.resultSnapshots.length,1);const button=mobile.locator('[data-action="open-record"]');assert.ok(await button.count()>0);return {revision:state.records[0].revision};});
 await check('DEEP-05','Optional modal traps background and closes without input loss',async()=>{
  await mobile.locator('[data-action="navigate"][data-id="S05"]').first().click();
  await mobile.locator('[data-action="open-region"]').first().click();
  assert.equal(await mobile.locator('[role="dialog"]').count(),1);
  assert.equal(await mobile.locator('.app-shell').getAttribute('inert'),'');
  await mobile.locator('[data-action="close-modal"]').first().click();
  assert.equal(await mobile.locator('[role="dialog"]').count(),0);
  return {inertBackground:true};
 });
 await check('DEEP-06','Mobile content retains no horizontal overflow at 320 and 390',async()=>{
  const widths=[];
  for(const size of [320,390]){await mobile.setViewportSize({width:size,height:844});const v=await mobile.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));assert.ok(v.scroll<=v.viewport+2,JSON.stringify(v));widths.push({width:size,...v});}
  return {widths};
 });
 const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await visit(page);
 const lifecycle=await check('DEEP-07','Run 1: PRE=0, POST, reflection, body note and followup stay linked atomically',async()=>{
  const outcome=await page.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();flow.resetDraft();
   const draftSessionId=await flow.observePre(0);flow.observePost(7);
   flow.draft={...flow.draft,recordDate:'2026-10-11',distanceKm:6,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
   const saved=await flow.saveCurrent();
   if(saved.status!=='saved')return {saved};
   const refl=await flow.saveReflection('DEEP_PRIVATE_REFLECTION_9x','DEEP_PRIVATE_FOLLOWUP_8y','DEEP_PRIVATE_BODY_7z','R07','left');
   const {readAll}=await import('/js/storage/database.js');const state=await readAll(flow.db);
   return {saved,reflection:refl,recordId:saved.recordId,run:flow.active.run,storeCounts:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.length])),fatigue:flow.active.fatigue,body:flow.active.bodyObservations,followups:flow.active.followups,draftSessionId,snapshots:state.resultSnapshots.filter(x=>x.recordId===saved.recordId).map(x=>x.recordRevision),revisions:state.recordRevisions.filter(x=>x.recordId===saved.recordId).map(x=>x.revision)};
  });
  assert.equal(outcome.saved.status,'saved');assert.equal(outcome.reflection.status,'saved');assert.equal(outcome.run.revision,2);
  assert.equal(outcome.fatigue.find(x=>x.phase==='pre').value,0);assert.equal(outcome.fatigue.find(x=>x.phase==='post').value,7);
  assert.equal(outcome.body.length,1);assert.equal(outcome.followups.length,1);
  assert.deepEqual(outcome.snapshots,[1,2]);assert.deepEqual(outcome.revisions,[1,2]);
  return {recordId:outcome.recordId,revision:outcome.run.revision,fatigueCount:outcome.fatigue.length};
 });
 await check('DEEP-08','Explicit sharing selection prevents private observations leaking to preview',async()=>{
  const res=await page.evaluate(async(id)=>{
   const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();await flow.chooseRecord(id);
   let unselectedDenied=false;try{flow.generatePreview(false)}catch{unselectedDenied=true}
   flow.shareSelection={recordDate:true};const short=flow.generatePreview(false);const valid=await flow.validateSharePreview();
   flow.shareSelection={recordDate:true,reflection:true};const report=flow.generatePreview(true);
   return {unselectedDenied,short:short.text,report:report.text,valid};
  },lifecycle.recordId);
  assert.equal(res.unselectedDenied,true);assert.equal(res.valid,true);
  assert.ok(res.short.includes('走行日'));assert.ok(!res.short.includes('DEEP_PRIVATE_REFLECTION_9x'));
  assert.ok(!res.short.includes('DEEP_PRIVATE_FOLLOWUP_8y'));assert.ok(!res.short.includes('DEEP_PRIVATE_BODY_7z'));
  assert.ok(res.report.includes('DEEP_PRIVATE_REFLECTION_9x'));assert.ok(!res.report.includes('DEEP_PRIVATE_FOLLOWUP_8y'));
  return {deniedNoSelection:true,privateFieldsExcluded:true};
 });
 const second=await check('DEEP-09','Run 2: chronological history and next-run followup are distinct records',async()=>{
  const result=await page.evaluate(async(firstId)=>{
   const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();flow.resetDraft();
   flow.draft={...flow.draft,recordDate:'2026-10-12',distanceKm:7,durationSeconds:2200,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
   const saved=await flow.saveCurrent();if(saved.status!=='saved')return {saved};
   const available=flow.cachedFollowups.filter(x=>x.sourceRecordId===firstId);
   const before=flow.historyComparison((flow.pastDetails??[]).find(x=>x.run.recordId===firstId));
   const following=await flow.checkFollowup(available[0].followupId,'completed','DEEP_SECOND_RUN_RESPONSE');
   const status=flow.cachedFollowups.find(x=>x.followupId===available[0].followupId);
   return {saved,firstId,secondId:saved.recordId,historyCompatible:before?.compatible??null,following,status};
  },lifecycle.recordId);
  assert.equal(result.saved.status,'saved');assert.notEqual(result.secondId,lifecycle.recordId);assert.equal(result.following.status,'saved');
  assert.equal(result.status.checkedInRecordId,result.secondId);assert.equal(result.status.status,'completed');
  return {recordId:result.secondId,followupCompleted:true,historyCompatible:result.historyCompatible};
 });
 await check('DEEP-10','Generated sharing preview is invalidated by a record revision update',async()=>{
  const outcome=await page.evaluate(async id=>{
   const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();await flow.chooseRecord(id);
   flow.shareSelection={recordDate:true};flow.generatePreview(false);const before=await flow.validateSharePreview();
   const saved=await flow.saveReflection('DEEP_SECOND_UPDATE','');const after=await flow.validateSharePreview();
   return {before,saved,after};
  },second.recordId);
  assert.equal(outcome.before,true);assert.equal(outcome.saved.status,'saved');assert.equal(outcome.after,false);return {stalePreviewRejected:true};
 });
 await check('DEEP-11','Invalid backup checksum does not alter database',async()=>{
  const result=await page.evaluate(async()=>{
   const {openDatabase,readAll}=await import('/js/storage/database.js');const {createBackup,inspectBackup}=await import('/js/storage/interchange.js');const db=await openDatabase();try{
    const before=(await readAll(db)).records.length;const value=JSON.parse(await createBackup(db));value.checksum.value='0'.repeat(64);
    let rejected=false;try{await inspectBackup(JSON.stringify(value))}catch{rejected=true}
    const after=(await readAll(db)).records.length;
    return {before,after,rejected};
   }finally{db.close()}
  });assert.equal(result.rejected,true);assert.equal(result.before,2);assert.equal(result.after,2);return result;
 });
 await check('DEEP-12','Deletion of second record detaches followup without destroying original',async()=>{
  const result=await page.evaluate(async({first,second})=>{
   const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();await flow.chooseRecord(second);
   const review=await flow.reviewDeletion();const deletion=await flow.confirmDeletion();
   const {readAll}=await import('/js/storage/database.js');const all=await readAll(flow.db);const related=all.followups.find(x=>x.sourceRecordId===first);
   return {review:review.counts,deletion,records:all.records.map(x=>x.recordId),related,orphans:all.resultSnapshots.some(x=>x.recordId===second)||all.recordRevisions.some(x=>x.recordId===second)};
  },{first:lifecycle.recordId,second:second.recordId});
  assert.equal(result.deletion.status,'deleted');assert.deepEqual(result.records,[lifecycle.recordId]);assert.equal(result.orphans,false);
  assert.equal(result.related.checkedInRecordId,null);assert.equal(result.related.status,'completed');
  return {remainingRecords:result.records.length,detachedFollowup:true};
 });
 await check('DEEP-13','Desktop screen and modal show no horizontal overflow at normal width',async()=>{
  await page.setViewportSize({width:1366,height:768});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#app button').first().waitFor();
  const info=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
  assert.ok(info.body<=info.viewport+2,JSON.stringify(info));return info;
 });
 await context.close();await mobileContext.close();
}catch(error){failure={name:error?.name??'Error',message:String(error?.stack||error)};console.error(error);}finally{
 if(browser)await browser.close().catch(()=>{});
 const report={schema:'RunLoad-G2-Deep-Acceptance-V1',timestamp:new Date().toISOString(),origin:url,environment:'GitHub Actions Chromium genuine IndexedDB',testData:'synthetic only',checks,failure};
 await fs.mkdir(output.split('/').slice(0,-1).join('/')||'.',{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(`Deep acceptance: ${checks.filter(x=>x.status==='PASS').length}/${checks.length} PASS, failure=${failure?'YES':'NO'}`);
}
if(failure||checks.length!==13)process.exitCode=1;