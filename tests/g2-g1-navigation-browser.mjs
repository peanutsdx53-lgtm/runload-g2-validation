/** TEST_ONLY: actual-browser G1 main navigation/back, mobile More first-level destinations. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
let browser,fail=null;const checks=[];
const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
async function check(id,fn){try{const observed=await fn();checks.push({id,status:'PASS',observed});console.log('PASS '+id)}catch(e){checks.push({id,status:'FAIL',reason:String(e.stack??e)});throw e}}
try{
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor();
 const title=()=>page.locator('.main-content h1');
 await check('NAV-01 mobile Other exposes both first-level main screens',async()=>{
  await page.locator('[data-action="open-more"]').click();
  assert.equal(await page.locator('#more-navigation [data-id="S10"]').count(),1);
  assert.equal(await page.locator('#more-navigation [data-id="S14"]').count(),1);
  await page.locator('#more-navigation [data-id="S10"]').click();
  await title().filter({hasText:'振り返り'}).waitFor();
  assert.equal(await page.locator('.more-panel').count(),0);
  await page.locator('[data-action="open-more"]').click();
  await page.locator('#more-navigation [data-id="S14"]').click();
  await title().filter({hasText:'データ管理'}).waitFor();return {destinations:['S10','S14']};
 });
 await check('NAV-02 browser Back restores prior main screen without abandoning origin',async()=>{
  await page.locator('.footer-nav [data-id="S02"]').click();await title().filter({hasText:'記録'}).waitFor();
  await page.goBack({waitUntil:'domcontentloaded'});
  await title().filter({hasText:'データ管理'}).waitFor();
  assert.ok(page.url().startsWith(base));return {returned:'S14'};
 });
 await check('NAV-03 browser Back dismisses optional help without altering active screen',async()=>{
  await page.locator('.footer-nav [data-id="S01"]').click();await title().filter({hasText:'ホーム'}).waitFor();
  await page.locator('[data-action="open-help"]').click();await page.locator('[role="dialog"]').waitFor();
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.locator('[role="dialog"]').waitFor({state:'detached'});
  assert.equal(await title().textContent(),'ホーム');return {modalCleared:true};
 });
 await check('NAV-04 close button and Escape use the same stack pop behavior',async()=>{
  await page.locator('[data-action="open-help"]').click();await page.locator('[role="dialog"]').waitFor();
  await page.locator('[data-action="close-modal"]').first().click();await page.locator('[role="dialog"]').waitFor({state:'detached'});
  await page.locator('[data-action="open-help"]').click();await page.locator('[role="dialog"]').waitFor();
  await page.keyboard.press('Escape');await page.locator('[role="dialog"]').waitFor({state:'detached'});
  assert.equal(await title().textContent(),'ホーム');return {methods:['button','Escape']};
 });
 await check('NAV-05 denied browser Back retains unsaved draft',async()=>{
  await page.locator('.footer-nav [data-id="S02"]').click();await title().filter({hasText:'記録'}).waitFor();
  await page.locator('#field-distanceKm').fill('6.125');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.goBack({waitUntil:'domcontentloaded'});
  await title().filter({hasText:'記録'}).waitFor();
  assert.equal(await page.locator('#field-distanceKm').inputValue(),'6.125');return {draftRemains:true};
 });
 await context.close();
}catch(e){fail=String(e.stack??e);console.error(fail)}finally{await browser?.close().catch(()=>{});const report={schema:'RunLoad-G2-G1-navigation-real-browser-V1',time:new Date().toISOString(),gitCommit:process.env.GITHUB_SHA??'LOCAL',checks,failure:fail};await fs.mkdir('audit',{recursive:true});await fs.writeFile('audit/g1_navigation_browser_actions.json',JSON.stringify(report,null,2)+'\n');console.log('Navigation acceptance:',checks.filter(x=>x.status==='PASS').length+'/'+checks.length,'PASS');if(fail||checks.length!==5||checks.some(x=>x.status==='FAIL'))process.exitCode=1}