import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Compass, Droplets, Info, LoaderCircle, MapPin, Moon, RefreshCw, Sun, Wind } from 'lucide-react';
import type { Language } from '../../shared/types';
import { CITIES, localDate, weatherKind } from '../../shared/local-weather';
import type { LocalWeather, LocationChoice, WeatherPayload } from '../../shared/local-weather';
import { consumerStrings } from '../consumer-i18n';
import { num, shortDate } from '../i18n';

export function ConditionIcon({code,isDay=true,size=28}:{code:number|null;isDay?:boolean|null;size?:number}){
  const kind=weatherKind(code);
  const Icon=kind==='clear'?(isDay===false?Moon:Sun):kind==='partly'?(isDay===false?Cloud:CloudSun):kind==='rain'?CloudRain:kind==='snow'?CloudSnow:kind==='storm'?CloudLightning:kind==='fog'?CloudFog:Cloud;
  return <Icon size={size} strokeWidth={1.35}/>;
}
export function weatherTime(at:string,language:Language){return new Date(at).toLocaleTimeString(language==='ru'?'ru-RU':'tg-TJ',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'});}
export function EverydayWeather({language,location,payload,loading,error,onLocation,onGeo,locating,geoError,onRefresh,date,onDate}:{
  language:Language;location:LocationChoice;payload:WeatherPayload|null;loading:boolean;error:boolean;onLocation:(value:LocationChoice)=>void;
  onGeo:()=>void;locating:boolean;geoError:string|null;onRefresh:()=>void;date:string;onDate:(value:string)=>void;
}){
  const c=consumerStrings(language),weather=payload?.weather;
  const today=localDate(Date.now()),tomorrow=localDate(Date.now()+86400000);
  return <section className="everyday-weather content-width" id="weather">
    <div className="consumer-section-heading"><div><span className="consumer-eyebrow">{c.weatherEyebrow}</span><h2>{c.weatherTitle}</h2><p>{c.weatherIntro}</p></div>
      <div className="consumer-location"><label><MapPin size={17}/><span className="sr-only">{c.city}</span><select aria-label={c.city} value={'city'in location?location.city:'geo'} onChange={e=>onLocation({city:e.target.value})}>
        {!('city'in location)&&<option value="geo">{c.location}</option>}{CITIES.map(city=><option key={city.id} value={city.id}>{language==='ru'?city.name:city.nameTj}</option>)}
      </select></label><button onClick={onGeo} disabled={locating} title={c.location} aria-label={c.location}>{locating?<LoaderCircle size={18} className="spinning"/>:<Compass size={18}/>}</button></div>
    </div>
    {geoError&&<p className="consumer-inline-error" role="status">{geoError}</p>}
    {weather?<>
      {payload.stale&&<div className="consumer-stale" role="status"><Info size={17}/>{c.stale}</div>}
      <div className={`everyday-weather-grid ${payload.stale?'weather-stale':''}`}>
        <div className="current-weather-card"><div className="current-card-top"><span><i/>{payload.stale?c.savedWeather:c.now}</span><button onClick={onRefresh} disabled={loading} aria-label={c.refresh} title={c.refresh}><RefreshCw size={16} className={loading?'spinning':''}/></button></div>
          <div className="current-city">{language==='ru'?weather.place.name:weather.place.nameTj}</div>
          <div className="current-weather-main"><strong data-testid="current-temperature">{weather.current.temperature===null?'—':num(weather.current.temperature,1)}<span>°</span></strong><div className="current-condition" data-testid="current-condition"><ConditionIcon code={weather.current.code} isDay={weather.current.isDay} size={62}/><b>{c[weatherKind(weather.current.code)]}</b></div></div>
          <p className="current-feels">{c.feels} {weather.current.feelsLike===null?'—':num(weather.current.feelsLike)}°</p>
          <div className="current-weather-extra"><span><Wind size={16}/>{weather.current.wind===null?'—':num(weather.current.wind,1)} {c.ms}</span><span><Droplets size={15}/>{weather.current.humidity===null?'—':num(weather.current.humidity)}%</span></div>
          <div className="current-weather-timestamp"><span>{c.modelAt}: {shortDate(localDate(weather.current.at),language)}, {weatherTime(weather.current.at,language)}</span><span>{c.modelSource}</span></div>
        </div>
        <div className="consumer-forecast"><div className="consumer-forecast-heading"><h3>{c.week}</h3><span>{c.updated}: {weatherTime(weather.fetchedAt,language)}</span></div><div className="consumer-week" aria-label={c.week}>
          {weather.days.map((day,i)=><button key={day.date} className={day.date===date?'selected':''} aria-pressed={day.date===date} aria-label={shortDate(day.date,language)} onClick={()=>onDate(day.date)}>
            <span>{day.date===today?c.today:day.date===tomorrow?c.tomorrow:new Date(day.date+'T12:00:00Z').toLocaleDateString(language==='ru'?'ru-RU':'tg-TJ',{weekday:'short',timeZone:'Asia/Dushanbe'})}</span><b>{shortDate(day.date,language)}</b><ConditionIcon code={day.code} size={27}/><strong>{day.max===null?'—':num(day.max)}°<small>{day.min===null?'—':num(day.min)}°</small></strong><em><Droplets size={11}/>{day.rain===null?'—':num(day.rain,1)} {c.mm}</em><span className="forecast-probability" title={c.rainProbability}>{day.rainProbability===null?'—':num(day.rainProbability)}%</span>
          </button>)}
        </div><p className="forecast-day-note"><Info size={14}/>{c.wholeDay}</p><details className="weather-source-note"><summary>{c.currentNote}</summary><p>{c.modelAt}: {weather.current.at} · UTC+5<br/>{language==='ru'?'Координаты точки / ячейки модели':'Нуқта / ячейкаи модел'}: {weather.place.latitude.toFixed(4)}, {weather.place.longitude.toFixed(4)} / {weather.grid.latitude.toFixed(4)}, {weather.grid.longitude.toFixed(4)}<br/><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo</a></p></details></div>
      </div>
    </>:<div className={`consumer-weather-state ${error?'has-error':''}`} role="status">{loading?<><LoaderCircle size={25} className="spinning"/><p>{c.weatherLoading}</p></>:<><Cloud size={28}/><p>{c.weatherError}</p><button onClick={onRefresh} className="consumer-button outlined">{c.retry}</button></>}</div>}
  </section>;
}
