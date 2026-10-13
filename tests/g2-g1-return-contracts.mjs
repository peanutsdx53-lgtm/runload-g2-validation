/** Real-origin Chromium checks of ten previously mismatched G1 return contracts.
 * Every PASS is scoped to the observed return path; other G1 branches are not auto-promoted.
 * Synthetic data only, isolated contexts, no external services or legacy writes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const url=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
const checks=[]; let browser;let failure=null;
const h=p=>p.locator('.main-content h1');
async function run(branchId,description,test){
 let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const response=await page.goto(url+'/index.html',{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await h(page).waitFor();
  const detail=await test(page,context);
  checks.push({id:`RETURN-${branchId}`,branch_id:`${branchId}#B02`,description,status:'PASS',detail});
  console.log(`PASS RETURN-${branchId}`);
 }catch(e){
  checks.push({id:`RETURN-${branchId}`,branch_id:`${branchId}#B02`,description,status:'FAIL',reason:String(e.stack??e)});
  throw e;
 }finally{await context?.close().catch(()=>{});}
}
async function seed(page,mix='run'){
 const saved=await page.evaluate(async mix=>{
  const {Workflow}=await import('/js/app/workflow.js');
  const w=new Workflow(); await w.init(); w.resetDraft();
  w.draft={...w.draft,recordDate:'2026-10-12',distanceKm:6,durationSeconds:1800,runningMix:mix,speedPattern:'stable',elapsedTimeBasis:'moving',distanceConfidence:'measured',recordSource:'manual'};
  return w.saveCurrent();
 },mix);
 assert.equal(saved.status,'saved');
 await page.reload({waitUntil:'domcontentloaded'}); await h(page).waitFor();
 await page.locator('[data-action="open-record"]').first().click();
 await h(page).filter({hasText:'結果'}).waitFor();
}
async function nav(page,id){
 if(['S10','S14'].includes(id)){
  await page.locator('.footer-nav [data-action="open-more"]').click();
  await page.locator(`#more-navigation [data-action="navigate"][data-id="${id}"]`).click();
 }else{
  await page.locator(`.footer-nav [data-action="navigate"][data-id="${id}"]`).click();
 }
 const title={'S01':'ホーム','S02':'記録','S05':'結果','S07':'履歴','S10':'振り返り','S14':'データ管理'}[id];
 await h(page).filter({hasText:title}).waitFor();
}
async function region(page){await page.locator('[data-action="open-region"]').first().click();await page.locator('#modal-title').filter({hasText:'部位の詳細'}).waitFor();}
async function close(page){await page.locator('[data-action="close-modal"]').first().click()}
async function modal(page,text){await page.locator('#modal-title').filter({hasText:text}).waitFor();}
try{
 browser=await chromium.launch({headless:true});
 await run('F03','S02/S05 navigation restores the source running-condition screen',async page=>{
  await nav(page,'S02');const before=await h(page).textContent();
  await nav(page,'S05');await page.goBack({waitUntil:'domcontentloaded'});
  await h(page).filter({hasText:'記録'}).waitFor();
  assert.equal(await h(page).textContent(),before);
  return {from:'S02',via:'S05',restored:'S02'};
 });
 await run('F07','Source and reference explanation nested in S06 returns to S06',async page=>{
  await seed(page); await region(page);
  await page.locator('.modal [data-action="open-column"]').first().click();await modal(page,'参考情報の説明');
  await close(page);await modal(page,'部位の詳細');
  return {from:'S06',nested:'S08',restored:'S06'};
 });
 await run('F09','Interpretation navigation S05/S10 returns to the original result screen',async page=>{
  await seed(page);await nav(page,'S10');
  await page.goBack({waitUntil:'domcontentloaded'});await h(page).filter({hasText:'結果'}).waitFor();
  return {from:'S05',via:'S10',restored:'S05'};
 });
 await run('F11','Article explanation returns to selected region and original record without changing selection',async page=>{
  await seed(page);const before=await page.locator('.screen-header small').textContent();
  await region(page);await page.locator('.modal [data-action="open-column"]').first().click();await modal(page,'参考情報の説明');
  await close(page);await modal(page,'部位の詳細');await close(page);
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  assert.equal(await page.locator('.screen-header small').textContent(),before);
  return {recordPreserved:before,nestedReturn:'S06',parentReturn:'S05'};
 });
 await run('F12','Virtual speed comparison closes to S06 then S05',async page=>{
  await seed(page);await region(page);
  await page.locator('.modal [data-action="open-simulation"]').click();await modal(page,'仮想速度の比較');
  await close(page);await modal(page,'部位の詳細');await close(page);
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  await h(page).filter({hasText:'結果'}).waitFor();
  return {route:['S05','S06','S09','S06','S05']};
 });
 await run('F19','Visiting new-app views never reads/modifies a pre-existing legacy store; returns prior screen',async page=>{
  const sentinel=await page.evaluate(()=>{localStorage.setItem('runload_old_user_records','LEGACY_SENTINEL_DO_NOT_READ');return localStorage.getItem('runload_old_user_records')});
  assert.equal(sentinel,'LEGACY_SENTINEL_DO_NOT_READ');
  await nav(page,'S14');await page.locator('[data-action="open-data-modal"]').click();await modal(page,'バックアップ・復元・削除');
  await close(page);await h(page).filter({hasText:'データ管理'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('runload_old_user_records')),sentinel);
  const db=await page.evaluate(async()=>{const x=await import('/js/storage/database.js');return x.DATABASE_NAME});
  assert.equal(db,'runload_new_beginner_g1_v1');
  return {legacyKeyUntouched:true,newDatabaseOnly:db,returned:'S14',scope:'no legacy read instrumentation'};
 });
 await run('F20','Help can close to S01; core record operation remains usable',async page=>{
  await page.locator('[data-action="open-help"]').click();await modal(page,'利用方法と用語');
  await close(page);await h(page).filter({hasText:'ホーム'}).waitFor();
  await page.locator('[data-action="new-record"]').first().click();await h(page).filter({hasText:'記録'}).waitFor();
  return {from:'S01',via:'S16',homeRestored:true,canStartRecord:true};
 });
 await run('F21','Unavailable-reference result can navigate to reflection then return',async page=>{
  await seed(page,'mixed');await nav(page,'S10');await h(page).filter({hasText:'振り返り'}).waitFor();
  await page.goBack({waitUntil:'domcontentloaded'});await h(page).filter({hasText:'結果'}).waitFor();
  return {mixedRun:true,from:'S05',via:'S10',restored:'S05'};
 });
 await run('F23','Data/privacy explanation returns via S15 to S14 and back to S01',async page=>{
  await nav(page,'S14');
  assert.match(await page.locator('.main-content').textContent(),/自動同期はありません/);
  await page.locator('[data-action="open-data-modal"]').click();await modal(page,'バックアップ・復元・削除');
  await close(page);await h(page).filter({hasText:'データ管理'}).waitFor();
  await page.goBack({waitUntil:'domcontentloaded'});await h(page).filter({hasText:'ホーム'}).waitFor();
  return {privacyMessage:true,route:['S01','S14','S15','S14','S01']};
 });
 await run('F24','Terms/source help returns to exact parent screens without fabricating a new page',async page=>{
  await page.locator('[data-action="open-help"]').click();await modal(page,'利用方法と用語');
  assert.match(await page.locator('.modal-body').textContent(),/A1.*A2.*B/);
  await close(page);await h(page).filter({hasText:'ホーム'}).waitFor();
  await seed(page);await region(page);await page.locator('.modal [data-action="open-column"]').first().click();await modal(page,'参考情報の説明');
  await close(page);await modal(page,'部位の詳細');await close(page);await h(page).filter({hasText:'結果'}).waitFor();
  return {terminology:'S16',sourceExplanation:'S08',return:['S01','S06','S05']};
 });
}catch(e){failure=String(e.stack??e);console.error(failure)}finally{
 await browser?.close().catch(()=>{});
 const report={schema:'RunLoad-G2-G1-Return-Scoped-Acceptance-V1',runAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??null,checks,failure,scope:'Each check proves only observed route(s), not complete Fxx acceptance.'};
 await fs.mkdir('audit',{recursive:true});await fs.writeFile('audit/g1_return_contracts_actions.json',JSON.stringify(report,null,2)+'\n');
 console.log(`G1 return contracts: ${checks.filter(x=>x.status==='PASS').length}/${checks.length} PASS`);
 if(failure||checks.length!==10)process.exitCode=1;
}