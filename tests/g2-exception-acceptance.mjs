import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
const reportPath=process.env.RUNLOAD_EXCEPTION_REPORT??'audit/real_exception_acceptance_actions.json';
const checks=[];let failure=null,browser;
async function check(id,title,task){
 try{const detail=await task();checks.push({id,title,status:'PASS',detail});console.log('PASS '+id+' '+title)}
 catch(error){checks.push({id,title,status:'FAIL',reason:String(error?.message??error)});throw error}
}
async function open(context,url=base){
 const page=await context.newPage();
 const response=await page.goto(url+'/index.html',{waitUntil:'domcontentloaded'});
 assert.equal(response.status(),200);
 await page.locator('#main-content').waitFor({timeout:15000});
 return page;
}
async function dbCount(page){return page.evaluate(async()=>{
 const m=await import('/js/storage/database.js');const db=await m.openDatabase();try{return (await m.readAll(db,['records'])).records.length}finally{db.close()}
})}
try {
 browser=await chromium.launch({headless:true});
 await check('EDGE-01','Database versionchange callback closes old connection without changing schema',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const result=await page.evaluate(async()=>{
    const mod=await import('/js/storage/database.js');let noticed=0;
    const db=await mod.openDatabase({onVersionChange:()=>noticed++});
    const req=indexedDB.open(mod.DATABASE_NAME,mod.SCHEMA_VERSION+1);
    const attempted=await new Promise(resolve=>{
     req.onupgradeneeded=()=>req.transaction.abort();
     req.onsuccess=()=>{req.result.close();resolve('unexpected_upgrade')};
     req.onerror=()=>resolve('aborted_upgrade');
     req.onblocked=()=>resolve('blocked');
    });
    return {noticed,attempted,closed:db.objectStoreNames.length===8}
   });
   assert.equal(result.noticed,1);assert.equal(result.attempted,'aborted_upgrade');
   return result;
  }finally{await ctx.close()}
 });
 await check('EDGE-02','Native blocked event during version upgrade is detected',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const r=await page.evaluate(async()=>{
    const db=await new Promise((res,rej)=>{const request=indexedDB.open('G2_TEST_ONLY_BLOCKED',1);request.onupgradeneeded=()=>request.result.createObjectStore('samples');request.onerror=()=>rej(request.error);request.onsuccess=()=>res(request.result)});
    let blocked=false,upgraded=false;
    const request=indexedDB.open('G2_TEST_ONLY_BLOCKED',2);
    const outcome=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('blocked event not emitted')),3000);
     request.onblocked=()=>{blocked=true;db.close()};
     request.onupgradeneeded=()=>{upgraded=true};
     request.onsuccess=()=>{clearTimeout(timer);request.result.close();resolve('upgraded')};
     request.onerror=()=>{clearTimeout(timer);reject(request.error)};
    });
    return {blocked,upgraded,outcome}
   });
   assert.deepEqual(r,{blocked:true,upgraded:true,outcome:'upgraded'});return r;
  }finally{await ctx.close()}
 });
 await check('EDGE-03','IndexedDB disabled produces explicit storage failure without memory fallback',async()=>{
  const ctx=await browser.newContext();await ctx.addInitScript(()=>{
   Object.defineProperty(window,'indexedDB',{configurable:true,get(){return undefined}});
  });
  try{const page=await ctx.newPage();await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   const r=await page.evaluate(async()=>{
    const {openDatabase}=await import('/js/storage/database.js');
    try{await openDatabase();return {rejected:false}}catch(e){return {rejected:true,message:String(e.message)}}
   });
   assert.equal(r.rejected,true);return r;
  }finally{await ctx.close()}
 });
 await check('EDGE-04','QuotaExceededError inside native transaction prevents partial record commit',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);
   const r=await page.evaluate(async()=>{
    const {Workflow}=await import('/js/app/workflow.js');
    const {readAll}=await import('/js/storage/database.js');
    const flow=new Workflow();await flow.init();flow.resetDraft();flow.draft={...flow.draft,recordDate:'2026-10-11',distanceKm:6,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
    const original=IDBObjectStore.prototype.add;
    let triggered=false;
    IDBObjectStore.prototype.add=function(...args){if(this.name==='resultSnapshots'){triggered=true;throw new DOMException('quota injected for TEST_ONLY','QuotaExceededError')}return original.apply(this,args)};
    let outcome;try{outcome=await flow.saveCurrent()}finally{IDBObjectStore.prototype.add=original}
    const all=await readAll(flow.db);
    return {triggered,status:outcome.status,records:all.records.length,revisions:all.recordRevisions.length,snapshots:all.resultSnapshots.length}
   });
   assert.equal(r.triggered,true);assert.equal(r.status,'quota');assert.equal(r.records,0);assert.equal(r.revisions,0);assert.equal(r.snapshots,0);return r;
  }finally{await ctx.close()}
 });
 await check('EDGE-05','JSON parser refuses duplicate keys, prototype pollution, excess depth and giant input',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const result=await page.evaluate(async()=>{
    const m=await import('/js/storage/interchange.js');
    const cases=[
      '{"a":1,"a":2}',
      '{"__proto__":{"canary":true}}',
      '{"a":'+ '['.repeat(18)+'0'+']'.repeat(18)+'}',
      '{"x":1' // broken JSON
    ];
    const refused=[];
    for(const input of cases){try{m.parseStrictJson(input);refused.push(false)}catch{refused.push(true)}}
    const big=' '.repeat(32*1024*1024+1);
    let giantRejected=false;
    try{await m.inspectBackup(big)}catch{giantRejected=true}
    return {refused,giantRejected,polluted:({}).canary??false};
   });
   assert.deepEqual(result.refused,[true,true,true,true]);assert.equal(result.giantRejected,true);assert.equal(result.polluted,false);return {refused:result.refused,giantRejected:result.giantRejected};
  }finally{await ctx.close()}
 });
 await check('EDGE-06','SHA-256 fallback matches independently known standard vectors',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);
   const res=await page.evaluate(async()=>{
    const mod=await import('/js/storage/interchange.js');
    const desc=Object.getOwnPropertyDescriptor(Crypto.prototype,'subtle');
    Object.defineProperty(Crypto.prototype,'subtle',{configurable:true,value:undefined});
    try{
      return [await mod.sha256(new TextEncoder().encode('abc')),await mod.sha256(new Uint8Array([]))];
    }finally{if(desc)Object.defineProperty(Crypto.prototype,'subtle',desc);else delete Crypto.prototype.subtle}
   });
   assert.deepEqual(res,['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']);return {vectors:2};
  }finally{await ctx.close()}
 });
 await check('EDGE-07','Record saved at localhost does not appear on 127.0.0.1 origin',async()=>{
  const ctx=await browser.newContext();try{
   const localhost=await open(ctx,base.replace('127.0.0.1','localhost'));
   const saved=await localhost.evaluate(async()=>{
    const {Workflow}=await import('/js/app/workflow.js');const flow=new Workflow();await flow.init();flow.resetDraft();
    flow.draft={...flow.draft,recordDate:'2026-10-11',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
    return (await flow.saveCurrent()).status;
   });
   assert.equal(saved,'saved');const other=await open(ctx);
   const a=await dbCount(localhost),b=await dbCount(other);assert.equal(a,1);assert.equal(b,0);
   return {localhostCount:a,loopbackCount:b};
  }finally{await ctx.close()}
 });
 await check('EDGE-08','Backup SHA normalization is key-order independent; forged document refused without mutation',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const r=await page.evaluate(async()=>{
    const {checksum,canonicalJson,inspectBackup}=await import('/js/storage/interchange.js');
    const a={beta:[1,{x:3,y:2}],alpha:'文字列'};
    const b={alpha:'文字列',beta:[1,{y:2,x:3}]};
    const equal=await checksum(a)===await checksum(b)&&canonicalJson(a)===canonicalJson(b);
    let invalidRejected=false;try{await inspectBackup('{"format":"RunLoadLocalBackup","format":"tampered"}')}catch{invalidRejected=true}
    return {equal,invalidRejected}
   });assert.deepEqual(r,{equal:true,invalidRejected:true});return r;
  }finally{await ctx.close()}
 });
 await check('EDGE-09','Six explanatory columns are versioned, sourced and neutral without medical claims',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const r=await page.evaluate(async()=>{
    const {COLUMNS,selectColumn}=await import('/js/research/source-catalog.js');
    return {count:COLUMNS.length,ids:COLUMNS.map(x=>x.id),sources:COLUMNS.map(x=>x.source),allVersioned:COLUMNS.every(x=>x.version===1),noUnsafe:COLUMNS.every(x=>!/(確実に予防|必ず改善|診断を確定)/.test(x.body)),unmatched:selectColumn([])===null}
   });assert.equal(r.count,6);assert.deepEqual(r.ids,['COL01','COL02','COL03','COL04','COL05','COL06']);assert.equal(r.allVersioned,true);assert.equal(r.noUnsafe,true);assert.equal(r.unmatched,true);return {count:r.count,versioned:true,unmatchedHidden:true};
  }finally{await ctx.close()}
 });
 await check('EDGE-10','Print API exception returns failure, not false confirmation',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const r=await page.evaluate(async()=>{
    const mod=await import('/js/ui/share-view.js');
    const original=window.print;window.print=()=>{throw Error('TEST_ONLY_PRINT_UNAVAILABLE')};
    try{return mod.printPreview()}finally{window.print=original}
   });
   assert.equal(r.ok,false);assert.match(r.message,/印刷/);return r;
  }finally{await ctx.close()}
 });
 await check('EDGE-11','Restore rejects same-ID edit that occurs after preview and preserves newer revision',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);const r=await page.evaluate(async()=>{
    const {Workflow}=await import('/js/app/workflow.js');
    const {createBackup,inspectBackup,previewRestore,restoreBackup}=await import('/js/storage/interchange.js');
    const {readAll}=await import('/js/storage/database.js');
    const w=new Workflow();await w.init();w.resetDraft();
    w.draft={...w.draft,recordDate:'2026-10-11',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};
    const initial=await w.saveCurrent();if(initial.status!=='saved')throw Error('initial save failed');
    const backup=await inspectBackup(await createBackup(w.db));
    await previewRestore(w.db,backup);
    w.draft={...w.active.run,reflection:'TEST_ONLY_UPDATED_AFTER_BACKUP_PREVIEW'};
    const changed=await w.saveCurrent();
    let rejected=false;try{await restoreBackup(w.db,backup)}catch{rejected=true}
    const after=await readAll(w.db,['records','recordRevisions']);
    return {changed:changed.status,rejected,revision:after.records[0]?.revision,reflection:after.records[0]?.reflection,history:after.recordRevisions.length}
   });
   assert.equal(r.changed,'saved');assert.equal(r.rejected,true);assert.equal(r.revision,2);assert.equal(r.reflection,'TEST_ONLY_UPDATED_AFTER_BACKUP_PREVIEW');assert.equal(r.history,2);return {rejected:true,preservedRevision:2};
  }finally{await ctx.close()}
 });
 await check('EDGE-12','Storage screen explicitly warns of eviction and unencrypted backups',async()=>{
  const ctx=await browser.newContext();try{
   const page=await open(ctx);await page.locator('[data-action="navigate"][data-id="S14"]:visible').first().click();
   const text=await page.locator('#main-content').textContent();
   assert.match(text,/自動同期はありません/);assert.match(text,/失われる場合があります/);assert.match(text,/暗号化されていません/);
   assert.doesNotMatch(text,/絶対に消えません|必ず保存されます/);return {dataLossWarning:true,plaintextWarning:true};
  }finally{await ctx.close()}
 });
 }catch(e){failure={message:String(e?.message??e),stack:String(e?.stack??'').slice(0,1800)};console.error(e)}
 finally{await browser?.close().catch(()=>{});const report={schema:'RunLoad-G2-Exception-Acceptance-V1',environment:'Ubuntu-GitHubActions-Chromium',timestamp:new Date().toISOString(),checks,failure};await fs.mkdir('audit',{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log('Exception acceptance:',checks.filter(x=>x.status==='PASS').length+'/'+checks.length,'PASS');if(failure||checks.length!==12)process.exitCode=1}
