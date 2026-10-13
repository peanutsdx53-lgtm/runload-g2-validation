/** Additional independent G1-DB01/DB09 real Chromium checks.
 * Desktop and mobile emulation are evidence only; physical smartphone verification is NOT claimed. */
import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const base=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const origin2='http://127.0.0.1:4174';
const root=await mkdtemp(path.join(os.tmpdir(),'g2-db01-'));
const results=[];let context,server;
async function check(id,fn){try{const observed=await fn();results.push({id,status:'PASS',observed});console.log('PASS '+id);}
catch(e){results.push({id,status:'FAIL',error:String(e.stack||e)});throw e;}}
async function read(page){return page.evaluate(async()=>{const {openDatabase,readAll}=await import('/js/storage/database.js');const db=await openDatabase();try{return await readAll(db);}finally{db.close();}});}
async function open(url){const page=await context.newPage();const r=await page.goto(url+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(r.status(),200);await page.locator('#app').waitFor();return page;}
let saved;
try{
 context=await chromium.launchPersistentContext(root,{headless:true,viewport:{width:1366,height:800}});
 await check('DB01-C01-persist-native-record',async()=>{const page=await open(base);saved=await page.evaluate(async()=>{const {Workflow}=await import('/js/app/workflow.js');const f=new Workflow();await f.init();f.resetDraft();f.draft={...f.draft,recordDate:'2026-10-11',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'};return await f.saveCurrent();});assert.equal(saved.status,'saved');const data=await read(page);const row=data.records.find(x=>x.recordId===saved.recordId);assert.equal(row.revision,saved.revision);await page.close();return {recordId:saved.recordId,revision:saved.revision};});
 await context.close();context=null;
 context=await chromium.launchPersistentContext(root,{headless:true,viewport:{width:1366,height:800}});
 await check('DB01-C02-persist-browser-process-restart',async()=>{const page=await open(base);const data=await read(page);const row=data.records.find(x=>x.recordId===saved.recordId);assert.equal(row?.revision,saved.revision);assert.equal(row?.distanceKm,5);await page.close();return {recordId:row.recordId,revision:row.revision,distanceKm:row.distanceKm};});
 server=spawn('python3',['-m','http.server','4174','--bind','127.0.0.1','--directory','.'],{cwd:process.cwd(),stdio:'ignore'});
 let ready=false;for(let i=0;i<35;i++){try{const r=await fetch(origin2+'/index.html');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true,'second-origin local server unavailable');
 await check('DB09-C01-distinct-origin-isolation',async()=>{const page=await open(origin2);const data=await read(page);assert.equal(data.records.some(x=>x.recordId===saved.recordId),false);await page.getByText(/自動同期されません/).first().waitFor(); assert.match(await page.locator('#app').innerText(),/自動同期されません/);await page.close();return {differentOrigin:origin2,recordShared:false,autoSyncWarning:true};});
 await check('DB09-C02-mobile-device-emulation-warning',async()=>{const mobile=await chromium.launch({headless:true});try{const mobileCtx=await mobile.newContext({...devices['iPhone 13'],hasTouch:true});const page=await mobileCtx.newPage();const r=await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(r.status(),200);await page.getByText(/自動同期されません/).first().waitFor(); assert.match(await page.locator('#app').innerText(),/自動同期されません/);const d=await read(page);assert.equal(d.records.some(x=>x.recordId===saved.recordId),false);return {emulated:true,recordShared:false,deviceType:'iPhone 13 emulation'};}finally{await mobile.close();}});
}catch(e){console.error(e.stack||e);process.exitCode=1;}finally{try{await context?.close();}catch{}try{server?.kill();}catch{}await rm(root,{recursive:true,force:true});await mkdir('audit',{recursive:true});await writeFile(process.env.G2_DB01_DB09_REPORT||'audit/g2_final_native_restart_isolation.json',JSON.stringify({schema:'G2-G1-DB01-DB09-Material-Technical-Evidence',actualBrowser:'Chromium',limits:['mobile emulation is not a physical mobile device'],results},null,2)+'\n');if(results.length!==4||results.some(x=>x.status!=='PASS'))process.exitCode=1;}