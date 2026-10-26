import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCheck, Droplets, Leaf, MapPin, Menu, Mountain, Pause, Play, Sparkles, Sprout, Trash2, Users, Waves, Wind, X } from 'lucide-react';
import type { Language, Page } from '../../shared/types';
import { CITIES, localDate } from '../../shared/local-weather';
import type { EverydayRole, LocationChoice } from '../../shared/local-weather';
import type { FamilyInputs, GardenInputs } from '../../shared/daily-plans';
import { consumerStrings } from '../consumer-i18n';
import { num } from '../i18n';
import { useLocalWeather } from '../hooks/useLocalWeather';
import { DailyPlanner, roleIcons } from './DailyPlanner';
import { ConditionIcon, EverydayWeather, weatherTime } from './EverydayWeather';
import { EverydayAssistant } from './EverydayAssistant';
import '../consumer.css';

interface SavedTask {id:string;label:string;done:boolean;createdAt:string;role:EverydayRole;place:string}
function saved<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function initialLocation():LocationChoice{
  const value=saved<LocationChoice>('obhush-everyday-location',{city:'dushanbe'});
  if(value&&typeof value==='object'&&'city'in value&&CITIES.some(city=>city.id===value.city))return value;
  if(value&&typeof value==='object'&&'latitude'in value&&Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&value.latitude>=36.5&&value.latitude<=41.3&&value.longitude>=67&&value.longitude<=75.3)return value;
  return {city:'dushanbe'};
}
const ROLES=['garden','work','family'] as const;
export default function Home({language,setLanguage,onExplore}:{language:Language;setLanguage:(value:Language)=>void;onExplore:(page?:Page)=>void}){
  const c=consumerStrings(language),ru=language==='ru';
  const [location,setLocation]=useState<LocationChoice>(initialLocation),[role,setRole]=useState<EverydayRole>(()=>{const r=saved<string>('obhush-everyday-role','garden');return ROLES.includes(r as EverydayRole)?r as EverydayRole:'garden';});
  const {payload,loading,error,refresh}=useLocalWeather(location),weather=payload?.weather;
  const [date,setDate]=useState(''),[garden,setGarden]=useState<GardenInputs>({area:50,coefficient:.85,efficiency:.9,useRain:true});
  const [family,setFamily]=useState<FamilyInputs>({people:4,showerMinutes:8,flow:9,loadsPerWeek:3,litresPerLoad:45}),[duration,setDuration]=useState(2);
  const [tasks,setTasks]=useState<SavedTask[]>(()=>{const values=saved<SavedTask[]>('obhush-everyday-tasks',[]);return Array.isArray(values)?values.filter(t=>t&&typeof t==='object'&&typeof t.id==='string'&&typeof t.label==='string'&&typeof t.done==='boolean').slice(0,30):[];});
  const [assistant,setAssistant]=useState(false),[menu,setMenu]=useState(false),[locating,setLocating]=useState(false),[geoError,setGeoError]=useState<string|null>(null),[toast,setToast]=useState<string|null>(null),[now,setNow]=useState(Date.now());
  const [mobile,setMobile]=useState(()=>matchMedia('(max-width: 700px)').matches),[playing,setPlaying]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const video=useRef<HTMLVideoElement>(null);
  useEffect(()=>{const media=matchMedia('(max-width: 700px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{localStorage.setItem('obhush-everyday-location',JSON.stringify(location));setDate('');},[location]);
  useEffect(()=>localStorage.setItem('obhush-everyday-role',JSON.stringify(role)),[role]);
  useEffect(()=>{try{localStorage.setItem('obhush-everyday-tasks',JSON.stringify(tasks));}catch{/* Optional local checklist. */}},[tasks]);
  useEffect(()=>{if(weather)setDate(previous=>weather.days.some(d=>d.date===previous)?previous:weather.days[0].date);},[weather]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),4000);return()=>clearTimeout(timer);}},[toast]);
  useEffect(()=>{document.body.classList.add('consumer-body');return()=>document.body.classList.remove('consumer-body');},[]);
  const scroll=(id:string)=>{setMenu(false);document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};
  const pickRole=(value:EverydayRole,move=false)=>{setRole(value);if(move)scroll('weather');};
  const chooseLocation=(value:LocationChoice)=>{setGeoError(null);setLocation(value);};
  const geolocate=()=>{
    if(!navigator.geolocation){setGeoError(c.locationError);return;}
    setLocating(true);setGeoError(null);
    navigator.geolocation.getCurrentPosition(position=>{setLocating(false);const {latitude,longitude}=position.coords;
      if(latitude<36.5||latitude>41.3||longitude<67||longitude>75.3){setGeoError(c.unsupported);return;}
      chooseLocation({latitude:Number(latitude.toFixed(4)),longitude:Number(longitude.toFixed(4))});
    },()=>{setLocating(false);setGeoError(c.locationError);},{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
  };
  const city='city'in location?CITIES.find(city=>city.id===location.city):null;
  const placeName=weather?(ru?weather.place.name:weather.place.nameTj):city?(ru?city.name:city.nameTj):c.location;
  const saveTask=(label:string)=>{setTasks(values=>[{id:crypto.randomUUID(),label,role,place:placeName,done:false,createdAt:new Date().toISOString()},...values].slice(0,30));setToast(c.saved);};
  const clip=mobile?'mobile':'desktop';
  return <div className="consumer-site"><a href="#for-you" className="skip-link">{ru?'К содержимому':'Ба муҳтаво'}</a>
    <section className="consumer-hero" aria-label={c.tagline}>
      <div className="hero-film"><video key={clip} ref={video} src={`/media/garden-${clip}.mp4`} poster={`/media/garden-${clip}.jpg`} autoPlay={!matchMedia('(prefers-reduced-motion: reduce)').matches} muted loop playsInline preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} aria-label={c.videoCaption}/><div className="hero-film-shade"/></div>
      <header className="consumer-header"><a className="consumer-brand" href="#" onClick={e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});}}><span><Waves size={27}/></span><div>ОБҲУШ<small>{c.tagline}</small></div></a>
        <nav aria-label={ru?'Главное меню':'Менюи асосӣ'} className={menu?'open':''}><button onClick={()=>scroll('for-you')}>{c.navPeople}</button><button onClick={()=>scroll('weather')}>{c.navWeather}</button><button onClick={()=>onExplore('overview')}>{c.navWater}<ArrowUpRight size={13}/></button><button onClick={()=>scroll('how-it-works')}>{c.navHow}</button></nav>
        <div className="consumer-header-actions"><div className="consumer-language"><button aria-pressed={ru} className={ru?'active':''} onClick={()=>setLanguage('ru')}>RU</button><span>/</span><button aria-pressed={!ru} className={!ru?'active':''} onClick={()=>setLanguage('tj')}>TJ</button></div><button className="header-plan-button" onClick={()=>scroll('planner')}>{c.myPlan}<ArrowUpRight size={14}/></button><button className="consumer-menu-button" onClick={()=>setMenu(v=>!v)} aria-label={menu?c.close:(ru?'Открыть меню':'Кушодани меню')}>{menu?<X size={24}/>:<Menu size={24}/>}</button></div>
      </header>
      <div className="consumer-hero-content content-width"><div className="hero-country"><span/> {c.eyebrow}</div><h1>{c.heroLine1}<br/><em>{c.heroLine2}</em></h1><p>{c.heroText}</p><div className="hero-buttons"><button className="consumer-button lime" onClick={()=>scroll('for-you')}>{c.heroAction}<ArrowUpRight size={19}/></button><button className="hero-secondary" onClick={()=>scroll('how-it-works')}><span><Play size={13} fill="currentColor"/></span>{c.heroSecondary}</button></div><div className="hero-audiences">{ROLES.map(value=><button key={value} onClick={()=>pickRole(value,true)}>{value==='garden'?<Sprout size={14}/>:value==='work'?<Wind size={14}/>:<Users size={14}/>} {c[(value+'Short') as 'gardenShort'|'workShort'|'familyShort']}</button>)}</div></div>
      <div className="hero-bottom content-width"><span className="hero-video-caption">{c.videoCaption}</span><button className="hero-current" onClick={()=>scroll('weather')}><MapPin size={16}/><span><b>{placeName}</b><small>{weather?`${payload?.stale?c.savedWeather:c.now} · ${weatherTime(weather.current.at,language)}`:c.navWeather}</small></span>{weather&&<><strong>{weather.current.temperature===null?'—':num(weather.current.temperature,1)}°</strong><ConditionIcon code={weather.current.code} isDay={weather.current.isDay} size={26}/></>}<ArrowUpRight size={16}/></button><button className="hero-film-toggle" aria-label={playing?c.pause:c.play} title={playing?c.pause:c.play} onClick={()=>{if(!video.current)return;if(video.current.paused)void video.current.play().catch(()=>setPlaying(false));else video.current.pause();}}>{playing?<Pause size={17}/>:<Play size={17}/>}</button></div>
      <div className="hero-scroll"><span>{c.scroll}</span><ArrowDown size={13}/></div>
    </section>
    <section className="for-you content-width" id="for-you"><div className="consumer-section-heading"><div><span className="consumer-eyebrow">{c.purposeEyebrow}</span><h2>{c.purposeTitle}</h2></div><p>{c.purposeText}</p></div><div className="audience-cards">{ROLES.map((value,i)=>{
      const Icon=roleIcons[value];return <button key={value} className={`audience-card ${value} ${role===value?'selected':''}`} aria-pressed={role===value} onClick={()=>pickRole(value,true)}><div className="audience-card-top"><span>0{i+1}</span><div className="audience-illustration"><Icon size={56} strokeWidth={1.1}/>{value==='garden'?<Droplets size={26} strokeWidth={1.1}/>:value==='work'?<Wind size={28} strokeWidth={1.1}/>:<Leaf size={27} strokeWidth={1.1}/>}</div><ArrowUpRight size={22}/></div><h3>{c[(value+'Title') as 'gardenTitle'|'workTitle'|'familyTitle']}</h3><p>{c[(value+'Text') as 'gardenText'|'workText'|'familyText']}</p><span className="audience-card-action">{role===value?<><Check size={14}/>{c.selected}</>:<>{c.choose}<ArrowRight size={14}/></>}</span></button>;
    })}</div></section>
    <EverydayWeather language={language} location={location} payload={payload} loading={loading} error={error} onLocation={chooseLocation} onGeo={geolocate} locating={locating} geoError={geoError} onRefresh={refresh} date={date} onDate={setDate}/>
    <DailyPlanner language={language} role={role} onRole={value=>pickRole(value)} weather={payload&&!payload.stale?payload.weather:null} date={date} onDate={setDate} garden={garden} onGarden={setGarden} family={family} onFamily={setFamily} duration={duration} onDuration={setDuration} now={now} onSave={saveTask} onAsk={()=>setAssistant(true)} notify={setToast}/>
    <section className="saved-daily-plans content-width"><div><span className="consumer-eyebrow">{c.myPlan}</span><h2>{c.planList}</h2><p>{c.planListText}</p></div><div className="saved-plan-list">{tasks.length?tasks.slice(0,6).map(task=><article key={task.id} className={task.done?'done':''}><button className="task-check" aria-label={c.done} aria-pressed={task.done} onClick={()=>setTasks(values=>values.map(value=>value.id===task.id?{...value,done:!value.done}:value))}>{task.done&&<Check size={14}/>}</button><div><span>{task.place} · {c[task.role]}</span><p>{task.label}</p></div><button className="task-delete" aria-label={c.remove} onClick={()=>setTasks(values=>values.filter(value=>value.id!==task.id))}><Trash2 size={15}/></button></article>):<div className="empty-saved-plan"><CheckCheck size={32}/><p>{c.emptyPlan}</p><button onClick={()=>scroll('planner')}>{c.myPlan}<ArrowRight size={15}/></button></div>}</div></section>
    <section className="consumer-river"><div className="content-width consumer-river-inner"><div className="river-story-art" aria-hidden="true"><img src="/relief.webp" alt="" loading="lazy"/><svg viewBox="0 0 600 400"><path d="M550 30C490 60 520 140 400 150S300 230 240 240 210 300 120 320 80 350 50 400" fill="none" stroke="#b7e7d1" strokeWidth="9"/><path d="M550 30C490 60 520 140 400 150S300 230 240 240 210 300 120 320 80 350 50 400" fill="none" stroke="#f0faee" strokeWidth="2"/><circle cx="400" cy="150" r="12" fill="#d9f3b4"/><circle cx="120" cy="320" r="10" fill="#d9f3b4"/></svg><div><Waves size={24}/><span>ВАХШ · ОБҲУШ</span></div><small>{ru?'Иллюстрация пути воды':'Тасвири роҳи об'}</small></div><div className="river-story-copy"><span className="consumer-eyebrow">{c.riverEyebrow}</span><h2>{c.riverTitle}</h2><p>{c.riverText}</p><button className="consumer-button light" onClick={()=>onExplore('overview')}>{c.riverButton}<ArrowUpRight size={18}/></button><span className="river-story-meta">{c.riverSub}</span></div></div></section>
    <section className="how-it-works content-width" id="how-it-works"><div className="consumer-section-heading"><div><span className="consumer-eyebrow">{c.howEyebrow}</span><h2>{c.howTitle}</h2></div></div><div className="consumer-steps">{[1,2,3].map(step=><article key={step}><span>0{step}</span><h3>{c[('step'+step) as 'step1'|'step2'|'step3']}</h3><p>{c[('step'+step+'Text') as 'step1Text'|'step2Text'|'step3Text']}</p></article>)}</div></section>
    <section className="consumer-ai content-width"><div className="consumer-ai-art"><Sparkles size={36}/><span>ОБ</span></div><div><span className="consumer-eyebrow">ОБҲУШ AI</span><h2>{c.aiTitle}</h2><p>{c.aiText}</p></div><button className="consumer-button solid" onClick={()=>setAssistant(true)}>{c.ask}<ArrowUpRight size={18}/></button></section>
    <footer className="consumer-footer content-width"><div className="consumer-brand"><span><Waves size={25}/></span><div>ОБҲУШ<small>{c.footer}</small></div></div><div><span>© 2026 · Тоҷикистон</span><button onClick={()=>onExplore('sources')}>{c.sources}<ArrowUpRight size={13}/></button></div></footer>
    {toast&&<div role="status" className="consumer-toast"><Check size={17}/>{toast}<button aria-label={c.close} onClick={()=>setToast(null)}><X size={16}/></button></div>}
    {assistant&&<EverydayAssistant key={JSON.stringify(location)+role} language={language} role={role} location={location} placeName={placeName} date={date||localDate(now)} garden={garden} family={family} duration={duration} onClose={()=>setAssistant(false)}/>}
  </div>;
}
