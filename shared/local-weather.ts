export type EverydayRole = 'garden' | 'work' | 'family';
export type LocationChoice={city:string}|{latitude:number;longitude:number};
export const CITIES = [
  {id:'dushanbe',name:'Душанбе',nameTj:'Душанбе',latitude:38.5598,longitude:68.7870},
  {id:'khujand',name:'Худжанд',nameTj:'Хуҷанд',latitude:40.2833,longitude:69.6167},
  {id:'bokhtar',name:'Бохтар',nameTj:'Бохтар',latitude:37.8364,longitude:68.7803},
  {id:'kulob',name:'Куляб',nameTj:'Кӯлоб',latitude:37.9140,longitude:69.7845},
  {id:'hisor',name:'Гиссар',nameTj:'Ҳисор',latitude:38.5250,longitude:68.5511},
  {id:'tursunzoda',name:'Турсунзаде',nameTj:'Турсунзода',latitude:38.5127,longitude:68.2316},
  {id:'panjakent',name:'Пенджикент',nameTj:'Панҷакент',latitude:39.4952,longitude:67.6093},
  {id:'istaravshan',name:'Истаравшан',nameTj:'Истаравшан',latitude:39.9142,longitude:68.9989},
  {id:'isfara',name:'Исфара',nameTj:'Исфара',latitude:40.1265,longitude:70.6253},
  {id:'khorugh',name:'Хорог',nameTj:'Хоруғ',latitude:37.4897,longitude:71.5530},
  {id:'nurek',name:'Нурек',nameTj:'Норак',latitude:38.3719,longitude:69.3486},
  {id:'rasht',name:'Рашт',nameTj:'Рашт',latitude:39.0287,longitude:70.3745},
] as const;
export interface LocalPlace {id:string;name:string;nameTj:string;latitude:number;longitude:number}
export interface WeatherNow {at:string;temperature:number|null;feelsLike:number|null;humidity:number|null;isDay:boolean|null;rain:number|null;wind:number|null;code:number|null}
export interface WeatherHour {at:string;temperature:number|null;rain:number|null;rainProbability:number|null;wind:number|null;code:number|null}
export interface WeatherDay {date:string;min:number|null;max:number|null;rain:number|null;rainProbability:number|null;windMax:number|null;et0:number|null;sunrise:string|null;sunset:string|null;code:number|null}
export interface LocalWeather {
  version:1;place:LocalPlace;grid:{latitude:number;longitude:number;elevation:number};fetchedAt:string;
  current:WeatherNow;hours:WeatherHour[];days:WeatherDay[];source:'Open-Meteo';
}
export interface WeatherPayload {weather:LocalWeather;stale:boolean;from:'live'|'cache'|'saved';upstreamUnavailable:boolean}
export function localDate(at:string|number):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dushanbe',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function weatherIsStale(weather:LocalWeather,now=Date.now()){
  const currentAge=now-Date.parse(weather.current.at),fetchAge=now-Date.parse(weather.fetchedAt);
  return !Number.isFinite(currentAge)||currentAge>45*60000||currentAge< -20*60000||fetchAge>30*60000||weather.days[0]?.date!==localDate(now);
}
export type WeatherKind='clear'|'partly'|'cloudy'|'fog'|'rain'|'snow'|'storm'|'unknown';
export function weatherKind(code:number|null):WeatherKind {
  if(code===null)return 'unknown';
  if(code===0)return 'clear';if(code===1||code===2)return 'partly';if(code===3)return 'cloudy';
  if(code===45||code===48)return 'fog';if(code>=95)return 'storm';
  if([71,73,75,77,85,86].includes(code))return 'snow';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain';
  return 'unknown';
}
