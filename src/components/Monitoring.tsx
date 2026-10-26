import { ArrowRight, ArrowUpRight, ChevronRight, CloudDrizzle, CloudRain, CloudSun, Droplets, ExternalLink, Info, MapPin, Mountain, MoveUpRight, RotateCcw, ShieldCheck, SlidersHorizontal, Snowflake, Sparkles, Thermometer, TriangleAlert, Waves } from 'lucide-react';
import type { Language, Page, Snapshot, WeatherPoint } from '../../shared/types';
import { monitoringDates, monitoringOverview, pointConditions } from '../../shared/monitoring';
import type { PointConditions } from '../../shared/monitoring';
import { getCurrentFlow, getInflowForecast } from '../../shared/forecast';
import { num, shortDate } from '../i18n';
import { monitoringStrings, signalText } from '../monitoring-i18n';
import { WaterMap } from './WaterMap';
import { DataChart } from './Charts';
import { ForecastPage } from './ForecastPage';

export function WeatherIcon({ condition, size=22 }: { condition: PointConditions; size?: number }) {
  return condition.snow!==null&&condition.snow>0?<Snowflake size={size}/>:condition.rain===null?<CloudSun size={size}/>:condition.rain>=15?<CloudRain size={size}/>:condition.rain>0?<CloudDrizzle size={size}/>:<CloudSun size={size}/>;
}
export function WeekStrip({ language, snapshot, point, date, onDate }: { language:Language; snapshot:Snapshot; point:WeatherPoint; date:string; onDate:(date:string)=>void }) {
  const t=monitoringStrings(language);
  return <div className="week-strip" aria-label={t.week}>{monitoringDates(snapshot).map(day=>{
    const condition=pointConditions(point,day);
    return <button key={day} className={day===date?'selected':''} aria-pressed={day===date} aria-label={shortDate(day,language)} onClick={()=>onDate(day)}>
      <span>{day===snapshot.today?t.today:new Date(day+'T12:00:00Z').toLocaleDateString(language==='ru'?'ru-RU':'tg-TJ',{weekday:'short',timeZone:'Asia/Dushanbe'})}</span>
      <b>{shortDate(day,language)}</b><WeatherIcon condition={condition} size={22}/><strong>{condition.rain===null?'—':num(condition.rain,1)}<small> мм</small></strong>
      <i className={`day-signal ${condition.level}`}/>
    </button>;
  })}</div>;
}
function PointDetail({language,condition}: {language:Language;condition:PointConditions}) {
  const t=monitoringStrings(language);const point=condition.point;
  const reason = condition.level==='quiet'?t.quietReason:condition.level==='watch'?t.watchReason:condition.level==='attention'?t.attentionReason:t.unknownReason;
  return <aside className="point-detail">
    <div className="point-detail-top"><span className="eyebrow">{t.selected}</span><MapPin size={17}/></div>
    <h2>{language==='ru'?point.name:point.nameTj}</h2><p className="point-coordinates">{point.requested.latitude.toFixed(2)}° N · {point.requested.longitude.toFixed(2)}° E</p>
    <div className={`point-signal ${condition.level}`}><span className={`signal-dot ${condition.level}`}/>{signalText(condition.level,language)}</div>
    <div className="point-weather-main"><div><span>{t.rain} · {shortDate(condition.date,language)}</span><strong data-testid="point-rain">{condition.rain===null?'—':num(condition.rain,1)}<small>мм</small></strong><p>{t.dayRain}{condition.scenario&&<b> · {t.scenarioActive}</b>}</p></div><WeatherIcon condition={condition} size={52}/></div>
    <div className="point-weather-other"><div><Thermometer size={16}/><span>{t.temperature}</span><b>{condition.temperature===null?'—':num(condition.temperature,1)}°</b></div><div><Snowflake size={16}/><span>{t.snow}</span><b>{condition.snow===null?'—':num(condition.snow,1)} {language==='ru'?'см':'см'}</b></div></div>
    <div className="point-explanation"><span className="eyebrow">{language==='ru'?'ПОЧЕМУ ТАКОЙ СИГНАЛ':'САБАБИ АЛОМАТ'}</span><p>{reason}</p></div>
    <div className="signal-disclosure"><Info size={13}/><span>{t.signalNote}</span></div>
  </aside>;
}
export function RainScenario({language,value,onChange}: {language:Language;value:number;onChange:(value:number)=>void}) {
  const t=monitoringStrings(language);
  return <div className={`rain-scenario ${value?'is-active':''}`}><div className="scenario-icon"><SlidersHorizontal size={22}/></div><div className="rain-scenario-text"><h3>{t.scenarioTitle}{value>0&&<span className="scenario-badge">{t.scenarioActive}</span>}</h3><p>{t.scenarioText}</p><span className="scenario-caveat">{t.scenarioNote}</span></div><div className="rain-scenario-input"><div><label htmlFor="additional-rain">{t.scenarioLabel}</label><output htmlFor="additional-rain">+{value} <small>мм</small></output></div><input id="additional-rain" type="range" min="0" max="60" step="5" value={value} onChange={e=>onChange(Number(e.target.value))}/><div className="rain-range-labels"><span>0</span><span>30</span><span>60 мм</span></div></div>{value>0&&<button className="scenario-reset" aria-label={t.scenarioReset} title={t.scenarioReset} onClick={()=>onChange(0)}><RotateCcw size={18}/></button>}</div>;
}

export function MonitoringDashboard({language,snapshot,date,onDate,selected,onSelect,addedRain,onRain,go,onAssistant,mapOnly=false}: {
  language:Language;snapshot:Snapshot;date:string;onDate:(date:string)=>void;selected:string;onSelect:(id:string)=>void;addedRain:number;onRain:(value:number)=>void;go:(page:Page)=>void;onAssistant:()=>void;mapOnly?:boolean;
}) {
  const t=monitoringStrings(language);const overview=monitoringOverview(snapshot);const current=getCurrentFlow(snapshot);
  const point=snapshot.weather.find(p=>p.id===selected)||snapshot.weather[0];
  const condition=pointConditions(point,date,addedRain);
  const signal=overview.next72;const watch=signal?.level==='watch'||signal?.level==='attention';
  return <>
    {!mapOnly&&<><section className={`situation-banner ${watch?'watch':'quiet'}`}>
      <div className="situation-symbol">{watch?<CloudRain size={29}/>:<ShieldCheck size={29}/>}</div>
      <div className="situation-copy"><span className="eyebrow">{t.outlook}</span><h2>{!overview.complete?t.unknownTitle:watch?t.watchTitle:t.quietTitle}</h2><p>{watch&&signal?`${language==='ru'?signal.point.name:signal.point.nameTj} · ${shortDate(signal.date,language)} · ${num(signal.rain!,1)} ${language==='ru'?'мм за сутки':'мм дар шабонарӯз'}. `:''}{watch?t.watchText:t.quietText}</p></div>
      <button className="banner-link" onClick={()=>go('forecast')}>{t.viewForecast}<ArrowUpRight size={17}/></button>
    </section>
    <div className="water-metrics"><article><div className="metric-icon blue"><CloudRain size={21}/></div><div><span>{t.peakRain}</span><strong>{overview.peak?num(overview.peak.rain!,1):'—'}<small>мм</small></strong><p>{overview.peak?`${language==='ru'?overview.peak.point.name:overview.peak.point.nameTj} · ${shortDate(overview.peak.date,language)}`:t.noData}</p></div><svg className="mini-rain-chart" viewBox="0 0 90 44" aria-hidden="true">{overview.dates.map((day,i)=>{const max=Math.max(0,...snapshot.weather.map(p=>pointConditions(p,day).rain??0));return <rect key={day} x={i*13} y={40-Math.max(3,max*1.6)} width="7" height={Math.max(3,max*1.6)} rx="3" fill={i===2?'#17818c':'#c9e4e5'}/>;})}</svg></article>
      <article><div className="metric-icon teal"><Waves size={21}/></div><div><span>{t.riverFlow}</span><strong>{current?num(current.flow,1):'—'}<small>м³/с</small></strong><p>{t.riverHint}</p></div><svg className="mini-wave-chart" width="85" height="38" viewBox="0 0 85 38" aria-hidden="true"><path d="M0 26 Q10 10 20 20 T40 15 T60 23 T85 10" fill="none" stroke="#79bab7" strokeWidth="2"/></svg></article>
      <article><div className="metric-icon sand"><MapPin size={21}/></div><div><span>{t.locations}</span><strong>{snapshot.weather.length}<small>{language==='ru'?'точки':'нуқта'}</small></strong><p>{t.locationsHint}</p></div><div className="metric-locations"><i/><i/><i/></div></article>
    </div></>}
    <section className="water-map-section"><div className="section-heading"><div><h2>{t.mapTitle}</h2><p>{t.mapIntro}</p></div><span className="map-region"><span className="live-dot"/>{t.region}</span></div>
      <div className="map-workspace"><WaterMap language={language} snapshot={snapshot} date={date} selected={point.id} onSelect={onSelect} addedRain={addedRain}/><PointDetail language={language} condition={condition}/></div>
      <div className="map-timeline"><div className="timeline-heading"><b>{t.week}</b><span>{language==='ru'?point.name:point.nameTj} · {t.forecastData}</span>{addedRain>0&&<span className="scenario-badge">{t.scenarioActive}: +{addedRain} мм</span>}</div><WeekStrip language={language} snapshot={snapshot} point={point} date={date} onDate={onDate}/></div>
    </section>
    <RainScenario language={language} value={addedRain} onChange={onRain}/>
    {!mapOnly&&<><div className="section-heading understanding-heading"><div><h2>{t.understandTitle}</h2><p>{t.understandText}</p></div></div><div className="understanding-grid">{[
      {icon:Waves,title:t.waterCard,text:t.waterText,page:'forecast' as Page,className:'blue'},
      {icon:Mountain,title:t.riskCard,text:t.riskText,page:'safety' as Page,className:'sand'},
      {icon:ShieldCheck,title:t.adviceCard,text:t.adviceText,page:'safety' as Page,className:'teal'},
    ].map(card=><article className="understanding-card" key={card.title}><div className={`metric-icon ${card.className}`}><card.icon size={23}/></div><h3>{card.title}</h3><p>{card.text}</p><button onClick={()=>go(card.page)}>{t.more}<ArrowRight size={15}/></button></article>)}</div>
    <section className="assistant-callout"><div className="callout-icon"><Sparkles size={26}/></div><div><h2>{t.askTitle}</h2><p>{t.askText}</p></div><button className="button primary" onClick={onAssistant}>{t.ask}<ArrowRight size={16}/></button></section></>}
  </>;
}

export function WeatherForecast({language,snapshot,selected,onSelect,onMapDate}: {language:Language;snapshot:Snapshot;selected:string;onSelect:(id:string)=>void;onMapDate:(date:string)=>void}) {
  const t=monitoringStrings(language);const point=snapshot.weather.find(p=>p.id===selected)||snapshot.weather[0];
  const dates=monitoringDates(snapshot);const forecast=getInflowForecast(snapshot);
  const chart=dates.map(date=>({date,rain:pointConditions(point,date).rain}));
  return <><div className="page-title"><div className="eyebrow">{t.forecastData}</div><h1>{t.forecastTitle}</h1><p>{t.forecastIntro}</p></div>
    <div className="location-tabs">{snapshot.weather.map(p=><button key={p.id} className={p.id===point.id?'active':''} onClick={()=>onSelect(p.id)}><MapPin size={15}/>{language==='ru'?p.name:p.nameTj}</button>)}</div>
    <div className="forecast-day-grid">{dates.map(date=>{const c=pointConditions(point,date);return <button className={`forecast-day ${c.level}`} key={date} onClick={()=>onMapDate(date)}><span>{date===snapshot.today?t.today:shortDate(date,language)}</span><WeatherIcon condition={c} size={32}/><strong>{c.temperature===null?'—':num(c.temperature)}°</strong><div><Droplets size={13}/>{c.rain===null?'—':num(c.rain,1)} мм</div><span className={`signal-dot ${c.level}`}/><ChevronRight size={15} className="day-arrow"/></button>;})}</div>
    <div className="forecast-chart-grid"><section className="panel monitoring-chart"><div className="card-heading"><div><h3>{t.rainChart}</h3><p>{language==='ru'?point.name:point.nameTj} · мм / 24 {language==='ru'?'ч':'соат'}</p></div><CloudRain size={22}/></div><DataChart data={chart} language={language} height={250} series={[{key:'rain',name:t.rain,color:'#218b9b',area:true}]} unit="мм"/></section><section className="panel monitoring-chart"><div className="card-heading"><div><h3>{t.riverChart}</h3><p>GloFAS · {language==='ru'?'Нурек · модельный сток':'Норак · маҷрои моделӣ'}</p></div><Waves size={22}/></div><DataChart data={forecast.map(d=>({date:d.date,flow:d.flow}))} language={language} height={250} series={[{key:'flow',name:t.riverFlow,color:'#397ea5',area:true}]} unit="м³/с"/></section></div>
    <div className="inline-note"><Info size={17}/><p>{t.signalNote} {t.signalsText}</p></div>
    <details className="technical-details"><summary><span className="metric-icon blue"><Sparkles size={20}/></span><div><b>{t.technical}</b><p>{t.technicalText}</p></div><ChevronRight size={19}/></summary><div className="technical-content"><ForecastPage language={language} snapshot={snapshot}/></div></details>
  </>;
}

export function SafetyPage({language,go}: {language:Language;go:(page:Page)=>void}) {
  const t=monitoringStrings(language);
  return <><div className="page-title"><div className="eyebrow">{t.product}</div><h1>{t.safetyTitle}</h1><p>{t.safetyIntro}</p></div><div className="hazard-types"><article><div className="hazard-art flood-art"><Waves size={80}/><Waves size={80}/></div><div><span className="eyebrow">01</span><h2>{t.floodTitle}</h2><p>{t.floodText}</p></div></article><article><div className="hazard-art mudflow-art"><Mountain size={88}/><Waves size={55}/></div><div><span className="eyebrow">02</span><h2>{t.mudflowTitle}</h2><p>{t.mudflowText}</p></div></article></div>
    <section className="panel signal-methodology"><div className="section-heading"><div><h2>{t.signalsTitle}</h2><p>{t.signalsText}</p></div></div><div className="threshold-cards">{([{level:'quiet',threshold:t.quietThreshold,text:t.quietReason},{level:'watch',threshold:t.watchThreshold,text:t.watchReason},{level:'attention',threshold:t.attentionThreshold,text:t.attentionReason}] as const).map(item=><article key={item.level}><span className={`signal-dot ${item.level}`}/><h3>{t[item.level]}</h3><b>{item.threshold}</b><p>{item.text}</p></article>)}</div></section>
    <div className="safety-actions">{[{icon:CloudRain,title:t.beforeTitle,text:t.beforeText},{icon:MoveUpRight,title:t.duringTitle,text:t.duringText}].map(item=><article key={item.title}><span className="metric-icon blue"><item.icon size={25}/></span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div><div className="official-callout"><div><ShieldCheck size={24}/><div><h3>{t.official}</h3><p>{language==='ru'?'Комитет по чрезвычайным ситуациям и гражданской обороне Республики Таджикистан':'Кумитаи ҳолатҳои фавқулода ва мудофиаи граждании Ҷумҳурии Тоҷикистон'}</p></div></div><a className="button primary" href="https://kchs.tj/" target="_blank" rel="noreferrer">kchs.tj<ExternalLink size={15}/></a></div><button className="text-link" onClick={()=>go('sources')}>{t.sourceLink}<ArrowRight size={15}/></button>
  </>;
}
