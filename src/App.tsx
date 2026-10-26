import { Component, Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Bell, BrainCircuit, Check, ChevronDown, ChevronRight, CloudRain, CloudSun, Database, Droplets, ExternalLink, Globe2, LayoutDashboard, Leaf, Menu, Play, RefreshCw, Settings2, ShieldCheck, Snowflake, Sparkles, Waves, Wifi, WifiOff, X, Zap } from 'lucide-react';
import type { DatasetResponse, Language, Measurement, Page, Parameters, Snapshot } from '../shared/types';
import { DEFAULT_PARAMETERS, simulate, validateParameters } from '../shared/model';
import { getCurrentFlow, getInflowForecast } from '../shared/forecast';
import { num, shortDate, strings } from './i18n';
import { DataChart, Sparkline } from './components/Charts';
import { ScenarioPanel } from './components/ScenarioPanel';
import { ForecastPage } from './components/ForecastPage';
import { Sources } from './components/Sources';
import { Assistant } from './components/Assistant';
import { Presentation } from './components/Presentation';
import { exportReport } from './report';

const TerrainMap=lazy(()=>import('./components/TerrainMap'));
function stored<T>(name:string,fallback:T):T{try{const raw=localStorage.getItem(name);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function initialParameters(){const p=stored('obhush-parameters',DEFAULT_PARAMETERS);try{validateParameters(p);return p;}catch{return DEFAULT_PARAMETERS;}}

class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<div className="fatal-error"><img src="/favicon.svg" alt=""/><h1>ОБҲУШ</h1><p>Не удалось открыть рабочее пространство. Перезагрузите страницу.</p><button className="button primary" onClick={()=>{localStorage.removeItem('obhush-parameters');location.reload();}}>Перезагрузить</button></div>:this.props.children;}
}
export default function App(){return <ErrorBoundary><Workspace/></ErrorBoundary>;}

function Workspace(){
  const [language,setLanguage]=useState<Language>(()=>stored<string>('obhush-language','ru')==='tj'?'tj':'ru');
  const [page,setPage]=useState<Page>('overview');
  const [data,setData]=useState<DatasetResponse|null>(null);
  const [parameters,setParameters]=useState<Parameters>(initialParameters);
  const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState(false);
  const [refreshing,setRefreshing]=useState(false);const [assistant,setAssistant]=useState(false);const [presentation,setPresentation]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);const [offline,setOffline]=useState(!navigator.onLine);
  const [toast,setToast]=useState<{text:string;error:boolean;id:number}|null>(null);
  const t=strings(language);
  const notify=(text:string,error=false)=>setToast({text,error,id:Date.now()});
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),5500);return()=>clearTimeout(timer);}},[toast]);
  useEffect(()=>{localStorage.setItem('obhush-language',JSON.stringify(language));document.documentElement.lang=language==='tj'?'tg':'ru';},[language]);
  useEffect(()=>{localStorage.setItem('obhush-parameters',JSON.stringify(parameters));},[parameters]);
  useEffect(()=>{const off=()=>setOffline(true),on=()=>setOffline(false);window.addEventListener('offline',off);window.addEventListener('online',on);return()=>{window.removeEventListener('offline',off);window.removeEventListener('online',on);};},[]);
  const load=async()=>{
    setLoading(true);setLoadError(false);
    try{const response=await fetch('/api/data',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error();const body:DatasetResponse=await response.json();if(getInflowForecast(body.snapshot).length===0)throw new Error();setData(body);localStorage.setItem('obhush-data',JSON.stringify(body));}
    catch{const cached=stored<DatasetResponse|null>('obhush-data',null);if(cached&&cached.snapshot&&getInflowForecast(cached.snapshot).length){setData({...cached,snapshotAgeHours:Math.max(0,(Date.now()-new Date(cached.snapshot.retrievedAt).getTime())/3600000)});setOffline(true);}else setLoadError(true);}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const refresh=async()=>{
    setRefreshing(true);
    try{const r=await fetch('/api/refresh',{method:'POST',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error();const body:DatasetResponse=await r.json();setData(body);setOffline(false);localStorage.setItem('obhush-data',JSON.stringify(body));notify(t.refreshed);}
    catch{notify(t.refreshError,true);}finally{setRefreshing(false);}
  };
  const snapshot=data?.snapshot;
  const forecast=useMemo(()=>snapshot?getInflowForecast(snapshot):[],[snapshot]);
  const result=useMemo(()=>forecast.length?simulate(forecast,parameters):null,[forecast,parameters]);
  const current=snapshot?getCurrentFlow(snapshot):null;
  const go=(next:Page)=>{setPage(next);setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});};
  const nav=[{id:'overview',label:t.overview,icon:LayoutDashboard},{id:'scenarios',label:t.scenarios,icon:Settings2},{id:'forecast',label:t.forecast,icon:BrainCircuit},{id:'sources',label:t.sources,icon:Database}] as const;
  const applyMeasurement=(m:Measurement)=>{if(m.date>snapshot!.today){notify(language==='ru'?'Дата измерения находится в будущем':'Санаи ченкунӣ дар оянда аст',true);return;}if(m.storage_mcm>parameters.capacity){notify(language==='ru'?'Запас превышает расчётную ёмкость. Сначала измените ёмкость в параметрах модели.':'Захира аз ғунҷоиш зиёд аст. Аввал ғунҷоиши моделро тағйир диҳед.',true);return;}setParameters(p=>({...p,initialStorage:m.storage_mcm}));notify(`${t.appliedMeasurement} · ${m.date}`);};
  const report=()=>{if(snapshot&&result){exportReport(language,parameters,result,snapshot);notify(t.downloaded);}};

  return <div className="app-shell"><a href="#main-content" className="skip-link">{language==='ru'?'К содержимому':'Ба муҳтаво'}</a>{mobileNav&&<button className="mobile-backdrop" onClick={()=>setMobileNav(false)} aria-label={t.close}/>}
    <aside className={`sidebar ${mobileNav?'open':''}`}><a className="brand" href="#" onClick={e=>{e.preventDefault();go('overview');}}><img src="/favicon.svg" alt=""/><div><b>ОБҲУШ<span className="brand-dot">.</span></b><span>WATER INTELLIGENCE</span></div></a><div className="workspace-select"><div className="workspace-avatar"><Waves size={21}/></div><div><strong>{t.basin}</strong><span>{t.region}</span></div><ChevronDown size={13}/></div><div className="nav-label">{t.workspace}</div><nav aria-label={t.workspace}>{nav.map(n=><button key={n.id} className={page===n.id?'active':''} aria-current={page===n.id?'page':undefined} onClick={()=>go(n.id)}><n.icon size={18}/><span>{n.label}</span>{page===n.id&&<span className="nav-active-dot"/>}</button>)}</nav><div className="sidebar-assistant"><div className="assistant-mini-icon"><Sparkles size={18}/></div><b>{t.assistantTitle}</b><p>{t.assistantSubtitle}</p><button onClick={()=>{setAssistant(true);setMobileNav(false);}} disabled={!data}>{t.assistant}<ArrowRight size={14}/></button></div><div className="sidebar-bottom"><span className="sidebar-status"><span className="live-dot"/>{t.research}</span><div><span>v1.0</span><span>© 2026 ОБҲУШ</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label={t.workspace} onClick={()=>setMobileNav(v=>!v)}><Menu size={21}/></button><Globe2 size={15}/><span>{t.region}</span><ChevronRight size={13}/><strong>{nav.find(n=>n.id===page)?.label}</strong></div><div className="topbar-actions"><span className={`connection-state ${offline?'is-offline':''}`}>{offline?<WifiOff size={13}/>:<Wifi size={13}/>}<span>{offline?t.offline:data?.servedFrom==='live'?t.live:t.snapshot}</span></span><div className="language-toggle" aria-label="Language"><button onClick={()=>setLanguage('ru')} className={language==='ru'?'active':''} aria-pressed={language==='ru'}>RU</button><button onClick={()=>setLanguage('tj')} className={language==='tj'?'active':''} aria-pressed={language==='tj'}>TJ</button></div><span className="user-avatar">OH</span></div></header>
    <main id="main-content" className="main-content">
      {loading?<div className="loading-screen"><div className="loading-mark"><img src="/favicon.svg" alt=""/><span/></div><h2>{t.loading}</h2><p>{t.loadingText}</p></div>:loadError||!snapshot||!result?<div className="loading-screen"><Database size={40}/><h2>{t.dataError}</h2><button className="button primary" onClick={load}>{t.retry}</button></div>:<>
        <div className="page-toolbar"><div className="toolbar-date"><span className="live-dot"/>{t.dataTime}: <b>{shortDate(snapshot.today,language)}</b><span className="toolbar-divider"/>{t.lastSync} {new Date(snapshot.retrievedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'})} UTC+5</div><div className="toolbar-actions"><button className="button ghost small" disabled={refreshing} onClick={refresh}><RefreshCw size={14} className={refreshing?'spinning':''}/>{refreshing?t.updating:t.refresh}</button><button className="button secondary small" onClick={()=>setPresentation(true)}><Play size={13}/>{t.presentation}</button></div></div>
        {data.snapshotAgeHours>24&&<div className="age-warning"><Bell size={15}/>{t.ageWarning}</div>}
        {page==='overview'&&<><div className="overview-heading"><div><div className="eyebrow"><span className="tiny-line"/>WATER · ENERGY · FUTURE</div><h1>{t.basin}<span className="heading-dot">.</span></h1><p>{t.subtitle}</p></div><button className="button secondary" onClick={report}><ArrowDownToLine size={15}/>{t.export}</button></div><div className="metrics-grid">
          <div className="panel metric-card teal"><div className="metric-label">{t.flow}<Waves size={17}/></div><div className="metric-value">{current?num(current.flow,1):'—'}<small>{t.m3s}</small></div><div className="metric-foot"><span className="metric-tag">GloFAS</span><span>{t.modelEstimate}</span></div><Sparkline values={snapshot.river.daily.river_discharge.filter((v):v is number=>v!==null).slice(-30)}/></div>
          <div className="panel metric-card"><div className="metric-label">{t.energy}<Zap size={17}/></div><div className="metric-value" data-testid="energy-kpi">{num(result.energy,1)}<small>{t.gwh}</small></div><div className="metric-foot"><span className="metric-dot amber"/>{t.scenarioCalculation}</div><Sparkline values={result.days.map(d=>d.energy)} color="#d9ae72"/></div>
          <div className="panel metric-card"><div className="metric-label">{t.storage}<Droplets size={17}/></div><div className="metric-value">{num(result.finalStorage)}<small>{t.mcm}</small></div><div className="metric-foot"><span className="metric-dot violet"/>{t.initialAssumption}</div><div className="storage-bar"><span style={{width:`${result.finalStorage/parameters.capacity*100}%`}}/></div></div>
          <div className="panel metric-card weather-metric"><div className="metric-label">{t.temperature}<CloudSun size={18}/></div><div className="metric-value">{weatherToday(snapshot.weather[0],snapshot.today,'temperature_2m_mean')===null?'—':num(weatherToday(snapshot.weather[0],snapshot.today,'temperature_2m_mean')!,1)}<small>°C</small></div><div className="metric-foot">{t.weatherModel}</div><CloudSun className="metric-weather-art" size={62}/></div>
        </div><div className="overview-main-grid"><Suspense fallback={<div className="panel terrain-placeholder"><span className="spinner"/></div>}><TerrainMap language={language} storagePercent={result.finalStorage/parameters.capacity*100}/></Suspense><div className="overview-right"><div className="panel forecast-card"><div className="card-heading"><div><h3>{t.forecastTitle}</h3><p>{t.forecastSubtitle}</p></div><button className="icon-button" aria-label={t.viewDetails} onClick={()=>go('forecast')}><ArrowRight size={17}/></button></div><div className="forecast-summary"><strong>{num(forecast.reduce((sum,d)=>sum+d.flow,0)/forecast.length,1)}<small>{t.m3s}</small></strong><span>7 {language==='ru'?'дней':'рӯз'}</span></div><DataChart data={forecast.map(d=>({date:d.date,flow:d.flow}))} series={[{key:'flow',name:t.flow,color:'#53dfba',area:true}]} language={language} height={165} unit={t.m3s} compact/></div><div className="panel weather-card"><div className="card-heading"><div><h3>{t.weatherTitle}</h3><p>{t.pointWeather}</p></div><CloudSun size={17}/></div><div className="weather-locations">{snapshot.weather.map(p=><div className="weather-row" key={p.id}><span className="weather-location-icon">{(weatherToday(p,snapshot.today,'snowfall_sum')||0)>0?<Snowflake size={18}/>:<CloudSun size={18}/>}</span><div><b>{language==='ru'?p.name:p.nameTj}</b><span>{num(p.elevation)} м · {t.rain.toLowerCase()} {num(weatherToday(p,snapshot.today,'precipitation_sum')||0,1)} мм</span></div><strong>{weatherToday(p,snapshot.today,'temperature_2m_mean')===null?'—':num(weatherToday(p,snapshot.today,'temperature_2m_mean')!,1)}°</strong></div>)}</div></div></div></div><ScenarioPanel language={language} parameters={parameters} setParameters={setParameters} forecast={forecast} notify={notify}/><div className="overview-bottom"><div><ShieldCheck size={18}/><span>{t.modelParameters}</span></div><button className="text-link" onClick={()=>go('sources')}>{t.sources}<ArrowRight size={14}/></button></div></>}
        {page==='scenarios'&&<><div className="page-title"><div className="eyebrow">WATER · ENERGY · BALANCE</div><h1>{t.scenarios}</h1><p>{t.balanceNote}</p></div><ScenarioPanel language={language} parameters={parameters} setParameters={setParameters} forecast={forecast} notify={notify} full/></>}
        {page==='forecast'&&<ForecastPage language={language} snapshot={snapshot}/>}
        {page==='sources'&&<Sources language={language} snapshot={snapshot} onApply={applyMeasurement} notify={notify}/>}
        <footer className="page-footer"><span><Droplets size={13}/>{t.footer}</span><span>ОБҲУШ · 2026</span></footer>
      </>}
    </main></div>
    {toast&&<div key={toast.id} role="status" className={`toast ${toast.error?'error':''}`}>{toast.error?<Bell size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button className="icon-button" onClick={()=>setToast(null)} aria-label={t.close}><X size={15}/></button></div>}
    {assistant&&data&&<Assistant language={language} parameters={parameters} available={data.assistantAvailable} onClose={()=>setAssistant(false)}/>}
    {presentation&&snapshot&&result&&<Presentation language={language} snapshot={snapshot} result={result} onClose={()=>setPresentation(false)}/>}
  </div>;
}

function weatherToday(point:Snapshot['weather'][number],date:string,key:'temperature_2m_mean'|'precipitation_sum'|'snowfall_sum'){
  const index=point.daily.time.indexOf(date);return index>=0?point.daily[key][index]:null;
}
