import type { LocalWeather, WeatherHour } from './local-weather';
export interface GardenInputs {area:number;coefficient:number;efficiency:number;useRain:boolean}
export interface FamilyInputs {people:number;showerMinutes:number;flow:number;loadsPerWeek:number;litresPerLoad:number}
export interface WorkWindow {start:string;end:string;hours:number;rainProbability:number;wind:number;minTemperature:number;maxTemperature:number}
const valid=(v:number,min:number,max:number)=>Number.isFinite(v)&&v>=min&&v<=max;
export function gardenWater(weather:LocalWeather,date:string,input:GardenInputs){
  if(!valid(input.area,1,100000)||!valid(input.coefficient,.2,1.5)||!valid(input.efficiency,.3,1))throw new Error('Invalid garden inputs');
  const day=weather.days.find(d=>d.date===date);
  if(!day||day.et0===null||day.rain===null)return null;
  const cropNeed=day.et0*input.coefficient;
  const effectiveRain=input.useRain?day.rain*.7:0;
  const netDepth=Math.max(0,cropNeed-effectiveRain);
  return {et0:day.et0,rain:day.rain,cropNeed,effectiveRain,netDepth,litres:netDepth*input.area/input.efficiency,
    rainExpected:day.rain>=3,cold:day.min!==null&&day.min<3};
}
export function outdoorWindows(weather:LocalWeather,date:string,duration=2,now=Date.now()):WorkWindow[]{
  if(!Number.isInteger(duration)||duration<1||duration>6)throw new Error('Invalid work duration');
  const day=weather.days.find(d=>d.date===date);
  if(!day?.sunrise||!day.sunset)return [];
  const start=Date.parse(day.sunrise),end=Date.parse(day.sunset);
  const suitable=(h:WeatherHour)=>Date.parse(h.at)>=Math.max(start,now)&&Date.parse(h.at)+3600000<=end&&
    h.temperature!==null&&h.temperature>=5&&h.temperature<=32&&h.rain!==null&&h.rain<.2&&
    h.rainProbability!==null&&h.rainProbability<=35&&h.wind!==null&&h.wind<=8;
  const windows:WorkWindow[]=[];
  for(let index=0;index<weather.hours.length;index++){
    const group=weather.hours.slice(index,index+duration);
    if(group.length!==duration||!group.every(suitable)||group.some((h,i)=>i>0&&Date.parse(h.at)-Date.parse(group[i-1].at)!==3600000))continue;
    if(windows.length&&Date.parse(group[0].at)<Date.parse(windows.at(-1)!.end))continue;
    windows.push({start:group[0].at,end:new Date(Date.parse(group.at(-1)!.at)+3600000).toISOString(),hours:duration,
      rainProbability:Math.max(...group.map(h=>h.rainProbability!)),wind:Math.max(...group.map(h=>h.wind!)),
      minTemperature:Math.min(...group.map(h=>h.temperature!)),maxTemperature:Math.max(...group.map(h=>h.temperature!))});
  }
  return windows;
}
export function familyWater(input:FamilyInputs){
  if(!Number.isInteger(input.people)||!valid(input.people,1,12)||!valid(input.showerMinutes,1,30)||!valid(input.flow,1,25)||!valid(input.loadsPerWeek,0,14)||!valid(input.litresPerLoad,10,150))throw new Error('Invalid family inputs');
  const showers=input.people*input.showerMinutes*input.flow;
  const laundry=input.loadsPerWeek*input.litresPerLoad/7;
  const efficientShowers=input.people*Math.min(input.showerMinutes,5)*input.flow;
  const savedDaily=showers-efficientShowers;
  return {showers,laundry,totalDaily:showers+laundry,savedDaily,savedMonthly:savedDaily*30,targetDaily:efficientShowers+laundry};
}
