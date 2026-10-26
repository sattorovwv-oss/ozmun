import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CITIES, localDate, weatherIsStale } from '../shared/local-weather';
import type { LocalPlace, LocalWeather, WeatherPayload } from '../shared/local-weather';

const n=z.number().finite();
const temperature=n.min(-90).max(65).nullable(),rain=n.min(0).max(2000).nullable();
const probability=n.min(0).max(100).nullable(),wind=n.min(0).max(150).nullable(),code=n.int().min(0).max(99).nullable();
const timestamps=z.array(n.int().positive()).min(1);
const RawWeatherSchema=z.object({
  latitude:n,longitude:n,elevation:n,utc_offset_seconds:z.literal(18000),timezone:z.literal('Asia/Dushanbe'),
  current_units:z.object({temperature_2m:z.literal('°C'),wind_speed_10m:z.literal('m/s'),precipitation:z.literal('mm')}),
  current:z.object({time:n.int().positive(),temperature_2m:temperature,apparent_temperature:temperature,
    relative_humidity_2m:probability,is_day:z.union([z.literal(0),z.literal(1),z.null()]),precipitation:rain,wind_speed_10m:wind,weather_code:code}),
  hourly:z.object({time:timestamps,temperature_2m:z.array(temperature),precipitation:z.array(rain),
    precipitation_probability:z.array(probability),wind_speed_10m:z.array(wind),weather_code:z.array(code)}),
  daily:z.object({time:timestamps,temperature_2m_min:z.array(temperature),temperature_2m_max:z.array(temperature),
    precipitation_sum:z.array(rain),precipitation_probability_max:z.array(probability),wind_speed_10m_max:z.array(wind),
    et0_fao_evapotranspiration:z.array(n.min(0).max(50).nullable()),sunrise:z.array(n.nullable()),sunset:z.array(n.nullable()),weather_code:z.array(code)}),
});
const iso=(seconds:number)=>new Date(seconds*1000).toISOString();
export function parseWeather(raw:unknown,place:LocalPlace,fetchedAt=new Date().toISOString()):LocalWeather {
  const data=RawWeatherSchema.parse(raw);
  const north=(data.latitude-place.latitude)*111;
  const east=(data.longitude-place.longitude)*111*Math.cos(place.latitude*Math.PI/180);
  if(Math.hypot(north,east)>75)throw new Error('Provider grid does not match the requested location');
  for(const values of Object.values(data.hourly))if(values.length!==data.hourly.time.length)throw new Error('Incomplete hourly weather');
  for(const values of Object.values(data.daily))if(values.length!==data.daily.time.length)throw new Error('Incomplete daily weather');
  return {version:1,place,grid:{latitude:data.latitude,longitude:data.longitude,elevation:data.elevation},fetchedAt,source:'Open-Meteo',
    current:{at:iso(data.current.time),temperature:data.current.temperature_2m,feelsLike:data.current.apparent_temperature,
      humidity:data.current.relative_humidity_2m,isDay:data.current.is_day===null?null:data.current.is_day===1,
      rain:data.current.precipitation,wind:data.current.wind_speed_10m,code:data.current.weather_code},
    hours:data.hourly.time.map((time,i)=>({at:iso(time),temperature:data.hourly.temperature_2m[i],rain:data.hourly.precipitation[i],
      rainProbability:data.hourly.precipitation_probability[i],wind:data.hourly.wind_speed_10m[i],code:data.hourly.weather_code[i]})),
    days:data.daily.time.map((time,i)=>({date:localDate(time*1000),min:data.daily.temperature_2m_min[i],max:data.daily.temperature_2m_max[i],
      rain:data.daily.precipitation_sum[i],rainProbability:data.daily.precipitation_probability_max[i],windMax:data.daily.wind_speed_10m_max[i],
      et0:data.daily.et0_fao_evapotranspiration[i],sunrise:data.daily.sunrise[i]===null?null:iso(data.daily.sunrise[i]!),
      sunset:data.daily.sunset[i]===null?null:iso(data.daily.sunset[i]!),code:data.daily.weather_code[i]}))};
}
export function requestedPlace(input:{city?:string;latitude?:number;longitude?:number}):LocalPlace {
  if(input.city&&(input.latitude!==undefined||input.longitude!==undefined))throw new Error('Choose one location source');
  if(input.city){const city=CITIES.find(c=>c.id===input.city);if(!city)throw new Error('Unknown city');return {...city};}
  if(input.latitude===undefined||input.longitude===undefined||!Number.isFinite(input.latitude)||!Number.isFinite(input.longitude)||
    input.latitude<36.5||input.latitude>41.3||input.longitude<67||input.longitude>75.3)throw new Error('Choose a location in the supported Tajikistan region');
  const latitude=Number(input.latitude.toFixed(4)),longitude=Number(input.longitude.toFixed(4));
  return {id:`p_${latitude}_${longitude}`,name:'Моё местоположение',nameTj:'Ҷойи ман',latitude,longitude};
}
export function forecastURL(place:LocalPlace){
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),timezone:'Asia/Dushanbe',timeformat:'unixtime',
    wind_speed_unit:'ms',forecast_days:'7',
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
    daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,sunrise,sunset,et0_fao_evapotranspiration'}).toString();
  return url;
}
const cache=new Map<string,LocalWeather>(),inflight=new Map<string,Promise<WeatherPayload>>(),attempts=new Map<string,number>();
const root=process.cwd(),directory=path.join(root,'data/runtime/weather');
const fileFor=(place:LocalPlace)=>path.join(directory,place.id+'.json');
const payload=(weather:LocalWeather,from:WeatherPayload['from'],upstreamUnavailable=false):WeatherPayload=>({weather,from,upstreamUnavailable,stale:weatherIsStale(weather)||upstreamUnavailable});
function retain(weather:LocalWeather){cache.delete(weather.place.id);cache.set(weather.place.id,weather);if(cache.size>32){const key=cache.keys().next().value!;cache.delete(key);attempts.delete(key);}}
async function readSaved(place:LocalPlace){
  const files=[fileFor(place),...(place.id==='dushanbe'?[path.join(root,'data/weather-dushanbe.json')]:[])];
  for(const file of files)try{
    const saved=JSON.parse(await readFile(file,'utf8'));
    if(saved.place.latitude!==place.latitude||saved.place.longitude!==place.longitude)continue;
    const weather=parseWeather(saved.raw,place,z.iso.datetime().parse(saved.fetchedAt));retain(weather);return weather;
  }catch{/* A different place is never substituted. */}
  return null;
}
export async function getLocalWeather(place:LocalPlace,force=false):Promise<WeatherPayload>{
  const retained=cache.get(place.id)||await readSaved(place);
  const now=Date.now();
  if(retained&&now-Date.parse(retained.fetchedAt)<10*60000&&!force&&!weatherIsStale(retained))return payload(retained,'cache');
  if(inflight.has(place.id))return inflight.get(place.id)!;
  if(inflight.size>=6){if(retained)return payload(retained,'saved',true);throw new Error('Weather service is busy');}
  if(now-(attempts.get(place.id)||0)<30000){if(retained)return payload(retained,'saved',weatherIsStale(retained));throw new Error('Weather source retry is pending');}
  const task=(async():Promise<WeatherPayload>=>{
    attempts.set(place.id,now);
    if(attempts.size>64)attempts.delete(attempts.keys().next().value!);
    try{
      const response=await fetch(forecastURL(place),{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'OBHUSH/3.0 everyday weather and water planning'}});
      if(!response.ok)throw new Error('Weather provider unavailable');
      const raw:unknown=await response.json(),fetchedAt=new Date().toISOString();
      const weather=parseWeather(raw,place,fetchedAt);retain(weather);
      // Persist only the fixed city catalog; precise locations stay in the bounded
      // memory cache and the visitor's browser, keeping VPS storage bounded.
      if(CITIES.some(city=>city.id===place.id))try{await mkdir(directory,{recursive:true});await writeFile(fileFor(place)+'.tmp',JSON.stringify({place,raw,fetchedAt}));await rename(fileFor(place)+'.tmp',fileFor(place));}catch{/* Valid current data remains available in memory. */}
      return payload(weather,'live');
    }catch{if(retained)return payload(retained,'saved',true);throw new Error('Weather unavailable for the selected location');}
  })();
  inflight.set(place.id,task);
  try{return await task;}finally{inflight.delete(place.id);}
}
