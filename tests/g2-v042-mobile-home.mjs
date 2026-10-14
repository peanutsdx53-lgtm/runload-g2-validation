import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();const rows=[],errors=[];
await fs.mkdir('audit/v042_mobile_home',{recursive:true});
for(const [label,width,height] of [['phone390',390,844],['phone320',320,700],['tablet800',800,900],['pc1440',1440,900]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage();const pageerrors=[];page.on('pageerror',e=>pageerrors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  const m=await page.evaluate(()=>{
   const geom=selector=>{const e=document.querySelector(selector);if(!e)return null;let r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
   return{viewport:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('#main-content h1')?.innerText,
    mobile:geom('.old-mobile-home'),first:geom('.old-mobile-first-record'),summary:geom('.old-mobile-summary-grid'),launcher:geom('.old-mobile-launcher-grid'),footer:geom('.footer-nav'),
    desktopHero:geom('.home-hero'),header:geom('.screen-header'),appText:document.querySelector('#main-content')?.innerText};
  });
  if(m.scroll>width+1)throw Error('Horizontal overflow '+JSON.stringify(m));
  if(!m.title)throw Error('No title');
  if(m.appText.includes('RunLoad'))throw Error('Unnecessary branding');
  if(width<1100){
   if(!m.first||!m.summary||!m.launcher)throw Error('Old mobile launcher components missing');
   if(await page.locator('.old-mobile-launcher').count()!==4)throw Error('Deferred / required destinations mismatch');
   await page.locator('.old-mobile-first-record').click();
   if(await page.locator('#field-recordDate').count()!==1)throw Error('Launcher route not functional');
  }else{
   if(!m.desktopHero||m.mobile)throw Error('Desktop home unexpectedly changed');
  }
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await page.screenshot({path:`audit/v042_mobile_home/${label}_S01.png`,fullPage:true,animations:'disabled'});
  if(pageerrors.length)throw Error(pageerrors.join(';'));
  rows.push({label,metrics:m,status:'PASS'});
  console.log(label,JSON.stringify({...m,appText:undefined}));
 }catch(e){errors.push({label,error:String(e)});console.error(label,e);}
 await ctx.close();
}
await browser.close();
await fs.writeFile('audit/v042_mobile_home_metrics.json',JSON.stringify({rows,errors},null,2));
if(errors.length)process.exitCode=1;
