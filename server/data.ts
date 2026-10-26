import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import type { Snapshot, WeatherPoint } from '../shared/types';

if(process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());

const nullableNumbers=z.array(z.number().finite().nullable());
const WeatherSchema=z.object({
  latitude:z.number(),longitude:z.number(),elevation:z.number(),
  daily:z.object({time:z.array(z.string()),temperature_2m_mean:nullableNumbers,precipitation_sum:nullableNumbers,snowfall_sum:nullableNumbers}),
});
const RiverSchema=z.object({
  latitude:z.number(),longitude:z.number(),daily:z.object({time:z.array(z.string()),river_discharge:nullableNumbers}),
});
const SnapshotSchema=z.object({version:z.literal(1),retrievedAt:z.iso.datetime(),today:z.iso.date(),
  weather:z.array(WeatherSchema.extend({id:z.string(),name:z.string(),nameTj:z.string(),requested:z.object({latitude:z.number(),longitude:z.number()})})).min(1),
  river:RiverSchema.extend({requested:z.object({latitude:z.number(),longitude:z.number()})}),
});
const root=process.cwd();
const runtimeFile=path.join(root,'data/runtime/snapshot.json');
const bundledFile=path.join(root,'data/snapshot.json');
let memory:Snapshot|null=null;
let refreshPromise:Promise<Snapshot>|null=null;
let lastBackgroundAttempt=0;
function refreshIfOld(snapshot:Snapshot){
  if(Date.now()-Date.parse(snapshot.retrievedAt)>3600000&&Date.now()-lastBackgroundAttempt>15*60000){
    lastBackgroundAttempt=Date.now();void refreshSnapshot().catch(()=>{/* Keep the retained basin dataset. */});
  }
}

export function dushanbeToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dushanbe',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function dateOffset(date:string,days:number){return new Date(new Date(date+'T00:00:00Z').getTime()+days*86400000).toISOString().slice(0,10);}

async function json(url:string){
  const r=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{'User-Agent':'Obhush/1.0 water-resources research application'}});
  if(!r.ok)throw new Error(`Upstream returned ${r.status}`);
  return r.json();
}

export async function loadSnapshot():Promise<Snapshot>{
  if(memory){refreshIfOld(memory);return memory;}
  for(const file of [runtimeFile,bundledFile]){
    try{memory=SnapshotSchema.parse(JSON.parse(await readFile(file,'utf8')));refreshIfOld(memory);return memory;}catch{/* Try the next valid retained snapshot. */}
  }
  return refreshSnapshot();
}

export async function refreshSnapshot():Promise<Snapshot>{
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    const today=dushanbeToday();
    const locations=[
      {id:'nurek',name:'Нурек',nameTj:'Норак',latitude:38.37,longitude:69.35},
      {id:'rasht',name:'Рашт',nameTj:'Рашт',latitude:39.03,longitude:70.38},
      {id:'upper',name:'Верховья',nameTj:'Болооб',latitude:39.4,longitude:71.2},
    ];
    const riverURL=new URL('https://flood-api.open-meteo.com/v1/flood');
    riverURL.search=new URLSearchParams({latitude:'38.37',longitude:'69.35',daily:'river_discharge',start_date:dateOffset(today,-180),end_date:dateOffset(today,7)}).toString();
    const [weather,riverRaw]=await Promise.all([
      Promise.all(locations.map(async p=>{
        const url=new URL('https://api.open-meteo.com/v1/forecast');
        url.search=new URLSearchParams({latitude:String(p.latitude),longitude:String(p.longitude),daily:'temperature_2m_mean,precipitation_sum,snowfall_sum',past_days:'14',forecast_days:'8',timezone:'Asia/Dushanbe'}).toString();
        const r=WeatherSchema.parse(await json(url.toString()));
        return {...r,id:p.id,name:p.name,nameTj:p.nameTj,requested:{latitude:p.latitude,longitude:p.longitude}} satisfies WeatherPoint;
      })),
      json(riverURL.toString()),
    ]);
    const river=RiverSchema.parse(riverRaw);
    if(river.daily.time.length!==river.daily.river_discharge.length||river.daily.river_discharge.filter(v=>v!==null).length<40)throw new Error('Incomplete river data');
    for(const p of weather)for(const key of ['temperature_2m_mean','precipitation_sum','snowfall_sum'] as const)
      if(p.daily[key].length!==p.daily.time.length)throw new Error('Incomplete weather data');
    const snapshot:Snapshot={version:1,today,retrievedAt:new Date().toISOString(),weather,river:{...river,requested:{latitude:38.37,longitude:69.35}}};
    await mkdir(path.dirname(runtimeFile),{recursive:true});
    await writeFile(runtimeFile+'.tmp',JSON.stringify(snapshot));
    await rename(runtimeFile+'.tmp',runtimeFile);
    memory=snapshot;
    return snapshot;
  })();
  try{return await refreshPromise;}finally{refreshPromise=null;}
}

export async function saveBundledSnapshot(){
  const snapshot=await refreshSnapshot();
  await mkdir(path.dirname(bundledFile),{recursive:true});
  await writeFile(bundledFile,JSON.stringify(snapshot,null,2));
  return snapshot;
}
