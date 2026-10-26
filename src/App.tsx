import { Component, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, CircleHelp, Database, LayoutDashboard, Map, MapPin, Menu, Play, RefreshCw, ShieldCheck, Sparkles, Waves, WifiOff, X, Zap } from 'lucide-react';
import type { DatasetResponse, Language, Measurement, Page, Parameters } from '../shared/types';
import { DEFAULT_PARAMETERS, simulate, validateParameters } from '../shared/model';
import { getInflowForecast } from '../shared/forecast';
import { strings } from './i18n';
import { monitoringStrings } from './monitoring-i18n';
import { ScenarioPanel } from './components/ScenarioPanel';
import { Sources } from './components/Sources';
import { Assistant } from './components/Assistant';
import { Presentation } from './components/Presentation';
import { MonitoringDashboard, SafetyPage, WeatherForecast } from './components/Monitoring';
import { exportMonitoringReport, exportReport } from './report';

function stored<T>(name:string,fallback:T):T { try { const raw=localStorage.getItem(name);return raw?JSON.parse(raw):fallback; } catch { return fallback; } }
function initialParameters() { const p=stored('obhush-parameters',DEFAULT_PARAMETERS);try {validateParameters(p);return p;} catch {return DEFAULT_PARAMETERS;} }
class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}> {
  state={error:false};static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<div className="fatal-error"><img src="/favicon.svg" alt=""/><h1>ОБҲУШ</h1><p>Не удалось загрузить страницу. Попробуйте ещё раз.</p><button className="button primary" onClick={()=>{localStorage.removeItem('obhush-parameters');location.reload();}}>Перезагрузить</button></div>:this.props.children;}
}
export default function App(){return <ErrorBoundary><Workspace/></ErrorBoundary>;}

function Workspace(){
  const [language,setLanguage]=useState<Language>(()=>stored<string>('obhush-language','ru')==='tj'?'tj':'ru');
  const [page,setPage]=useState<Page>('overview');
  const [data,setData]=useState<DatasetResponse|null>(null);
  const [parameters,setParameters]=useState<Parameters>(initialParameters);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
  const [refreshing,setRefreshing]=useState(false),[assistant,setAssistant]=useState(false),[presentation,setPresentation]=useState(false);
  const [mobileNav,setMobileNav]=useState(false),[offline,setOffline]=useState(!navigator.onLine);
  const [selected,setSelected]=useState('rasht'),[date,setDate]=useState(''),[addedRain,setAddedRain]=useState(0);
  const [toast,setToast]=useState<{text:string;error:boolean;id:number}|null>(null);
  const t=strings(language),m=monitoringStrings(language);
  const notify=(text:string,error=false)=>setToast({text,error,id:Date.now()});
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),5500);return()=>clearTimeout(timer);}},[toast]);
  useEffect(()=>{localStorage.setItem('obhush-language',JSON.stringify(language));document.documentElement.lang=language==='tj'?'tg':'ru';},[language]);
  useEffect(()=>{localStorage.setItem('obhush-parameters',JSON.stringify(parameters));},[parameters]);
  useEffect(()=>{const off=()=>setOffline(true),on=()=>setOffline(false);window.addEventListener('offline',off);window.addEventListener('online',on);return()=>{window.removeEventListener('offline',off);window.removeEventListener('online',on);};},[]);
  const load=async()=>{
    setLoading(true);setLoadError(false);
    try{
      const response=await fetch('/api/data',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error();
      const body:DatasetResponse=await response.json();if(!body.snapshot.weather.length||!getInflowForecast(body.snapshot).length)throw new Error();
      setData(body);setDate(body.snapshot.today);localStorage.setItem('obhush-data',JSON.stringify(body));
    }catch{
      const cached=stored<DatasetResponse|null>('obhush-data',null);
      if(cached?.snapshot?.weather.length&&getInflowForecast(cached.snapshot).length){setData({...cached,snapshotAgeHours:Math.max(0,(Date.now()-Date.parse(cached.snapshot.retrievedAt))/3600000)});setDate(cached.snapshot.today);setOffline(true);}else setLoadError(true);
    }finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const refresh=async()=>{
    setRefreshing(true);
    try{const response=await fetch('/api/refresh',{method:'POST',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error();const body:DatasetResponse=await response.json();setData(body);setDate(body.snapshot.today);setAddedRain(0);setOffline(false);localStorage.setItem('obhush-data',JSON.stringify(body));notify(t.refreshed);}
    catch{notify(t.refreshError,true);}finally{setRefreshing(false);}
  };
  const snapshot=data?.snapshot;
  const forecast=useMemo(()=>snapshot?getInflowForecast(snapshot):[],[snapshot]);
  const result=useMemo(()=>forecast.length?simulate(forecast,parameters):null,[forecast,parameters]);
  const go=(next:Page)=>{setPage(next);setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});};
  const nav=[{id:'overview',label:m.overview,icon:LayoutDashboard},{id:'map',label:m.map,icon:Map},{id:'forecast',label:m.forecast,icon:CloudIcon},{id:'safety',label:m.safety,icon:ShieldCheck},{id:'sources',label:m.sources,icon:Database}] as const;
  const activeLabel=page==='scenarios'?m.scenarios:nav.find(n=>n.id===page)?.label;
  const applyMeasurement=(measurement:Measurement)=>{
    if(measurement.date>snapshot!.today){notify(language==='ru'?'Дата измерения находится в будущем':'Санаи ченкунӣ дар оянда аст',true);return;}
    if(measurement.storage_mcm>parameters.capacity){notify(language==='ru'?'Запас превышает ёмкость. Измените её в параметрах модели.':'Захира аз ғунҷоиш зиёд аст.',true);return;}
    setParameters(p=>({...p,initialStorage:measurement.storage_mcm}));notify(`${t.appliedMeasurement} · ${measurement.date}`);
  };
  const report=()=>{if(snapshot){if(page==='scenarios'&&result)exportReport(language,parameters,result,snapshot);else exportMonitoringReport(language,snapshot);notify(t.downloaded);}};
  return <div className="app-shell"><a href="#main-content" className="skip-link">{language==='ru'?'К содержимому':'Ба муҳтаво'}</a>
    {mobileNav&&<button className="mobile-backdrop" onClick={()=>setMobileNav(false)} aria-label={t.close}/>}
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <a className="brand" href="#" onClick={event=>{event.preventDefault();go('overview');}}><span className="brand-mark"><Waves size={26}/></span><div><b>ОБҲУШ<span>.</span></b><small>{m.product}</small></div></a>
      <div className="region-select"><span className="region-icon"><MapPin size={17}/></span><div><strong>{m.region}</strong><span>{m.country}</span></div><ChevronRight size={14}/></div>
      <div className="nav-label">{m.section}</div><nav aria-label={m.section}>{nav.map(item=><button key={item.id} className={page===item.id?'active':''} aria-current={page===item.id?'page':undefined} onClick={()=>go(item.id)}><item.icon size={19}/><span>{item.label}</span>{page===item.id&&<ChevronRight size={14}/>}</button>)}</nav>
      <div className="nav-label advanced-nav-label">{m.tools}</div><button className={`advanced-nav ${page==='scenarios'?'active':''}`} onClick={()=>go('scenarios')}><Zap size={18}/>{m.scenarios}<span>LAB</span></button>
      <div className="sidebar-assistant"><span className="assistant-mini-icon"><Sparkles size={19}/></span><h3>{m.askTitle}</h3><p>{m.askText}</p><button disabled={!data} onClick={()=>{setAssistant(true);setMobileNav(false);}}>{m.ask}<ArrowRight size={15}/></button></div>
      <div className="sidebar-bottom"><span className="sidebar-status"><span className="live-dot"/>{language==='ru'?'Открытые данные':'Маълумоти кушода'}</span><span>ОБҲУШ © 2026</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label={m.section} onClick={()=>setMobileNav(v=>!v)}><Menu size={22}/></button><span>{m.country}</span><ChevronRight size={13}/><strong>{activeLabel}</strong></div><div className="topbar-actions"><span className={`connection-state ${offline?'is-offline':''}`}>{offline?<WifiOff size={13}/>:<span className="live-dot"/>}<span>{offline?m.offline:m.saved}</span></span><div className="language-toggle" aria-label="Language"><button onClick={()=>setLanguage('ru')} className={language==='ru'?'active':''} aria-pressed={language==='ru'}>RU</button><button onClick={()=>setLanguage('tj')} className={language==='tj'?'active':''} aria-pressed={language==='tj'}>TJ</button></div><button className="top-help icon-button" aria-label={m.about} onClick={()=>setPresentation(true)} disabled={!snapshot}><CircleHelp size={20}/></button></div></header>
    <main id="main-content" className="main-content">
      {loading?<div className="loading-screen"><span className="brand-mark"><Waves size={30}/></span><span className="spinner"/><h2>{m.loading}</h2><p>{m.loadingText}</p></div>:loadError||!snapshot||!result?<div className="loading-screen"><Database size={40}/><h2>{t.dataError}</h2><button className="button primary" onClick={load}>{t.retry}</button></div>:<>
        {(page==='overview'||page==='map')&&<div className="overview-heading"><div><div className="eyebrow"><span className="tiny-line"/>{m.section} · {m.country}</div><h1>{page==='map'?m.mapTitle:m.title}</h1><p>{page==='map'?m.scope:m.intro}</p></div><button className="button secondary" onClick={()=>setPresentation(true)}><Play size={15}/>{m.about}</button></div>}
        <div className="page-toolbar"><span className="toolbar-date"><span className="live-dot"/>{m.updated}: <b>{new Date(snapshot.retrievedAt).toLocaleString(language==='ru'?'ru-RU':'tg-TJ',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'})}</b><span className="timezone">UTC+5</span></span><div className="toolbar-actions"><button className="button ghost small" onClick={report}><ArrowDownToLine size={14}/>{m.export}</button><button className="button ghost small" disabled={refreshing} onClick={refresh}><RefreshCw size={14} className={refreshing?'spinning':''}/>{refreshing?m.refreshing:m.refresh}</button></div></div>
        {data.snapshotAgeHours>24&&<div className="age-warning"><Bell size={16}/>{m.stale}</div>}
        {(page==='overview'||page==='map')&&<MonitoringDashboard language={language} snapshot={snapshot} date={date||snapshot.today} onDate={setDate} selected={selected} onSelect={setSelected} addedRain={addedRain} onRain={setAddedRain} go={go} onAssistant={()=>setAssistant(true)} mapOnly={page==='map'}/>}
        {page==='forecast'&&<WeatherForecast language={language} snapshot={snapshot} selected={selected} onSelect={setSelected} onMapDate={nextDate=>{setDate(nextDate);setAddedRain(0);go('map');}}/>}
        {page==='safety'&&<SafetyPage language={language} go={go}/>}
        {page==='sources'&&<Sources language={language} snapshot={snapshot} onApply={applyMeasurement} notify={notify}/>}
        {page==='scenarios'&&<><div className="page-title"><div className="eyebrow">WATER LAB</div><h1>{m.scenarios}</h1><p>{m.advancedIntro}</p></div><ScenarioPanel language={language} parameters={parameters} setParameters={setParameters} forecast={forecast} notify={notify} full/></>}
        <footer className="page-footer"><span><Waves size={15}/>{m.footer}</span><span>{m.disclosure}</span></footer>
      </>}
    </main></div>
    {toast&&<div key={toast.id} role="status" className={`toast ${toast.error?'error':''}`}>{toast.error?<Bell size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button className="icon-button" onClick={()=>setToast(null)} aria-label={t.close}><X size={15}/></button></div>}
    {assistant&&data&&<Assistant language={language} parameters={parameters} available={data.assistantAvailable} pointId={selected} date={date||data.snapshot.today} addedRain={addedRain} onClose={()=>setAssistant(false)}/>}
    {presentation&&snapshot&&result&&<Presentation language={language} snapshot={snapshot} result={result} onClose={()=>setPresentation(false)}/>}
  </div>;
}
function CloudIcon({size=20}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15H5a4 4 0 1 1 .8-7.9A6 6 0 0 1 17.5 6 4.5 4.5 0 0 1 18 15h-1M8 18l-1 3M12 17l-1 3M16 18l-1 3"/></svg>;}
