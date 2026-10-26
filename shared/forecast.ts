import type { ForecastDay, Snapshot } from './types';

type Row = { date: string; flow: number };
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

function features(rows: Row[], i: number): number[] {
  const t = new Date(`${rows[i].date}T00:00:00Z`).getTime() / 86400000;
  return [rows[i-1].flow-rows[i-2].flow, rows[i-2].flow-rows[i-3].flow, (rows[i-1].flow-rows[i-7].flow)/6,
    Math.sin(t * 2 * Math.PI / 365.25), Math.cos(t * 2 * Math.PI / 365.25)];
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let i=col+1;i<n;i++) if (Math.abs(m[i][col]) > Math.abs(m[pivot][col])) pivot=i;
    [m[col],m[pivot]]=[m[pivot],m[col]];
    const scale = m[col][col];
    if (Math.abs(scale) < 1e-12) throw new Error('Singular regression');
    for(let j=col;j<=n;j++) m[col][j]/=scale;
    for(let i=0;i<n;i++) if(i!==col){const f=m[i][col];for(let j=col;j<=n;j++)m[i][j]-=f*m[col][j];}
  }
  return m.map(row=>row[n]);
}

function fit(rows: Row[], end: number, alpha = 2) {
  const x: number[][]=[]; const y: number[]=[];
  for (let i=7;i<end;i++) {
    // Never join gaps in a daily time series as if they were adjacent days.
    if(new Date(rows[i].date).getTime()-new Date(rows[i-7].date).getTime()!==7*86400000)continue;
    x.push(features(rows,i)); y.push(rows[i].flow-rows[i-1].flow);
  }
  if(x.length<16)throw new Error('Not enough contiguous history');
  const mu=x[0].map((_,j)=>mean(x.map(r=>r[j])));
  const sd=mu.map((v,j)=>Math.sqrt(mean(x.map(r=>(r[j]-v)**2)))||1);
  const z=x.map(r=>[1,...r.map((v,j)=>(v-mu[j])/sd[j])]);
  const n=z[0].length;
  const a=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>z.reduce((s,r)=>s+r[i]*r[j],0)+(i===j&&i>0?alpha:0)));
  const b=Array.from({length:n},(_,i)=>z.reduce((s,r,k)=>s+r[i]*y[k],0));
  const weights=solve(a,b);
  const predict=(f:number[],previous:number)=>Math.max(0,previous+weights[0]+f.reduce((s,v,j)=>s+weights[j+1]*(v-mu[j])/sd[j],0));
  return {predict, samples:x.length, weights};
}

export function analyzeForecast(snapshot: Snapshot) {
  const rows: Row[]=snapshot.river.daily.time.map((date,i)=>({date,flow:snapshot.river.daily.river_discharge[i]}))
    .filter((r):r is Row=>valid(r.flow)&&r.date<=snapshot.today);
  const history=rows.slice(-30);
  if(rows.length<40) return {history, validation:[], forecasts:[] as ForecastDay[], available:false,
    samples:0, mae:null as number|null, baselineMae:null as number|null, improvement:null as number|null, fullSamples:0};
  const holdout=Math.min(14,Math.floor(rows.length*.2));
  const split=rows.length-holdout;
  // Choose regularization on two earlier time splits ONLY, never on the final holdout.
  const candidates=[0.2,2,20,200];
  const cv=candidates.map(alpha=>{
    const errors:number[]=[];
    for(const fraction of [.6,.8]){
      const end=Math.floor(split*fraction);
      if(end<30)continue;
      const model=fit(rows,end,alpha);
      for(let i=end;i<Math.min(end+14,split);i++)errors.push(Math.abs(model.predict(features(rows,i),rows[i-1].flow)-rows[i].flow));
    }
    return {alpha,mae:errors.length?mean(errors):Infinity};
  });
  const alpha=cv.reduce((best,v)=>v.mae<best.mae?v:best).alpha;
  const training=fit(rows,split,alpha);
  const validation=rows.slice(split).map((r,k)=>{
    const i=split+k;
    return {date:r.date,actual:r.flow,predicted:training.predict(features(rows,i),rows[i-1].flow),baseline:rows[i-1].flow};
  });
  const mae=mean(validation.map(r=>Math.abs(r.actual-r.predicted)));
  const baselineMae=mean(validation.map(r=>Math.abs(r.actual-r.baseline)));
  const model=fit(rows,rows.length,alpha);
  const futureRows=[...rows];
  const forecasts: ForecastDay[]=[];
  for(let i=0;i<7;i++){
    const date=new Date(new Date(rows.at(-1)!.date+'T00:00:00Z').getTime()+(i+1)*86400000).toISOString().slice(0,10);
    futureRows.push({date,flow:0});
    const flow=model.predict(features(futureRows,futureRows.length-1),futureRows[futureRows.length-2].flow);
    futureRows.at(-1)!.flow=flow;
    forecasts.push({date,flow,source:'local-ml'});
  }
  return {history,validation,forecasts,available:true,samples:training.samples,mae,baselineMae,
    improvement:baselineMae>0?(baselineMae-mae)/baselineMae*100:0,fullSamples:model.samples};
}

export function getInflowForecast(snapshot: Snapshot): ForecastDay[] {
  const glofas=snapshot.river.daily.time.map((date,i)=>({date,flow:snapshot.river.daily.river_discharge[i]}))
    .filter((r):r is Row=>r.date>snapshot.today&&valid(r.flow)).slice(0,7)
    .map(r=>({...r,source:'glofas' as const}));
  if(glofas.length>=7)return glofas;
  const local=analyzeForecast(snapshot).forecasts;
  const byDate=new Map([...local.filter(r=>r.date>snapshot.today),...glofas].map(d=>[d.date,d]));
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,7);
}

export function getCurrentFlow(snapshot: Snapshot) {
  const daily=snapshot.river.daily;
  for(let i=daily.time.length-1;i>=0;i--)if(daily.time[i]<=snapshot.today&&valid(daily.river_discharge[i]))
    return {date:daily.time[i],flow:daily.river_discharge[i] as number};
  return null;
}
