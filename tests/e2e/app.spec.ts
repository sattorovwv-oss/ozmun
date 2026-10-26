import { test, expect } from '@playwright/test';

test('dashboard, live scenario changes, map controls and forecast validation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Бассейн Вахша.',exact:true})).toBeVisible();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  const previous=await page.getByTestId('energy-kpi').textContent();
  await page.getByRole('button',{name:'Больше энергии',exact:true}).click();
  await expect(page.getByTestId('energy-kpi')).not.toHaveText(previous!);
  await page.getByRole('button',{name:'Сохранить воду',exact:true}).click();
  await page.getByRole('button',{name:'Найти баланс',exact:true}).click();
  await expect(page.locator('.toast')).toContainText('Найден режим');
  await page.getByRole('button',{name:'2D',exact:true}).click();await page.getByRole('button',{name:'3D',exact:true}).click();
  await page.getByRole('button',{name:'Приблизить',exact:true}).click();await page.getByRole('button',{name:'Сбросить вид',exact:true}).click();
  await page.getByRole('button',{name:'Прогноз и ИИ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Прогноз, который можно проверить'})).toBeVisible();
  await expect(page.locator('.forecast-metrics .metric-card').last()).toContainText('14');
  expect(errors).toEqual([]);
});

test('scenario settings, CSV export, source import and report download',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('energy-kpi')).toBeVisible();
  await page.getByRole('button',{name:'Сценарии',exact:true}).click();
  await page.getByRole('button',{name:'Параметры модели',exact:true}).click();
  const head=page.getByLabel('Напор', {exact:false});await head.fill('180');await page.getByRole('button',{name:'Применить',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать расчёты CSV'}).click();expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole('navigation').getByRole('button',{name:'Источники данных',exact:true}).click();
  await page.getByLabel('Загрузить CSV',{exact:true}).setInputFiles({name:'measurements.csv',mimeType:'text/csv',buffer:Buffer.from('date,storage_mcm,inflow_m3s,release_m3s\n2026-10-20,2600,300,500\n')});
  await expect(page.locator('.measurement-preview').getByText('1 измерений загружено',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Использовать последний запас'}).click();
  await page.getByRole('button',{name:'Обзор бассейна',exact:true}).click();
  await expect(page.getByLabel('Начальный запас',{exact:true})).toHaveValue('2600');
  const report=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать отчёт',exact:true}).click();expect((await report).suggestedFilename()).toMatch(/\.html$/);
});

test('grounded assistant, presentation and Tajik localization',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('energy-kpi')).toBeVisible();
  await page.getByRole('button',{name:'Аналитический помощник',exact:true}).click();
  await page.getByLabel('Задайте вопрос о бассейне…').fill('Сколько энергии получится за неделю? Ответь кратко.');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.locator('.message.assistant').last()).toContainText('212',{timeout:35000});
  await expect(page.locator('.message.assistant').last()).toContainText('ГВт');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Режим защиты',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Вода связывает всё.'})).toBeVisible();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('heading',{name:'Сначала — данные.'})).toBeVisible();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'TJ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ҳавзаи Вахш.',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Сенарияҳо',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/dashboard-tajik.png',fullPage:true});
});

test('mobile layout works without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Бассейн Вахша.',exact:true})).toBeVisible();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  await expect(page.getByRole('button',{name:'Нурекская ГЭС',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'РАБОЧЕЕ ПРОСТРАНСТВО',exact:true}).click();
  await page.getByRole('button',{name:'Сценарии',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Сценарии',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-scenarios.png',fullPage:true});
});

test('API rejects invalid scenarios and unknown endpoints',async({request})=>{
  expect((await request.get('/api/health')).ok()).toBe(true);
  expect((await request.get('/api/no-such-endpoint')).status()).toBe(404);
  expect((await request.post('/api/assistant',{data:{message:'test',language:'ru',parameters:{release:-1}}})).status()).toBe(400);
});

test('retained data survives upstream failure and API bootstrap failure',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('energy-kpi')).toBeVisible();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  await page.route('**/api/refresh',route=>route.fulfill({status:502,contentType:'application/json',body:'{"error":"Upstream unavailable"}'}));
  await page.getByRole('button',{name:'Обновить данные',exact:true}).click();
  await expect(page.locator('.toast')).toContainText('Сохранённый набор');
  await expect(page.getByTestId('energy-kpi')).toBeVisible();
  await page.route('**/api/data',route=>route.abort());await page.reload();
  await expect(page.getByTestId('energy-kpi')).toBeVisible();
  await expect(page.locator('.connection-state')).toContainText('Автономный просмотр');
  const before=await page.getByTestId('energy-kpi').textContent();
  await page.getByRole('button',{name:'Больше энергии',exact:true}).click();
  await expect(page.getByTestId('energy-kpi')).not.toHaveText(before!);
});
