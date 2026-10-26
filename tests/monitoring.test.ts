import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monitoringDates, monitoringOverview, pointConditions, rainLevel } from '../shared/monitoring';
import type { Snapshot } from '../shared/types';

const snapshot=JSON.parse(readFileSync(new URL('../data/snapshot.json',import.meta.url),'utf8')) as Snapshot;
test('rainfall screening boundaries and missing values never imply guaranteed safety',()=>{
  assert.equal(rainLevel(null),'unknown');assert.equal(rainLevel(NaN),'unknown');assert.equal(rainLevel(-1),'unknown');
  assert.equal(rainLevel(0),'quiet');assert.equal(rainLevel(14.99),'quiet');
  assert.equal(rainLevel(15),'watch');assert.equal(rainLevel(29.99),'watch');assert.equal(rainLevel(30),'attention');
});
test('point conditions use the selected location and exact date, preserving unknown data',()=>{
  const point=structuredClone(snapshot.weather[1]),date=snapshot.today;
  const index=point.daily.time.indexOf(date);
  point.daily.precipitation_sum[index]=18;
  assert.equal(pointConditions(point,date).rain,18);assert.equal(pointConditions(point,date).level,'watch');
  point.daily.precipitation_sum[index]=null;
  assert.equal(pointConditions(point,date,30).rain,null);assert.equal(pointConditions(point,date,30).level,'unknown');
  assert.equal(pointConditions(point,'2040-01-01').temperature,null);
});
test('a rainfall scenario is labelled and cannot mutate the forecast, temperature or river',()=>{
  const original=JSON.stringify(snapshot),point=snapshot.weather[0],date=snapshot.today;
  const a=pointConditions(point,date),b=pointConditions(point,date,30);
  assert.equal(b.rain,a.rain!+30);assert.equal(b.originalRain,a.rain);assert.equal(b.scenario,true);
  assert.equal(b.temperature,a.temperature);assert.equal(b.snow,a.snow);assert.equal(JSON.stringify(snapshot),original);
  assert.throws(()=>pointConditions(point,date,-1));assert.throws(()=>pointConditions(point,date,Infinity));
});
test('overview uses a complete seven-day weather window and a separate 72-hour outlook',()=>{
  const copy=structuredClone(snapshot),dates=monitoringDates(copy);
  assert.equal(dates.length,7);assert.equal(dates[0],copy.today);assert.ok(dates.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)));
  const p=copy.weather[0];p.daily.precipitation_sum[p.daily.time.indexOf(dates[6])]=95;
  const result=monitoringOverview(copy);assert.equal(result.peak?.rain,95);assert.notEqual(result.next72?.rain,95);
  p.daily.precipitation_sum[p.daily.time.indexOf(dates[0])]=null;
  assert.equal(monitoringOverview(copy).complete,false);
});
