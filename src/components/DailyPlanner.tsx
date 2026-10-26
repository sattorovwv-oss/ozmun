import { ArrowRight, BookmarkPlus, CalendarPlus, Check, ChevronDown, CloudRain, Droplets, Leaf, MoveUpRight, ShieldCheck, Sparkles, Sprout, Users, Wind } from 'lucide-react';
import { familyWater, gardenWater, outdoorWindows } from '../../shared/daily-plans';
import type { FamilyInputs, GardenInputs, WorkWindow } from '../../shared/daily-plans';
import type { EverydayRole, LocalWeather } from '../../shared/local-weather';
import type { Language } from '../../shared/types';
import { consumerStrings } from '../consumer-i18n';
import { num, shortDate } from '../i18n';
import { downloadBlob } from '../report';
import { weatherTime } from './EverydayWeather';

export const roleIcons={garden:Sprout,work:MoveUpRight,family:Users};
export function calendarContent(window:WorkWindow,summary:string){
  const stamp=(at:string)=>new Date(at).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  const escape=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OBHUSH//Daily Plan//RU','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@obihush.site`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(window.start)}`,`DTEND:${stamp(window.end)}`,
    `SUMMARY:${escape(summary)}`,'DESCRIPTION:Weather forecast screening; check the latest weather before starting.','END:VEVENT','END:VCALENDAR'];
  return lines.map(line=>{let output='',length=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(length+bytes>74){output+='\r\n ';length=1;}output+=char;length+=bytes;}return output;}).join('\r\n')+'\r\n';
}

export function DailyPlanner({language,role,onRole,weather,date,onDate,garden,onGarden,family,onFamily,duration,onDuration,now,onSave,onAsk,notify}:{
  language:Language;role:EverydayRole;onRole:(value:EverydayRole)=>void;weather:LocalWeather|null;date:string;onDate:(value:string)=>void;
  garden:GardenInputs;onGarden:(value:GardenInputs)=>void;family:FamilyInputs;onFamily:(value:FamilyInputs)=>void;duration:number;onDuration:(value:number)=>void;
  now:number;onSave:(label:string)=>void;onAsk:()=>void;notify:(text:string)=>void;
}){
  const c=consumerStrings(language),ru=language==='ru';
  let irrigation:ReturnType<typeof gardenWater>=null,household:ReturnType<typeof familyWater>|null=null;
  try{if(weather)irrigation=gardenWater(weather,date,garden);}catch{/* Inputs can be temporarily incomplete while typing. */}
  try{household=familyWater(family);}catch{/* Show no fabricated total. */}
  const windows=weather?outdoorWindows(weather,date,duration,now):[];
  const placeName=weather?(ru?weather.place.name:weather.place.nameTj):'';
  const save=()=>{
    if(role==='garden'&&irrigation)onSave(`${c.garden} · ${placeName} · ${shortDate(date,language)}: ${num(irrigation.litres)} ${c.litres} / ${num(garden.area)} м². ${c.gardenBasis}`);
    if(role==='work'&&windows[0])onSave(`${c.work} · ${placeName} · ${shortDate(date,language)}: ${weatherTime(windows[0].start,language)}–${weatherTime(windows[0].end,language)}.`);
    if(role==='family'&&household)onSave(`${c.family}: ${c.fiveMinutes} ${c.monthlySaving}: ${num(household.savedMonthly)} ${c.litres}.`);
  };
  const hasResult=role==='garden'?Boolean(irrigation):role==='work'?windows.length>0:Boolean(household);
  return <section className="daily-planner content-width" id="planner"><div className="consumer-section-heading"><div><span className="consumer-eyebrow">{c.plannerEyebrow}</span><h2>{c.plannerTitle}</h2><p>{c.plannerText}</p></div><span className="planner-place"><span/>{placeName||c.city}</span></div>
    <div className="planner-role-tabs" aria-label={c.purposeTitle}>{(['garden','work','family'] as const).map(value=>{const Icon=roleIcons[value];return <button key={value} className={value===role?'active':''} aria-pressed={value===role} onClick={()=>onRole(value)}><Icon size={19}/>{c[value]}</button>;})}</div>
    <div className={`planner-card planner-${role}`}>
      <div className="planner-inputs"><div className="planner-section-no">0{role==='garden'?1:role==='work'?2:3} <span>{c[role]}</span></div><h3>{role==='garden'?c.gardenHeading:role==='work'?c.workHeading:c.familyHeading}</h3>
        {role!=='family'&&weather&&<label className="consumer-field plan-date">{c.planningDay}<select value={date} onChange={e=>onDate(e.target.value)}>{weather.days.map(day=><option key={day.date} value={day.date}>{shortDate(day.date,language)}</option>)}</select></label>}
        {role==='garden'&&<><div className="consumer-field-grid"><label className="consumer-field">{c.area}<div className="consumer-number"><input type="number" min="1" max="100000" value={garden.area} onChange={e=>onGarden({...garden,area:Number(e.target.value)})}/><span>м²</span></div></label><label className="consumer-field">{c.crop}<select value={[.85,.9,.75,.7].includes(garden.coefficient)?String(garden.coefficient):'custom'} onChange={e=>{if(e.target.value!=='custom')onGarden({...garden,coefficient:Number(e.target.value)});}}>
          <option value="0.85">{c.tomato}</option><option value="0.9">{c.cucumber}</option><option value="0.75">{c.trees}</option><option value="0.7">{c.greens}</option>{![.85,.9,.75,.7].includes(garden.coefficient)&&<option value="custom">Kc {garden.coefficient}</option>}
        </select></label></div><label className="consumer-field">{c.method}<select value={garden.efficiency} onChange={e=>onGarden({...garden,efficiency:Number(e.target.value)})}><option value="0.9">{c.drip} · 90%</option><option value="0.7">{c.hose} · 70%</option><option value="0.75">{c.sprinkler} · 75%</option></select></label>
          <label className="consumer-checkbox"><input type="checkbox" checked={garden.useRain} onChange={e=>onGarden({...garden,useRain:e.target.checked})}/><span>{c.accountRain}</span></label>
          <details className="calculation-details"><summary>{c.assumptions}<ChevronDown size={14}/></summary><p>{c.gardenFormula}</p><label className="consumer-field">{c.kc}<input type="number" min="0.2" max="1.5" step="0.05" value={garden.coefficient} onChange={e=>onGarden({...garden,coefficient:Number(e.target.value)})}/></label><p>{c.gardenLimit}</p></details></>}
        {role==='work'&&<><p className="planner-description">{c.workIntro}</p><label className="consumer-field">{c.duration}<div className="duration-options">{[1,2,3,4].map(hours=><button key={hours} aria-pressed={duration===hours} className={duration===hours?'active':''} onClick={()=>onDuration(hours)}>{hours} {c.hours}</button>)}</div></label><div className="work-criteria"><span><SunSymbol/>{ru?'Только днём':'Танҳо рӯзона'}</span><span><Wind size={16}/>≤ 8 {c.ms}</span><span><CloudRain size={16}/>≤ 35%</span></div><details className="calculation-details"><summary>{c.assumptions}<ChevronDown size={14}/></summary><p>{c.workRule}</p><p>{c.workLimit}</p></details></>}
        {role==='family'&&<><div className="consumer-field-grid"><label className="consumer-field">{c.people}<div className="consumer-number"><input type="number" min="1" max="12" value={family.people} onChange={e=>onFamily({...family,people:Number(e.target.value)})}/><Users size={17}/></div></label><label className="consumer-field">{c.shower}<div className="consumer-number"><input type="number" min="1" max="30" value={family.showerMinutes} onChange={e=>onFamily({...family,showerMinutes:Number(e.target.value)})}/><span>{ru?'мин':'дақ'}</span></div></label></div><label className="consumer-field">{c.loads}<div className="consumer-range"><input type="range" min="0" max="14" value={family.loadsPerWeek} onChange={e=>onFamily({...family,loadsPerWeek:Number(e.target.value)})}/><output>{family.loadsPerWeek}</output></div></label><details className="calculation-details"><summary>{c.assumptions}<ChevronDown size={14}/></summary><div className="consumer-field-grid"><label className="consumer-field">{c.flow} ({c.litresMinute})<input type="number" min="1" max="25" value={family.flow} onChange={e=>onFamily({...family,flow:Number(e.target.value)})}/></label><label className="consumer-field">{c.loadVolume}<input type="number" min="10" max="150" value={family.litresPerLoad} onChange={e=>onFamily({...family,litresPerLoad:Number(e.target.value)})}/></label></div><p>{c.familyLimit}</p></details></>}
      </div>
      <div className="planner-result">
        {role==='garden'&&(irrigation?<><div className="result-eyebrow"><Droplets size={16}/>{c[role]} · {shortDate(date,language)}</div><div className="irrigation-result" data-testid="garden-litres">{num(irrigation.litres)}<small>{c.litres}</small></div><p className="result-caption">{c.litresDay}</p><div className="irrigation-visual" aria-hidden="true"><span style={{height:`${Math.min(88,Math.max(14,irrigation.netDepth*13))}%`}}/><Droplets size={39}/></div><div className="result-breakdown"><span>{ru?'Испарение':'Бухоршавӣ'} <b>{num(irrigation.et0,2)} {c.mm}</b></span><span>{c.dailyRain} <b>{num(irrigation.rain,1)} {c.mm}</b></span><span>{c.area} <b>{num(garden.area)} м²</b></span></div><p className="planner-result-note"><Leaf size={16}/>{irrigation.rainExpected?c.rainHint:irrigation.cold?c.coldHint:c.gardenBasis}</p></>:<div className="planner-empty"><Droplets size={40}/><p>{c.noGardenData}</p></div>)}
        {role==='work'&&<><div className="result-eyebrow"><MoveUpRight size={16}/>{c.windows}</div>{windows.length>0?<div className="work-windows">{windows.slice(0,3).map((window,i)=><article key={window.start}><span>0{i+1}</span><div><b>{weatherTime(window.start,language)}<small> — </small>{weatherTime(window.end,language)}</b><p>{num(window.minTemperature)}…{num(window.maxTemperature)}° · {c.wind.toLowerCase()} {num(window.wind,1)} {c.ms} · {window.rainProbability}%</p></div><button aria-label={`${c.calendar} ${weatherTime(window.start,language)}`} title={c.calendar} onClick={()=>{downloadBlob(calendarContent(window,`ОБҲУШ · ${c.work} · ${placeName}`),'obhush-work.ics','text/calendar;charset=utf-8');notify(c.calendarSaved);}}><CalendarPlus size={20}/></button></article>)}</div>:<div className="planner-empty"><CloudRain size={42}/><p>{weather?c.noWindows:c.noGardenData}</p></div>}<p className="planner-result-note"><ShieldCheck size={16}/>{c.workLimit}</p></>}
        {role==='family'&&household&&<><div className="result-eyebrow"><Droplets size={16}/>{c.estimatedUse}</div><div className="family-total">{num(household.totalDaily)}<small>{c.litres}</small></div><div className="family-comparison"><div><span>{ru?'Ваши параметры':'Параметрҳои шумо'}</span><b>{num(household.totalDaily)} {c.litres}</b></div><i><span style={{width:'100%'}}/></i><div><span>{ru?'Душ до 5 минут':'Душ то 5 дақиқа'}</span><b>{num(household.targetDaily)} {c.litres}</b></div><i className="efficient"><span style={{width:`${household.targetDaily/household.totalDaily*100}%`}}/></i></div><div className="family-saving"><Leaf size={20}/><div><span>{c.monthlySaving}</span><strong data-testid="family-saving">{num(household.savedMonthly)} <small>{c.litres}</small></strong><p>{c.fiveMinutes}</p></div></div><p className="planner-result-note">{c.familyLimit}</p></>}
        <div className="planner-result-actions"><button className="consumer-button solid" disabled={!hasResult} onClick={save}><BookmarkPlus size={17}/>{c.savePlan}</button><button className="planner-ask" onClick={onAsk}><Sparkles size={17}/>{c.ask}<ArrowRight size={15}/></button></div>
      </div>
    </div>
  </section>;
}
function SunSymbol(){return <svg width="17" height="17" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>;}
