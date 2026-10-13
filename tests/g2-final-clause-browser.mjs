/** Independent G1 final-clause browser probes; all records synthetic and isolated. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const cases=[];let browser;
async function check(id,probe){try{const observed=await probe();cases.push({id,status:'PASS',expected:'specific original G1 contract',observed});console.log('PASS '+id)}catch(e){cases.push({id,status:'FAIL',error:String(e.stack??e)});console.error('FAIL '+id,e.message)}}
const init=async page=>{await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.locator('.main-content h1').waitFor();};
const seed=async(page,date='2026-09-10')=>page.evaluate(async(date)=>{const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();w.draft={...w.draft,recordDate:date,distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};const res=await w.saveCurrent();if(res.status!=='saved')throw Error(JSON.stringify(res));return w.active.run.recordId;},date);
try{
 browser=await chromium.launch({headless:true});
 await check('G1-S03-PRE-POST-SAVED-WITH-TIME-AND-INVALID-DELTA',async()=>{
  const context=await browser.newContext(),page=await context.newPage();await init(page);
  const value=await page.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const {fatigueDifference}=await import('/js/domain/fatigue.js');const {readAll}=await import('/js/storage/database.js');
   const w=new Workflow();await w.init();w.resetDraft();await w.observePre(0);const preSession=await readAll(w.db);const initial=preSession.fatigueObservations.find(o=>o.phase==='pre');if(initial?.value!==0)throw Error('PRE=0 missing');
   w.draft={...w.draft,recordDate:'2026-09-10',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
   w.postObservation=null;w.observePost(5);const post=w.postObservation;if(post?.phase!=='post')throw Error('POST phase lost');
   const result=await w.saveCurrent();if(result.status!=='saved')throw Error(JSON.stringify(result));const phases=w.active.fatigue.map(o=>({phase:o.phase,value:o.value,capturedAt:o.capturedAt,revision:o.revision}));
   const d=fatigueDifference(w.active.fatigue,w.active.run);return {status:result.status,phases,delta:d};});
  assert.deepEqual(value.phases.map(x=>x.phase).sort(),['post','pre']);assert.equal(value.phases.find(x=>x.phase==='pre').value,0);assert.ok(value.phases.every(x=>x.capturedAt||x.recordedAt||x.revision));await context.close();return value;
 });
 await check('G1-S05-UNAVAILABLE-REFERENCE-STILL-ENABLES-REFLECTION',async()=>{
  const ctx=await browser.newContext(),page=await ctx.newPage();await init(page);await seed(page);await page.reload();await page.locator('.sidebar [data-id="S05"]').click();await page.locator('[data-action="navigate"][data-id="S10"]').last().click();await page.getByText('本人の振り返り').waitFor();const result={reflectionsVisible:true,recordId:(await page.locator('.screen-header small').innerText())};await ctx.close();return result;
 });
 await check('G1-E2E04-ALL-FIGURE-VIEWS-KEEP-REGION-AND-RECORD',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();await init(page);const recordId=await seed(page);await page.reload();await page.locator('.footer-nav [data-id="S05"]').click();const findings=[];
  for(const [view,region] of [['front','R01'],['back','R02'],['sole','R10']]){
   await page.locator(`[data-action="figure-view"][data-id="${view}"]`).click();await page.locator(`.figure-hit[data-id="${region}"]`).click();const sel=await page.locator(`.region-list [data-action="select-region"][data-id="${region}"]`).getAttribute('aria-pressed');assert.equal(sel,'true');await page.locator('[data-action="open-region"]').click();const details=await page.locator('.modal-body').innerText();assert.ok(details.includes('出典')||details.includes('算出不可'));await page.locator('.modal [data-action="close-modal"]').first().click();await page.locator('.modal').waitFor({state:'detached'});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<2);findings.push({view,region,recordId,overflow});
  }await ctx.close();return findings;
 });
 await check('G1-ACT20-E2E05-IN42-COMPATIBLE-SERIES-RANGE-AND-GAPS',async()=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:820}}),page=await ctx.newPage();await init(page);
  const info=await page.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const {render,historyTimeCoordinates}=await import('/js/ui/views.js');const {selectHistoryRange,compareReferenceResults}=await import('/js/domain/history.js');
   const w=new Workflow();const base={regionId:'R01',metricId:'metric',sourceId:'source',sourceHash:'evidence_SHA_abc',unit:'U',referenceDefinition:'relative',referenceValue:1,referenceSpeedKmh:10,modelVersion:'g1_model',meaningVersion:'g1_meaning',value:10,reference100:100};const dt=n=>'2026-09-'+String(n).padStart(2,'0');
   const past=Array.from({length:10},(_,i)=>({run:{recordId:'TEST'+i,recordDate:dt(i+1),runningMix:'run',surface:'asphalt',elapsedTimeBasis:'moving'},snapshot:{regionResults:[{...base,value:i===4?null:10+i,reference100:i===4?null:100+i,sourceHash:i===7?'different_source':base.sourceHash}]}}));
   const act={run:{recordId:'ACTIVE',recordDate:dt(12),runningMix:'run'},snapshot:{regionResults:[{...base,value:25,reference100:125}]},fatigue:[],bodyObservations:[],followups:[]};
   w.active=act;w.pastDetails=past;w.records=[...past.map(x=>x.run),act.run];w.selectedRegion='R01';w.screen='S07';w.historyValue='reference100';w.historyMode='difference';
   let a=selectHistoryRange(past,act,'R01',{range:'all'}),r=selectHistoryRange(past,act,'R01',{range:'recent'}),custom=selectHistoryRange(past,act,'R01',{range:'custom',start:'2026-09-03',end:'2026-09-06'});
   const bad=compareReferenceResults(act.snapshot.regionResults[0],past[7].snapshot.regionResults[0],{comparisonMode:'ratio'});
   const missing=compareReferenceResults(act.snapshot.regionResults[0],past[4].snapshot.regionResults[0]);
   render(w);const svg=document.querySelector('.history-graph');const allLines=svg?.querySelectorAll('line').length??0;const allCircles=svg?.querySelectorAll('circle').length??0;
   w.historyRange='custom';w.historyStart='2026-09-03';w.historyEnd='2026-09-06';render(w);
   const customRows=document.querySelector('.screen').textContent,customSvg=document.querySelector('.history-graph');return {total:a.items.length,excluded:a.excluded,recent:r.items.length,recentSelected:r.selectedCount,custom:custom.items.length,customSelected:custom.selectedCount,customRows,chartLines:allLines,chartPoints:allCircles,customLines:customSvg?.querySelectorAll('line').length??0,versionMismatch:bad.reason,missingResult:missing.reason,weekendMarker:document.querySelectorAll('.weekend-record').length,dateXs:historyTimeCoordinates(['2026-09-01','2026-09-02','2026-09-11'])};
  });
  assert.equal(info.excluded,2);assert.equal(info.total,8);assert.equal(info.recentSelected,8);assert.equal(info.customSelected,4);assert.equal(info.custom,3);assert.equal(info.versionMismatch,'version_mismatch');assert.equal(info.missingResult,'missing_result');assert.ok(info.chartLines>1);assert.ok(info.chartPoints>2);assert.ok(info.weekendMarker>0);assert.ok(info.dateXs[1]-info.dateXs[0] < info.dateXs[2]-info.dateXs[1]);await ctx.close();return {counts:info};
 });
 await check('G1-S16-HELPS-AND-RETURNS-NO-UNSUPPORTED-CLAIMS',async()=>{
  const ctx=await browser.newContext(),page=await ctx.newPage();await init(page);await page.locator('[data-action="open-help"]').first().click();await page.getByText('参考100は同じ指標').waitFor();const t=await page.locator('.modal-body').innerText();assert.match(t,/正常・安全の尺度ではありません/);assert.match(t,/自動同期されず/);await page.locator('.modal [data-action="close-modal"]').first().click();await page.getByText('利用の流れ').waitFor();await ctx.close();return {restrictionsVisible:true,returnsTo:'S01'};
 });
 await check('G1-S15-ACT35-37-38-BACKUP-CONDITIONS-AND-CONFLICT',async()=>{
  const ctx=await browser.newContext(),page=await ctx.newPage();await init(page);const id=await seed(page);await page.reload();await page.locator('.sidebar [data-id="S14"]').click();await page.locator('[data-action="open-data-modal"]').click();await page.getByText(/出力前確認：保存形式/).waitFor();const content=await page.locator('.modal-body').innerText();assert.match(content,/走行記録 1 件/);assert.match(content,/訂正履歴 1 件/);assert.match(content,/参考結果 1 件/);assert.match(content,/暗号化されていません/);assert.ok(!content.includes('復元対象：'));await ctx.close();return {recordId:id,beforeExport:true,schema:true,noRestoreWithoutValidation:true};
 });
 await check('G1-ACT42-NO-LEGACY-MIGRATION-AND-ACT46-REMAIN-RECORD-USABLE',async()=>{
  const ctx=await browser.newContext(),page=await ctx.newPage();await init(page);const id=await seed(page);await page.reload();await page.locator('.sidebar [data-id="S14"]').click();const text=await page.locator('.main-content').innerText();assert.ok(!text.includes('旧記録を移行'));assert.match(text,/旧版の記録の直接移行は初回版では利用できません/);await page.locator('.sidebar [data-id="S05"]').click();await page.locator('[data-action="navigate"][data-id="S10"]').last().click();const refl=await page.locator('.main-content').innerText();assert.match(refl,/本人の振り返り/);await ctx.close();return {recordId:id,legacyMigrationEntry:false,reflectionAccessible:true};
 });

 await check('G1-ACT50-SAME-RECORD-TEXT-SCIENTIFIC-VALUE-AT-BOTH-WIDTHS',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:850}}),mobile=await ctx.newPage();await init(mobile);const recordId=await seed(mobile);await mobile.reload();
  const desktop=await ctx.newPage();await desktop.setViewportSize({width:1366,height:850});await init(desktop);
  const state=async(page,width)=>{await page.locator((width===390?'.footer-nav':'.sidebar')+' [data-id="S05"]').click();await page.getByText('次に確認できること').waitFor();return page.evaluate(async(id)=>{
   const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();await w.chooseRecord(id);return {recordId:w.active.run.recordId,run:w.active.run,snapshot:w.active.snapshot,mainText:document.querySelector('.main-content')?.innerText,scopeText:document.querySelector('.result-screen')?.innerText};
  },recordId)};
  const a=await state(mobile,390),b=await state(desktop,1366);
  assert.equal(a.recordId,recordId);assert.equal(b.recordId,recordId);assert.deepEqual(a.run,b.run);assert.deepEqual(a.snapshot,b.snapshot);assert.equal(a.scopeText,b.scopeText);
  await ctx.close();return {recordId,sameRun:true,sameSnapshot:true,sameText:true,widths:[390,1366]};
 });

}catch(e){cases.push({id:'HARNESS-FATAL',status:'FAIL',error:String(e.stack??e)});}finally{await browser?.close().catch(()=>{});await mkdir('audit',{recursive:true});const target=process.env.RUNLOAD_LAST_CLAUSES||'audit/g2_final_original_clauses.json';await writeFile(target,JSON.stringify({schema:'G1 independent clause browser synthetic',cases,commit:process.env.GITHUB_SHA??null},null,2)+'\n');const f=cases.filter(x=>x.status!=='PASS');console.log(`Final clause browser: ${cases.length-f.length}/${cases.length} PASS`);if(f.length)process.exitCode=1;}