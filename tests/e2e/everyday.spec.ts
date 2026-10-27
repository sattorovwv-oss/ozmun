import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseWeather } from '../../server/weather';
import { CITIES, localDate } from '../../shared/local-weather';
import type { WeatherPayload } from '../../shared/local-weather';

const saved=JSON.parse(readFileSync(new URL('../../data/weather-dushanbe.json',import.meta.url),'utf8'));
function forecast(city='dushanbe'):WeatherPayload{
  const place=CITIES.find(p=>p.id===city)||CITIES[0];
  const raw=structuredClone(saved.raw);raw.latitude=place.latitude;raw.longitude=place.longitude;
  const weather=parseWeather(raw,place,new Date().toISOString());
  const delta=(Date.parse(localDate(Date.now())+'T00:00:00Z')-Date.parse(weather.days[0].date+'T00:00:00Z'));
  const shift=(at:string)=>new Date(Date.parse(at)+delta).toISOString();
  weather.current={...weather.current,at:new Date().toISOString(),temperature:city==='khujand'?21:18,isDay:true,code:0,rain:0};
  weather.days.forEach(day=>{day.date=localDate(Date.parse(day.date+'T12:00:00Z')+delta);if(day.sunrise)day.sunrise=shift(day.sunrise);if(day.sunset)day.sunset=shift(day.sunset);day.et0=5;day.rain=0;});
  weather.days[0].rain=12;weather.days[0].code=61;
  weather.hours.forEach(hour=>{hour.at=shift(hour.at);hour.rain=0;hour.rainProbability=10;hour.wind=1;hour.temperature=20;});
  return {weather,stale:false,from:'live',upstreamUnavailable:false};
}
test.beforeEach(async({page})=>{
  await page.route('**/api/weather?**',route=>{
    const url=new URL(route.request().url());return route.fulfill({json:forecast(url.searchParams.get('city')||'dushanbe')});
  });
});

test('video introduction explains the three audiences and uses current weather independently of daily rain',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('.consumer-hero h1')).toContainText('Вода. Погода.');
  await expect(page.locator('video')).toHaveAttribute('src','/media/garden-desktop.mp4?v=orchard-20261027');
  await expect(page.locator('video')).not.toHaveAttribute('loop');
  await expect(page.locator('.consumer-hero-content')).toBeHidden();
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.readyState>=2&&!video.paused;});
  await page.locator('video').evaluate((video:HTMLVideoElement)=>{video.currentTime=video.duration-.2;});
  await expect(page.locator('.consumer-hero-content')).toBeVisible();
  expect(await page.locator('video').evaluate((video:HTMLVideoElement)=>video.ended&&video.paused)).toBe(true);
  await expect(page.getByRole('button',{name:'Посмотреть ещё раз',exact:true})).toBeVisible();
  await expect(page.locator('.audience-card')).toHaveCount(3);
  await expect(page.getByTestId('current-condition')).toHaveText('Ясно');
  await expect(page.getByTestId('current-temperature')).toHaveText('18°');
  await expect(page.locator('.consumer-week>button').first()).toContainText('12 мм');
  await page.locator('.consumer-location select').selectOption('khujand');
  await expect(page.locator('.current-city')).toHaveText('Худжанд');await expect(page.getByTestId('current-temperature')).toHaveText('21°');
  expect(errors).toEqual([]);
});

test('garden estimate responds to area and forecast, and family savings and saved tasks persist',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('current-temperature')).toBeVisible();
  const initial=await page.getByTestId('garden-litres').textContent();
  await page.getByLabel('Учитывать прогноз дождя',{exact:true}).uncheck();
  await expect(page.getByTestId('garden-litres')).not.toHaveText(initial!);
  await page.getByLabel('Площадь участка',{exact:false}).fill('100');await expect(page.getByTestId('garden-litres')).toContainText('472');
  await page.locator('.planner-role-tabs').getByRole('button',{name:'Дом и семья',exact:true}).click();
  await expect(page.getByTestId('family-saving')).toContainText('3 240');
  await page.getByLabel('Минут в душе на человека',{exact:false}).fill('5');await expect(page.getByTestId('family-saving')).toHaveText('0 л');
  await page.getByRole('button',{name:'Сохранить мой план',exact:true}).click();
  await expect(page.locator('.saved-plan-list>article')).toHaveCount(1);
  await page.getByRole('button',{name:'Отметить выполненным',exact:true}).click();await page.reload();
  await expect(page.locator('.saved-plan-list>article')).toHaveClass(/done/);
});

test('forecast work windows export a real calendar file and all water modules remain reachable',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('current-temperature')).toBeVisible();
  await page.locator('.consumer-week>button').nth(1).click();
  await page.locator('.planner-role-tabs').getByRole('button',{name:'Работа на улице',exact:true}).click();
  await expect(page.locator('.work-windows>article').first()).toBeVisible();
  const download=page.waitForEvent('download');await page.locator('.work-windows>article').first().getByRole('button').click();
  const file=await download;expect(file.suggestedFilename()).toBe('obhush-work.ics');
  const text=readFileSync((await file.path())!,'utf8');expect(text).toContain('BEGIN:VCALENDAR');expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  await page.getByRole('button',{name:'Исследовать воду и риски',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await page.locator('.sidebar').getByRole('button',{name:'На главную',exact:true}).click();
  await expect(page.locator('.consumer-hero h1')).toBeVisible();
});

test('weather failure never substitutes another city and stale weather is not called current',async({page})=>{
  await page.goto('/');await expect(page.locator('.current-city')).toHaveText('Душанбе');
  await page.route('**/api/weather?city=khujand',route=>route.fulfill({status:503,json:{error:'Weather unavailable'}}));
  await page.locator('.consumer-location select').selectOption('khujand');
  await expect(page.getByText('Не удалось получить погоду этого места. Другой город не подставляем.',{exact:true})).toBeVisible();
  await expect(page.locator('.current-city')).toHaveCount(0);
  await page.route('**/api/weather?**',route=>route.fulfill({json:{...forecast(),stale:true,from:'saved',upstreamUnavailable:true}}));
  await page.locator('.consumer-location select').selectOption('dushanbe');
  await expect(page.locator('.current-card-top')).toContainText('Последние доступные данные');
  await expect(page.locator('.consumer-stale')).toBeVisible();
  await expect(page.getByTestId('garden-litres')).toHaveCount(0);
});

test('a mismatched weather response is refused instead of relabelled with the selected city',async({page})=>{
  await page.goto('/');await expect(page.locator('.current-city')).toHaveText('Душанбе');
  await page.route('**/api/weather?city=khujand',route=>route.fulfill({json:forecast('dushanbe')}));
  await page.locator('.consumer-location select').selectOption('khujand');
  await expect(page.locator('.consumer-weather-state.has-error')).toBeVisible();
  await expect(page.getByTestId('current-temperature')).toHaveCount(0);
});

test('mobile uses the portrait video, keeps the hero controls on screen and supports Tajik',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('video')).toHaveAttribute('src','/media/garden-mobile.mp4?v=orchard-20261027');
  await page.getByRole('button',{name:'Пропустить видео',exact:true}).click();
  await expect(page.locator('.consumer-hero-content')).toBeVisible();
  await expect(page.locator('.hero-current')).toContainText('Душанбе');
  const bounds=(await page.locator('.hero-current').boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(844);
  await page.getByRole('button',{name:'TJ',exact:true}).click();await expect(page.locator('.consumer-hero h1')).toContainText('Об. Обу ҳаво.');
  await page.getByRole('button',{name:'Кушодани меню',exact:true}).click();await page.getByRole('button',{name:'Обу ҳаво',exact:true}).click();
  await expect(page.locator('.current-city')).toHaveText('Душанбе');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('completed introduction stays stopped across reload and resizing, and replay is explicit',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Пропустить видео',exact:true}).click();
  await page.reload();await expect(page.locator('.consumer-hero-content')).toBeVisible();
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.readyState>=2&&!video.seeking&&video.currentTime>video.duration-.2;});
  expect(await page.locator('video').evaluate((video:HTMLVideoElement)=>video.paused&&video.currentTime>video.duration-.2)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('video')).toHaveAttribute('src','/media/garden-mobile.mp4?v=orchard-20261027');
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.readyState>=2&&video.currentTime>video.duration-.2;});
  expect(await page.locator('video').evaluate((video:HTMLVideoElement)=>video.paused)).toBe(true);
  await page.getByRole('button',{name:'Посмотреть ещё раз',exact:true}).click();
  await expect(page.locator('.consumer-hero-content')).toBeHidden();
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&!video.paused&&video.currentTime<3;});
  await page.getByRole('button',{name:'Пропустить видео',exact:true}).click();
  await page.getByRole('button',{name:'Спланировать мой день',exact:true}).click();
  await expect(page.locator('#for-you')).toBeInViewport();
});

test('reduced motion and denied autoplay keep the main actions available',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('.consumer-hero-content')).toBeVisible();
  expect(await page.locator('video').evaluate((video:HTMLVideoElement)=>video.paused)).toBe(true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>sessionStorage.removeItem('obhush-intro-orchard-20261027'));
  await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Autoplay denied','NotAllowedError'));});
  await page.reload();await expect(page.locator('.consumer-hero-content')).toBeVisible();
  await expect(page.getByRole('button',{name:'Спланировать мой день',exact:true})).toBeVisible();
});

test('everyday assistant sends the selected place and task instead of a reservoir scenario',async({page})=>{
  let body:Record<string,unknown>|null=null;
  await page.route('**/api/advice',async route=>{body=route.request().postDataJSON();await route.fulfill({json:{answer:'Душанбе: расчёт полива основан на площади участка, испарении и прогнозе осадков. Проверьте влажность почвы перед поливом.',mode:'local'}});});
  await page.goto('/');await expect(page.getByTestId('current-temperature')).toBeVisible();
  await page.locator('.consumer-ai').getByRole('button',{name:'Спросить ОБҲУШ',exact:true}).click();
  await page.getByLabel('Вопрос о вашем дне, воде или погоде…',{exact:true}).fill('Как понимать расчёт полива?');await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.locator('.message.assistant').last()).toContainText('влажность почвы');
  expect(body).toMatchObject({role:'garden',location:{city:'dushanbe'}});expect(body).not.toHaveProperty('parameters');
});

test('daily weather and advice APIs reject ambiguous or invalid locations',async({request})=>{
  expect((await request.get('/api/weather?city=unknown')).status()).toBe(400);
  expect((await request.get('/api/weather?city=dushanbe&latitude=38&longitude=68')).status()).toBe(400);
  expect((await request.get('/api/weather?latitude=0&longitude=0')).status()).toBe(400);
  expect((await request.post('/api/advice',{data:{message:'test'}})).status()).toBe(400);
});
