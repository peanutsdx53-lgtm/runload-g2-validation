import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173',results=[];let browser,failure;
async function check(id,title,fn){try{const detail=await fn();results.push({id,status:'PASS',title,detail});console.log('PASS '+id+' '+title)}catch(e){results.push({id,status:'FAIL',title,message:String(e?.message??e)});throw e}}
async function visit(ctx){const page=await ctx.newPage();const res=await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(res.status(),200);await page.locator('#main-content').waitFor();return page}
try{
 browser=await chromium.launch();
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await visit(ctx);
 await check('SH01','All share fields unchecked prevent preview creation',async()=>{
  const r=await page.evaluate(async()=>{
   const {Workflow}=await import('/js/app/workflow.js');const w=new Workflow();await w.init();w.resetDraft();await w.observePre(5);w.observePost(6);
   w.draft={...w.draft,recordDate:'2026-10-11',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
   const saved=await w.saveCurrent([{regionId:'R01',side:'left',note:'<img src=x onerror=window.XSS=1> KEEP_PRIVATE',source:'user_observation',recordedAt:new Date().toISOString()}],'PRIVATE_FOLLOWUP');
   window.g2ShareWork=w;
   let reject=false;try{w.generatePreview(false)}catch{reject=true}
   return {status:saved.status,reject,revision:w.active.run.revision}
  });
  assert.equal(r.status,'saved');assert.equal(r.reject,true);return r;
 });
 await check('SH02','Short and report share only distance and duration from same source',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ShareWork;w.shareSelection={distanceKm:true,durationSeconds:true};
   const short=w.generatePreview(false).text,report=w.generatePreview(true).text;
   return {short,report};
  });
  for(const t of [r.short,r.report]){assert.match(t,/距離：5 km/);assert.match(t,/所要時間：30 分/);assert.doesNotMatch(t,/KEEP_PRIVATE|PRIVATE_FOLLOWUP|ROF-J|平均ペース/)}
  return {factsOnly:true,consistent:true};
 });
 await check('SH03','Body observation share omits unselected PRE and POST fatigue values',async()=>{
  const result=await page.evaluate(()=>{
   const w=window.g2ShareWork;w.shareSelection={'observation_'+w.active.bodyObservations[0].observationId:true};
   return w.generatePreview(false).text;
  });
  assert.match(result,/KEEP_PRIVATE/);assert.doesNotMatch(result,/ROF-J|PRIVATE_FOLLOWUP/);return {unselectedFatigueExcluded:true};
 });
 await check('SH04','A1 A2 B method attribution and reference limits survive sharing',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ShareWork;w.shareSelection={region_R01:true,region_R02:true,region_R10:true};
   const data=w.generatePreview(true).text;
   return {data,methods:w.active.snapshot.regionResults.filter(x=>['R01','R02','R10'].includes(x.regionId)).map(x=>x.method)};
  });
  assert.deepEqual([...r.methods].sort(),['A1','A2','B']);assert.match(r.data,/出典：/);assert.match(r.data,/正常値・安全性/);return {methods:r.methods,sourcePresent:true};
 });
 await check('SH05','Missing source-range value does not become fabricated zero or 100',async()=>{
  const r=await page.evaluate(()=>{
   const w=window.g2ShareWork;w.shareSelection={region_R05:true};
   const source=w.active.snapshot.regionResults.find(x=>x.regionId==='R05');
   return {value:source.value,share:w.generatePreview(false).text};
  });
  assert.equal(r.value,null);assert.match(r.share,/算出不可/);assert.doesNotMatch(r.share,/R05：.*0/);return {unavailableHandled:true};
 });
 await check('SH06','Incompatible historical reference is never shown as numeric delta',async()=>{
  const r=await page.evaluate(()=>{
   const {buildShareData,formatShare}=window.g2ShareFixture??{};return null;
  });
  const value=await page.evaluate(async()=>{
   const {buildShareData,formatShare}=await import('/js/domain/sharing.js');const w=window.g2ShareWork;
   const history=[{run:{recordId:'TEST_ONLY_PRIOR',recordDate:'2026-10-10'},snapshot:{regionResults:w.active.snapshot.regionResults.map(x=>({...x,modelVersion:'incompatible'}))}}];
   const data=buildShareData({run:w.active.run,referenceSnapshot:w.active.snapshot,history,selection:{region_R01:true,history_TEST_ONLY_PRIOR:true}});
   return formatShare(data);
  });
  assert.match(value,/直接比較はできません/);assert.doesNotMatch(value,/同じ指標の参考比の差/);return {incompatibleHistoryBlocked:true};
 });
 await check('SH07','Stale preview rejected immediately after record revision',async()=>{
  const r=await page.evaluate(async()=>{
   const w=window.g2ShareWork;w.shareSelection={recordDate:true};w.generatePreview(false);
   w.draft={...w.active.run,reflection:'SH07_TEST_ONLY_CHANGED'};const changed=await w.saveCurrent();
   return {status:changed.status,valid:await w.validateSharePreview(),revision:w.active.run.revision};
  });assert.equal(r.status,'saved');assert.equal(r.revision,2);assert.equal(r.valid,false);return r;
 });
 await check('SH08','Rejected clipboard operation never reports success',async()=>{
  const result=await page.evaluate(async()=>{
   const m=await import('/js/ui/share-view.js');
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('deny')}}});
   const r=await m.copyPreview('ONLY_TEST_STRING');return r;
  });assert.equal(result.ok,false);assert.match(result.message,/コピーできません/);return result;
 });
 await check('SH09','Browser without print API reports failure without losing preview',async()=>{
  const r=await page.evaluate(async()=>{
   const mod=await import('/js/ui/share-view.js');const w=window.g2ShareWork;
   w.shareSelection={recordDate:true};const text=w.generatePreview(true).text;
   const old=window.print;window.print=()=>{throw Error('no printer')};
   const result=mod.printPreview();window.print=old;
   return {result,textStill: w.preview.text===text}
  });assert.equal(r.result.ok,false);assert.equal(r.textStill,true);return r;
 });
 await check('SH10','Long report remains printable on A4 with no unselected personal notes',async()=>{
  await page.evaluate(async()=>{
   const {render}=await import('/js/ui/views.js');const w=window.g2ShareWork;
   w.shareSelection={recordDate:true,distanceKm:true,durationSeconds:true};w.shareQuestion='';w.generatePreview(true);w.openModal('S13');render(w);
  });
  await page.emulateMedia({media:'print'});const pdf=await page.pdf({format:'A4',printBackground:true});
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>3000);
  const details=await page.evaluate(()=>({pageScroll:document.documentElement.scrollWidth,viewWidth:innerWidth,hasUnselected:(document.querySelector('.modal')?.textContent??'').includes('KEEP_PRIVATE')}));
  assert.equal(details.hasUnselected,false);return {pdfBytes:pdf.length,unselectedExcluded:true};
 });
 await check('SH11','HTML-shaped user text is printed as literal text rather than executed DOM',async()=>{
  const result=await page.evaluate(async()=>{
   const {render}=await import('/js/ui/views.js');const w=window.g2ShareWork;w.closeModal();
   w.shareSelection={'observation_'+w.active.bodyObservations[0].observationId:true};w.generatePreview(true);w.openModal('S13');render(w);
   return {literal:document.body.textContent.includes('<img src=x onerror=window.XSS=1>'),images:[...document.querySelectorAll('img')].filter(x=>x.getAttribute('src')==='x').length,executed:window.XSS===1};
  });
  assert.equal(result.literal,true);assert.equal(result.images,0);assert.equal(result.executed,false);return result;
 });
 await check('SH12','Two-run core workflow works with no sharing use and leaves no share preview history',async()=>{
  const isolated=await browser.newContext();try{
   const fresh=await visit(isolated);const result=await fresh.evaluate(async()=>{
    const {Workflow}=await import('/js/app/workflow.js');const {readAll}=await import('/js/storage/database.js');
    const w=new Workflow();await w.init();const saved=[];
    for(let i=0;i<2;i++){
      w.resetDraft();w.active=null;
      w.draft={...w.draft,recordDate:i?'2026-10-12':'2026-10-11',distanceKm:5+i,durationSeconds:1800+i*120,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
      saved.push(await w.saveCurrent());
    }
    const all=await readAll(w.db);return {saved:saved.map(x=>x.status),records:all.records.length,snapshots:all.resultSnapshots.length,previews:w.preview===null}
   });assert.deepEqual(result.saved,['saved','saved']);assert.equal(result.records,2);assert.equal(result.snapshots,2);assert.equal(result.previews,true);return result;
  }finally{await isolated.close()}
 });
 await ctx.close();
}catch(e){failure={message:String(e?.message??e),stack:String(e?.stack??'').slice(0,1600)};console.error(e)}
finally{await browser?.close().catch(()=>{});const report={schema:'RunLoad-G2-Sharing-Contract-V1',timestamp:new Date().toISOString(),checks:results,failure};await fs.writeFile('audit/real_sharing_contract_actions.json',JSON.stringify(report,null,2)+'\n');console.log('Sharing contract:',results.filter(x=>x.status==='PASS').length+'/'+results.length,'PASS');if(failure||results.length!==12)process.exitCode=1}
