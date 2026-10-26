import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PARAMETERS as p, simulate, optimize } from '../shared/model';
import { analyzeForecast, getInflowForecast } from '../shared/forecast';
import type { ForecastDay, Snapshot } from '../shared/types';

const f=(flow:number):ForecastDay[]=>Array.from({length:7},(_,i)=>({date:`2026-10-${String(27+i).padStart(2,'0')}`,flow,source:'glofas'}));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('daily reservoir balance conserves water under shortages and spills',()=>{
  for(const initialStorage of [0,10,100,4500])for(const inflow of [0,100,9000])for(const release of [0,400,2000]){
    const result=simulate(f(inflow),{...p,initialStorage,release});
    for(const day of result.days){near(day.balanceError,0);assert.ok(day.storage>=0&&day.storage<=p.capacity);assert.ok(day.release<=release);assert.ok(day.coverage>=0&&day.coverage<=100);}
  }
});
test('hydropower formula has correct GWh units',()=>{
  const result=simulate(f(100).slice(0,1),{...p,head:100,release:100,efficiency:1});
  near(result.energy,2.3544);
});
test('downstream irrigation reuses turbine release without double subtraction',()=>{
  const noIrrigation=simulate(f(300),{...p,irrigationDemand:0});
  const withIrrigation=simulate(f(300),{...p,irrigationDemand:900});
  near(noIrrigation.finalStorage,withIrrigation.finalStorage);near(noIrrigation.energy,withIrrigation.energy);
  assert.ok(withIrrigation.coverage<100);
});
test('empty storage limits release and full storage spills excess water',()=>{
  const empty=simulate(f(0),{...p,initialStorage:0});
  near(empty.finalStorage,0);near(empty.energy,0);near(empty.coverage,0);
  const full=simulate(f(1000),{...p,initialStorage:p.capacity,release:0});
  near(full.finalStorage,p.capacity);assert.ok(full.spill>0);
});
test('additional bypass release does not produce energy beyond turbine limit',()=>{
  const a=simulate(f(1000),{...p,release:1400}),b=simulate(f(1000),{...p,release:2000});
  near(a.energy,b.energy);assert.ok(b.finalStorage<a.finalStorage);
});
test('optimization honors reserve and irrigation constraints and detects infeasibility',()=>{
  const best=optimize(f(300),p);assert.ok(best);assert.ok(best.result.coverage>=95);assert.equal(best.result.reserveViolated,false);
  assert.equal(optimize(f(0),{...p,initialStorage:0}),null);
});
test('non-finite, negative inflows and impossible parameters are rejected',()=>{
  assert.throws(()=>simulate(f(-1),p));assert.throws(()=>simulate(f(Number.NaN),p));
  assert.throws(()=>simulate(f(100),{...p,initialStorage:5000}));assert.throws(()=>simulate([],p));
});

const snapshot=JSON.parse(readFileSync(new URL('../data/snapshot.json',import.meta.url),'utf8')) as Snapshot;
test('real snapshot contains seven finite forecast days and an executed chronological holdout',()=>{
  const forecast=getInflowForecast(snapshot);assert.equal(forecast.length,7);assert.ok(forecast.every(d=>Number.isFinite(d.flow)&&d.date>snapshot.today));
  const ml=analyzeForecast(snapshot);assert.equal(ml.validation.length,14);assert.ok(ml.samples>=100);assert.ok(Number.isFinite(ml.mae));assert.ok(Number.isFinite(ml.baselineMae));
  assert.equal(ml.forecasts.length,7);assert.ok(ml.forecasts.every(d=>Number.isFinite(d.flow)&&d.flow>=0));
});
test('future target values cannot leak into model training or historical validation',()=>{
  const changed=structuredClone(snapshot);
  changed.river.daily.time.forEach((date,i)=>{if(date>changed.today)changed.river.daily.river_discharge[i]=999999;});
  const a=analyzeForecast(snapshot),b=analyzeForecast(changed);
  assert.deepEqual(a.validation,b.validation);assert.deepEqual(a.forecasts,b.forecasts);
});
test('holdout targets are not fitted during training',()=>{
  const original=analyzeForecast(snapshot);const first=original.validation[0];
  const changed=structuredClone(snapshot);const i=changed.river.daily.time.indexOf(first.date);
  changed.river.daily.river_discharge[i]=(first.actual||1)*2;
  near(analyzeForecast(changed).validation[0].predicted,first.predicted);
});

test('missing forecast day is filled by the local model without dropping dates',()=>{
  const changed=structuredClone(snapshot);
  const i=changed.river.daily.time.indexOf(snapshot.today)+3;
  changed.river.daily.river_discharge[i]=null;
  const forecast=getInflowForecast(changed);
  assert.equal(forecast.length,7);assert.equal(forecast[2].source,'local-ml');
  assert.equal(new Set(forecast.map(d=>d.date)).size,7);
});
