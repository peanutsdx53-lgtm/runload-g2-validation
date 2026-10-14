import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch(),screens=[],errors=[];
for(const [device,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['pc1100',1100,800]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage(),jsErrors=[];page.on('pageerror',e=>jsErrors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('.screen--home .home-desktop .focus-top').waitFor();
  assert.equal(await page.locator('.legacy-home-exact').count(),0,'hand-recreated home must be absent');
  assert.equal(await page.locator('.home-desktop .pc-home-rail .grid article').count(),2,'original rail structure contains only active record and G2 reflection');
  assert.equal(await page.locator('.pc-home-heading').count(),1);
  assert.equal(await page.locator('.pc-home-dashboard').count(),1);
  assert.equal(await page.locator('.pc-home-overview').count(),1);
  assert.equal(await page.locator('.home-desktop a[href^="#/"]').count(),0,'old route hrefs must be adapted');
  assert.equal(await page.locator('.home-desktop [data-action="new-record"]').count(),2);
  const m=await page.locator('.home-desktop .focus').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
  assert(m.width>500&&m.x>100,'old focus layout');
  const info=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert(info.scrollWidth<=width+1,'horizontal overflow');
  await page.screenshot({path:'audit/v045_original_home_'+device+'.png',fullPage:true,animations:'disabled'});
  await page.locator('.home-desktop [data-action="new-record"]').first().click();
  await page.locator('#field-recordDate').waitFor();
  assert.equal((await page.locator('#main-content').innerText()).includes('今日の走行'),true);
  if(jsErrors.length)throw Error(jsErrors.join(';'));
  screens.push({device,result:'PASS',focus:m});
 }catch(e){errors.push({device,error:String(e.stack??e)});}await ctx.close();
}
await browser.close();await fs.mkdir('audit',{recursive:true});await fs.writeFile('audit/v045_direct_original_home.json',JSON.stringify({screens,errors},null,2));
console.log('V045 original source home tests:',screens.length,'passed',errors.length,'failed');
if(errors.length)process.exitCode=1;
