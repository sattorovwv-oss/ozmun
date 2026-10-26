import { test, expect } from '@playwright/test';
import { shortDate } from '../../src/i18n';

test('clear overview, selected date and location, explainable rain scenario and map controls',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const {snapshot}=await (await request.get('/api/data')).json();
  await page.goto('/?view=water');await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'Карта погодных точек бассейна Вахша'})).toBeVisible();
  await expect(page.locator('.point-detail h2')).toHaveText('Рашт');
  const rasht=snapshot.weather.find((p:{id:string})=>p.id==='rasht');
  const day=rasht.daily.time[rasht.daily.time.indexOf(snapshot.today)+2];
  await page.locator('.week-strip').getByRole('button',{name:shortDate(day,'ru'),exact:true}).click();
  const rain=rasht.daily.precipitation_sum[rasht.daily.time.indexOf(day)];
  await expect(page.getByTestId('point-rain')).toContainText(rain.toLocaleString('ru-RU'));
  const slider=page.getByLabel('Дополнительные осадки за сутки',{exact:true});
  await slider.focus();await page.keyboard.press('Home');for(let i=0;i<6;i++)await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('point-rain')).toContainText((rain+30).toLocaleString('ru-RU'));
  await expect(page.locator('.point-detail .point-signal')).toHaveClass(/attention/);
  await expect(page.locator('.rain-scenario')).toContainText('Сценарий');
  await page.getByRole('button',{name:'Вернуть реальный прогноз',exact:true}).click();
  await expect(page.getByTestId('point-rain')).toContainText(rain.toLocaleString('ru-RU'));
  await page.getByRole('button',{name:'Нурек',exact:true}).click();await expect(page.locator('.point-detail h2')).toHaveText('Нурек');
  await page.getByRole('button',{name:'Приблизить карту',exact:true}).click();await page.getByRole('button',{name:'Исходный масштаб',exact:true}).click();
  expect(errors).toEqual([]);
});

test('weekly weather opens the requested map day and exposes technical ML validation only on demand',async({page})=>{
  await page.goto('/?view=water');await page.getByRole('navigation').getByRole('button',{name:'Прогноз на 7 дней',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ближайшая неделя — понятнее.',exact:true})).toBeVisible();
  await expect(page.locator('.forecast-day')).toHaveCount(7);
  await page.locator('.technical-details summary').click();
  await expect(page.getByRole('heading',{name:'Прогноз, который можно проверить',exact:true})).toBeVisible();
  await expect(page.locator('.forecast-metrics .metric-card').last()).toContainText('14');
  await page.locator('.forecast-day').nth(2).click();
  await expect(page.locator('.point-detail h2')).toHaveText('Рашт');
  await expect(page.locator('.week-strip button[aria-pressed="true"]')).toHaveCount(1);
});

test('source transparency, retained research module, CSV import and monitoring report export',async({page})=>{
  await page.goto('/?view=water');await page.getByRole('navigation').getByRole('button',{name:'Откуда данные',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Погодные сигналы внимания',exact:true})).toBeVisible();
  await page.getByLabel('Загрузить CSV',{exact:true}).setInputFiles({name:'measurements.csv',mimeType:'text/csv',buffer:Buffer.from('date,storage_mcm,inflow_m3s,release_m3s\n2026-10-20,2600,300,500\n')});
  await page.getByRole('button',{name:'Использовать последний запас',exact:true}).click();
  await page.getByRole('button',{name:'Вода и энергия LAB',exact:true}).click();
  await expect(page.getByLabel('Начальный запас',{exact:true})).toHaveValue('2600');
  const initial=await page.getByTestId('scenario-energy').textContent();
  await page.getByRole('button',{name:'Больше энергии',exact:true}).click();await expect(page.getByTestId('scenario-energy')).not.toHaveText(initial!);
  await page.getByRole('button',{name:'Параметры модели',exact:true}).click();
  await page.getByLabel('Напор',{exact:false}).fill('180');await page.getByRole('button',{name:'Применить',exact:true}).click();
  const csv=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать расчёты CSV',exact:true}).click();expect((await csv).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole('navigation').getByRole('button',{name:'Обзор ситуации',exact:true}).click();
  const report=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать обзор',exact:true}).click();expect((await report).suggestedFilename()).toMatch(/water-overview.*\.html$/);
});

test('water-safety assistant, revised presentation and Tajik localization',async({page})=>{
  await page.goto('/?view=water');await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await page.locator('.sidebar-assistant').getByRole('button',{name:'Спросить ИИ',exact:true}).click();
  await page.getByLabel('Спросите о воде, дожде или опасности…').fill('Есть ли опасность селя в Раште?');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.locator('.message.assistant').last()).toContainText('Рашт',{timeout:35000});
  await expect(page.locator('.message.assistant').last()).toContainText('КЧС');
  await page.keyboard.press('Escape');
  await page.locator('.overview-heading').getByRole('button',{name:'О проекте',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Понимать воду. Замечать изменения.',exact:true})).toBeVisible();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('heading',{name:'Одна карта. Понятная картина.',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'TJ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Об зери назорат.',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button',{name:'Обхезӣ ва сел',exact:true})).toBeVisible();
});

test('mobile map labels remain readable, navigation and safety guidance work without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?view=water');
  await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Нурек',exact:true}).click();await expect(page.locator('.point-detail h2')).toHaveText('Нурек');
  const markerText=page.locator('.weather-map-marker .marker-name').first();
  expect((await markerText.boundingBox())!.height).toBeGreaterThan(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'МОНИТОРИНГ ВОДЫ',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Паводки и сели',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Понимать опасность — заранее.',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'kchs.tj',exact:false})).toHaveAttribute('href','https://kchs.tj/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('API rejects invalid scenario and monitoring context',async({request})=>{
  expect((await request.get('/api/health')).ok()).toBe(true);
  expect((await request.get('/api/no-such-endpoint')).status()).toBe(404);
  expect((await request.post('/api/assistant',{data:{message:'test',language:'ru',parameters:{release:-1}}})).status()).toBe(400);
  const parameters={capacity:4500,initialStorage:2790,release:650,inflowChange:0,irrigationDemand:350,head:220,efficiency:.9,turbineLimit:1400,area:80,evaporation:2.5,reservePercent:30};
  expect((await request.post('/api/assistant',{data:{message:'Есть ли опасность?',language:'ru',parameters,monitoring:{addedRain:1000}}})).status()).toBe(400);
});

test('offline fallback preserves the map and rainfall analysis after API or upstream failures',async({page})=>{
  await page.goto('/?view=water');await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await page.route('**/api/refresh',route=>route.fulfill({status:502,contentType:'application/json',body:'{"error":"Upstream unavailable"}'}));
  await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.locator('.toast')).toContainText('Сохранённый набор');
  await page.route('**/api/data',route=>route.abort());await page.reload();
  await expect(page.getByRole('heading',{name:'Вода под наблюдением.',exact:true})).toBeVisible();
  await expect(page.locator('.connection-state')).toContainText('Без сети');
  await page.getByRole('button',{name:'Нурек',exact:true}).click();await expect(page.locator('.point-detail h2')).toHaveText('Нурек');
});

test('real 3D terrain remains available as a secondary view',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?view=water');await page.getByRole('button',{name:'Рельеф 3D',exact:true}).click();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  await page.getByRole('button',{name:'2D',exact:true}).click();await page.getByRole('button',{name:'3D',exact:true}).click();
  await page.getByRole('button',{name:'Карта',exact:true}).click();await expect(page.locator('.geographic-map')).toBeVisible();
  expect(errors).toEqual([]);
});
