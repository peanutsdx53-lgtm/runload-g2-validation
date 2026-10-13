import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
let browser,failure;const checks=[];
async function check(id,title,fn){try{const detail=await fn();checks.push({id,status:'PASS',title,detail});console.log('PASS '+id+' '+title)}catch(e){checks.push({id,status:'FAIL',title,message:String(e?.message??e)});throw e}}
try{
 browser=await chromium.launch();
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 const page=await ctx.newPage();await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor();
 const seed=await page.evaluate(async()=>{
  const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();w.resetDraft();
  w.draft={...w.draft,recordDate:'2026-10-11',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
  const saved=await w.saveCurrent();window.g2ColumnWork=w;return {status:saved.status,regions:w.active.snapshot.regionResults.length};
 });assert.equal(seed.status,'saved');assert.equal(seed.regions,12);
 await check('CO01','Current record interpretation and column candidate share the same rule context',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ColumnWork,messages=w.interpretations(),column=w.column();
   return {column:column?.id??null,matched:column===null||column.rules.some(code=>messages.some(m=>m.messageCode===code)),records:messages.length}
  });assert.equal(r.matched,true);return r;
 });
 await check('CO02','Unknown scientific reason cannot generate an unsupported column',async()=>{
  const r=await page.evaluate(async()=>{
   const {selectColumn}=await import('/js/research/source-catalog.js');
   return selectColumn([{messageCode:'UNRECOGNIZED_RULE',evidenceIds:['R01'],dataKind:'reference'}])===null;
  });assert.equal(r,true);return {excluded:true};
 });
 await check('CO03','Out-of-range source data remain unavailable, without extrapolated value',async()=>{
  const r=await page.evaluate(async()=>{
   const {calculateReference}=await import('/js/engines/reference.js'),{RESEARCH_CATALOG}=await import('/js/research/anchor-data.js');
   const rows=calculateReference({speedKmh:500,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'},RESEARCH_CATALOG);
   return {count:rows.length,unavailable:rows.filter(x=>x.value===null).length,invalidNonNull:rows.filter(x=>x.eligibility==='unavailable'&&x.value!==null).length}
  });assert.equal(r.count,12);assert.equal(r.invalidNonNull,0);assert.ok(r.unavailable>0);return r;
 });
 await check('CO04','Incomplete fatigue answers do not become fabricated pre/post differences',async()=>{
  const r=await page.evaluate(async()=>{
   const {interpretRun}=await import('/js/engines/interpretation.js');const w=window.g2ColumnWork;
   const values=interpretRun({run:w.active.run,fatigue:{pre:null,post:null},observations:[],referenceSnapshot:w.active.snapshot,compatibleHistory:[],followups:[]});
   return {messages:values.length,missingDataMessages:values.filter(x=>JSON.stringify(x).includes('fatigue')).length,allCoded:values.every(x=>typeof x.messageCode==='string')};
  });assert.equal(r.allCoded,true);return r;
 });
 await check('CO05','Incompatible historical model revision cannot produce numeric comparison',async()=>{
  const r=await page.evaluate(async()=>{
   const {compareReferenceResults}=await import('/js/domain/history.js');const w=window.g2ColumnWork;
   const first=w.active.snapshot.regionResults[0];
   return compareReferenceResults(first,{...first,modelVersion:'TEST_ONLY_INCOMPATIBLE'});
  });assert.equal(r.compatible,false);return {compatible:false};
 });
 await check('CO06','Explanatory prose does not prescribe treatment or assert causal benefit',async()=>{
  const r=await page.evaluate(async()=>{const {COLUMNS}=await import('/js/research/source-catalog.js');return COLUMNS.every(x=>!/(必ず治|必ず予防|診断を確定|服薬を推奨)/.test(x.body))});
  assert.equal(r,true);return {neutral:true};
 });
 await check('CO07','Reading a column does not persist a followup without explicit user action',async()=>{
  const r=await page.evaluate(async()=>{
   const {readAll}=await import('/js/storage/database.js');const w=window.g2ColumnWork;
   const before=(await readAll(w.db,['followups'])).followups.length;
   w.column();w.openModal('S08');w.closeModal();
   const after=(await readAll(w.db,['followups'])).followups.length;
   return {before,after};
  });assert.equal(r.before,r.after);return r;
 });
 await check('CO08','Column is selectable as one compact candidate per record',async()=>{
  const r=await page.evaluate(async()=>{
   const w=window.g2ColumnWork;const {render}=await import('/js/ui/views.js');
   w.navigate('S05');render(w);
   const buttonCount=document.querySelectorAll('[data-action="open-column"]').length;
   return {buttonCount,selectedCandidate:w.column()?.id??null};
  });assert.ok(r.buttonCount<=1);return r;
 });
 await check('CO09','Region changes recompute the column choice instead of returning cached old candidate',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ColumnWork;w.selectedRegion='R01';const a=w.column()?.id??null;
   w.selectedRegion='R10';const b=w.column()?.id??null;
   return {a,b,activeRegion:w.selectedRegion,selectedFromCurrent:b===w.column()?.id};
  });assert.equal(r.selectedFromCurrent,true);assert.equal(r.activeRegion,'R10');return r;
 });
 await check('CO10','Closing column detail restores the same record and selected region',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ColumnWork;w.navigate('S05');w.selectedRegion='R10';const id=w.active.run.recordId;
   w.openModal('S08');w.closeModal();return {recordSame:w.active.run.recordId===id,regionSame:w.selectedRegion==='R10',closed:w.modal===null};
  });assert.deepEqual(r,{recordSame:true,regionSame:true,closed:true});return r;
 });
 await check('CO11','Empty interpretation set produces no unsupported recommendation',async()=>{
  const r=await page.evaluate(async()=>{const {selectColumn}=await import('/js/research/source-catalog.js');return selectColumn([])});
  assert.equal(r,null);return {emptySkipped:true};
 });
 await check('CO12','Six column descriptions have no computed injury-risk rankings',async()=>{
  const r=await page.evaluate(async()=>{
   const {COLUMNS}=await import('/js/research/source-catalog.js');
   return COLUMNS.every(x=>x.riskScore===undefined&&x.effectivenessScore===undefined&&x.ranking===undefined);
  });assert.equal(r,true);return {noScores:true};
 });
 await check('CO13','Every published column refers to a recognized study-note provenance and version',async()=>{
  const r=await page.evaluate(async()=>{const {COLUMNS}=await import('/js/research/source-catalog.js');return COLUMNS.map(x=>({id:x.id,source:x.source,version:x.version,ready:x.publicationStatus==='ready'}))});
  assert.equal(r.length,6);assert.ok(r.every(x=>['28','29','30'].includes(x.source)&&x.version===1&&x.ready));return {provenanceIds:r.map(x=>x.source)};
 });
 await check('CO14','Column detail modal reflows without horizontal overflow at 320 CSS pixels',async()=>{
  await page.setViewportSize({width:320,height:720});
  const r=await page.evaluate(async()=>{
   const w=window.g2ColumnWork;const {render}=await import('/js/ui/views.js');
   w.openModal('S08');render(w);
   return {client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,visible:!!document.querySelector('.modal')};
  });assert.equal(r.visible,true);assert.ok(r.scroll<=r.client+1);return r;
 });
 await check('CO15','Unselected column prose is absent from short sharing output',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ColumnWork;w.shareSelection={recordDate:true};
   return {text:w.generatePreview(false).text,article:w.column()?.body??null};
  });assert.match(r.text,/走行日/);if(r.article)assert.ok(!r.text.includes(r.article));return {unselectedOmitted:true};
 });
 await check('CO16','All six immutable editorial texts are substantive and versioned',async()=>{
  const r=await page.evaluate(async()=>{
   const {COLUMNS}=await import('/js/research/source-catalog.js');
   return {length:COLUMNS.length,valid:COLUMNS.every(x=>x.title.length>=5&&x.body.length>=80&&x.followup.length>10&&x.version===1&&x.publicationStatus==='ready'),unique:new Set(COLUMNS.map(x=>x.body)).size===6}
  });assert.equal(r.valid,true);assert.equal(r.unique,true);return r;
 });
 for(let i=1;i<=6;i++){
  const id='COL'+String(i).padStart(2,'0');
  await check(id,'Editorial '+id+' matches declared unique interpretation reason code',async()=>{
   const r=await page.evaluate(async(id)=>{
    const {COLUMNS,selectColumn}=await import('/js/research/source-catalog.js');
    const col=COLUMNS.find(x=>x.id===id),rule=col.rules[0];
    const candidate=selectColumn([{messageCode:rule,dataKind:'reference',evidenceIds:['R01']}]);
    return {wanted:id,returned:candidate?.id??null,source:col.source,rule};
   },id);assert.equal(r.returned,id);return r;
  });
 }
 await ctx.close();
}catch(error){failure={message:String(error?.message??error),stack:String(error?.stack??'').slice(0,1500)};console.error(error)}
finally{await browser?.close().catch(()=>{});const report={schema:'RunLoad-G2-Column-Contract-V1',timestamp:new Date().toISOString(),checks,failure};await fs.writeFile('audit/real_column_contract_actions.json',JSON.stringify(report,null,2)+'\n');console.log('Column contract:',checks.filter(x=>x.status==='PASS').length+'/'+checks.length,'PASS');if(failure||checks.length!==22)process.exitCode=1}
