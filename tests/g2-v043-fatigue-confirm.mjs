import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();const report=[],failures=[];
await fs.mkdir('audit/v043_fatigue_confirm',{recursive:true});
for(const [name,width,height] of [['pc1440',1440,900],['phone390',390,844],['phone320',320,700]]){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await context.newPage();
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  if(width<1100)await page.locator('.footer-nav [data-id="S02"]').click();
  await page.locator('[data-action="open-fatigue"]:visible').first().click();
  await page.locator('.old-fatigue-layout').waitFor({timeout:10000});
  if(await page.locator('.rof-j-original-anchor img').count()!==5)throw Error('ROF author images not 5');
  if(await page.locator('.rof-choice').count()!==11)throw Error('ROF values 0-10 not intact');
  await page.screenshot({path:`audit/v043_fatigue_confirm/${name}_S03.png`,fullPage:true});
  await page.getByRole('button',{name:'疲労感 0',exact:true}).click();
  if(await page.locator('#field-fatigueValue').inputValue()!=='0')throw Error('Zero rejected');
  await page.locator('[data-action="capture-pre"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  if(width>=1100)await page.locator('.sidebar [data-id="S02"]').click();
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]').click();
  await page.locator('.old-save-confirm').waitFor({timeout:10000});
  if(await page.locator('.old-save-section').count()<3)throw Error('Group review cards not shown');
  if(!(await page.locator('.old-save-confirm').innerText()).includes('走る前'))throw Error('subjective field omitted');
  await page.screenshot({path:`audit/v043_fatigue_confirm/${name}_S04.png`,fullPage:true});
  await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  if(await page.locator('.region-list [data-action=select-region]').count()!==12)throw Error('12-region result damaged');
  report.push({name,status:'PASS'});
 }catch(e){failures.push({name,error:String(e.stack||e)});console.error(name,String(e));}
 await context.close();
}
await browser.close();
await fs.writeFile('audit/v043_fatigue_confirm.json',JSON.stringify({report,failures},null,2));
if(failures.length)process.exitCode=1;
