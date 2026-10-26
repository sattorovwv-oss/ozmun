import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeather, requestedPlace } from '../server/weather';
import { CITIES, localDate, weatherIsStale, weatherKind } from '../shared/local-weather';
import { familyWater, gardenWater, outdoorWindows } from '../shared/daily-plans';
import { dailyAnswer } from '../server/daily-assistant';

const saved=JSON.parse(readFileSync(new URL('../data/weather-dushanbe.json',import.meta.url),'utf8'));
const weather=parseWeather(saved.raw,CITIES[0],saved.fetchedAt);
test('sunny current conditions remain separate from rain forecast for the entire day',()=>{
  const raw=structuredClone(saved.raw);raw.current.weather_code=0;raw.current.is_day=1;raw.current.precipitation=0;
  raw.daily.precipitation_sum[0]=12;raw.daily.weather_code[0]=61;
  const result=parseWeather(raw,CITIES[0],saved.fetchedAt);
  assert.equal(weatherKind(result.current.code),'clear');assert.equal(result.current.rain,0);
  assert.equal(result.days[0].rain,12);assert.equal(weatherKind(result.days[0].code),'rain');
  assert.notEqual(result.current.temperature,result.days[0].max);
});
test('weather dates use Dushanbe time, and old model conditions are explicitly stale',()=>{
  assert.equal(localDate('2026-10-26T20:00:00Z'),'2026-10-27');
  const copy=structuredClone(weather);copy.current.at='2026-10-27T03:00:00Z';copy.fetchedAt='2026-10-27T03:05:00Z';
  assert.equal(weatherIsStale(copy,Date.parse('2026-10-27T03:15:00Z')),false);
  assert.equal(weatherIsStale(copy,Date.parse('2026-10-27T05:00:00Z')),true);
  assert.equal(weatherKind(null),'unknown');
});
test('wrong units, incomplete forecasts and ambiguous locations are rejected',()=>{
  const wrong=structuredClone(saved.raw);wrong.current_units.wind_speed_10m='km/h';assert.throws(()=>parseWeather(wrong,CITIES[0]));
  const partial=structuredClone(saved.raw);partial.hourly.precipitation.pop();assert.throws(()=>parseWeather(partial,CITIES[0]));
  assert.throws(()=>parseWeather(saved.raw,CITIES[1]));
  assert.throws(()=>requestedPlace({city:'khujand',latitude:38,longitude:68}));
  assert.throws(()=>requestedPlace({city:'unknown'}));assert.throws(()=>requestedPlace({latitude:0,longitude:0}));
  assert.equal(requestedPlace({city:'khujand'}).name,'Худжанд');
});
test('garden litres respect area, crop coefficient, rain and irrigation efficiency',()=>{
  const copy=structuredClone(weather),day=copy.days[0];day.et0=5;day.rain=2;
  const result=gardenWater(copy,day.date,{area:100,coefficient:.8,efficiency:.8,useRain:true})!;
  assert.ok(Math.abs(result.litres-325)<1e-8);
  day.rain=20;assert.equal(gardenWater(copy,day.date,{area:100,coefficient:.8,efficiency:.8,useRain:true})!.litres,0);
  day.et0=null;assert.equal(gardenWater(copy,day.date,{area:100,coefficient:.8,efficiency:.8,useRain:true}),null);
});
test('work windows cannot contain darkness, rain, missing conditions or elapsed hours',()=>{
  const copy=structuredClone(weather),date=copy.days[0].date;
  copy.days[0].sunrise=date+'T01:30:00Z';copy.days[0].sunset=date+'T12:30:00Z';
  copy.hours=Array.from({length:6},(_,i)=>({at:`${date}T0${i+2}:00:00Z`,temperature:20,rain:0,rainProbability:10,wind:1,code:0}));
  const windows=outdoorWindows(copy,date,2,Date.parse(date+'T02:30:00Z'));
  assert.ok(windows.length>0);assert.ok(windows.every(w=>Date.parse(w.start)>=Date.parse(date+'T02:30:00Z')));
  copy.hours.forEach(h=>h.rainProbability=null);assert.equal(outdoorWindows(copy,date,2,0).length,0);
  copy.hours.forEach(h=>{h.rainProbability=10;h.rain=1;});assert.equal(outdoorWindows(copy,date,2,0).length,0);
});
test('household savings compare only stated uses and never invent negative savings',()=>{
  const inputs={people:4,showerMinutes:8,flow:9,loadsPerWeek:3,litresPerLoad:45};
  const result=familyWater(inputs);assert.equal(result.savedMonthly,3240);assert.ok(Math.abs(result.totalDaily-307.2857142857143)<1e-8);
  assert.equal(familyWater({...inputs,showerMinutes:3}).savedMonthly,0);
  assert.throws(()=>familyWater({...inputs,people:0}));
});

const question={message:'Нужен ли завтра полив?',language:'ru' as const,role:'garden' as const,date:'2000-01-01',
  garden:{area:50,coefficient:.85,efficiency:.9,useRain:true},family:{people:4,showerMinutes:8,flow:9,loadsPerWeek:3,litresPerLoad:45},duration:2};
test('tomorrow in an everyday question resolves independently of a previously selected date',async()=>{
  const key=process.env.LLM_API_KEY;delete process.env.LLM_API_KEY;
  try{const result=await dailyAnswer(question,CITIES[0],{weather,stale:false,from:'cache',upstreamUnavailable:false});
    assert.equal(result.mode,'local');assert.equal(result.date,localDate(Date.now()+86400000));
  }finally{if(key!==undefined)process.env.LLM_API_KEY=key;}
});
test('the new everyday assistant preserves free-only routing and rejects provider classification text',async()=>{
  const original=globalThis.fetch,key=process.env.LLM_API_KEY,model=process.env.LLM_MODEL;
  process.env.LLM_API_KEY='test-not-a-real-key';process.env.LLM_MODEL='paid-provider/paid-model';
  globalThis.fetch=async(_url,init)=>{assert.equal(JSON.parse(init!.body as string).model,'openrouter/free');return new Response(JSON.stringify({choices:[{message:{content:'User Safety: safe'}}]}));};
  try{const result=await dailyAnswer({...question,message:'Как уменьшить расход воды?',role:'family'},CITIES[0],null);
    assert.equal(result.mode,'local');assert.match(result.answer,/3.?240/);assert.doesNotMatch(result.answer,/User Safety/);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;if(model===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=model;}
});
test('exact household questions use verified arithmetic without requesting generated calculations',async()=>{
  const original=globalThis.fetch,key=process.env.LLM_API_KEY;
  process.env.LLM_API_KEY='test-not-a-real-key';
  let called=false;globalThis.fetch=async()=>{called=true;throw new Error('No generated arithmetic is needed');};
  try{const result=await dailyAnswer({...question,message:'Сколько воды можно сэкономить?',role:'family'},CITIES[0],null);
    assert.equal(result.mode,'local');assert.match(result.answer,/3.?240/);assert.match(result.answer,/108/);assert.equal(called,false);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;}
});
