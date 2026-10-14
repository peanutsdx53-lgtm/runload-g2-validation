import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='audit/legacy_ui_reference';
await mkdir(dir,{recursive:true});
const base='http://127.0.0.1:4175/';
const browser=await chromium.launch();
const results=[];
for(const [size,w,h] of [['pc1440',1440,900],['mobile390',390,844],['mobile320',320,700]]){
 const context=await browser.newContext({viewport:{width:w,height:h},locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce',deviceScaleFactor:1});
 const page=await context.newPage();const faults=[];
 page.on('pageerror',e=>faults.push(String(e)));
 for(const [key,hash] of [['home','#/home'],['record','#/record-input'],['result','#/result'],['history','#/history']]){
  try {
   await page.goto(base+hash,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(1300);
   const metrics=await page.evaluate(()=>({location:location.hash,title:document.querySelector('.screen h1, #main-content h1, .app-header__screen-title, .mobile-topbar__screen-title')?.textContent?.trim()?.slice(0,150)??'',scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,rootText:document.querySelector('#main-content')?.textContent?.trim()?.slice(0,180)??'',dialogs:document.querySelectorAll('[role=dialog]').length,screenClasses:document.querySelector('#main-content .screen')?.className??''}));
   const file=size+'_'+key+'.png';
   await page.screenshot({path:dir+'/'+file,fullPage:true,animations:'disabled',timeout:25000});
   results.push({size,w,h,key,file,metrics,sha256:createHash('sha256').update(await readFile(dir+'/'+file)).digest('hex')});
   console.log(size,key,JSON.stringify(metrics));
  }catch(e){results.push({size,key,error:String(e)});console.error(size,key,String(e));}
 }
 results.push({size,pageErrors:faults});
 await context.close();
}
await browser.close();
await writeFile('audit/legacy_ui_reference.json',JSON.stringify({source:'peanutsdx53-lgtm/runload-app main; unchanged source; browser-only isolated capture',results},null,2));
