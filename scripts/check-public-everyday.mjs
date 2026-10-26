import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base=process.env.PUBLIC_SITE_URL||'https://obihush.site';
assert.equal(new URL(base).protocol,'https:');
const executable=process.env.CHROMIUM_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const browser=await chromium.launch({...(executable?{executablePath:executable}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try{
  await mkdir('artifacts',{recursive:true});
  const page=await browser.newPage({viewport:{width:1512,height:982}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.consumer-hero h1').waitFor();
  assert.match(await page.locator('.consumer-hero h1').textContent(),/Вода\. Погода\./);
  assert.equal(await page.locator('video').getAttribute('src'),'/media/garden-desktop.mp4');
  await page.getByTestId('current-temperature').waitFor({timeout:30000});
  assert.equal(await page.locator('.current-city').textContent(),'Душанбе');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'artifacts/public-home-desktop.png'});
  await page.locator('.consumer-location select').selectOption('khujand');
  await page.waitForFunction(()=>document.querySelector('.current-city')?.textContent==='Худжанд',null,{timeout:30000});
  await page.locator('.planner-role-tabs').getByRole('button',{name:'Дом и семья',exact:true}).click();
  assert.equal((await page.getByTestId('family-saving').textContent()).replace(/\D/g,''),'3240');
  await page.locator('.daily-planner').screenshot({path:'artifacts/public-family-planner.png'});
  const mobile=await browser.newPage({viewport:{width:390,height:844}});
  mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.goto(base,{waitUntil:'domcontentloaded'});await mobile.locator('.consumer-hero h1').waitFor();
  await mobile.getByTestId('current-temperature').waitFor({timeout:30000});await mobile.evaluate(()=>document.fonts.ready);
  assert.equal(await mobile.locator('video').getAttribute('src'),'/media/garden-mobile.mp4');
  const bounds=await mobile.locator('.hero-current').boundingBox();
  assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.screenshot({path:'artifacts/public-home-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('Public interface verified in a real browser: desktop video, portrait mobile video, live location switch, family calculation, mobile controls and no page errors.');
}finally{await browser.close();}
