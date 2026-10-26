import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, CloudSun, Database, FileSpreadsheet, Mountain, Settings2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { Language, Measurement, Snapshot } from '../../shared/types';
import { num, strings } from '../i18n';
import { downloadBlob } from '../report';

function readMeasurements():Measurement[]{try{const v=JSON.parse(localStorage.getItem('obhush-measurements')||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
export function Sources({language,snapshot,onApply,notify}:{language:Language;snapshot:Snapshot;onApply:(m:Measurement)=>void;notify:(s:string,error?:boolean)=>void}){
  const t=strings(language);
  const input=useRef<HTMLInputElement>(null);
  const [measurements,setMeasurements]=useState<Measurement[]>(readMeasurements);
  const importCsv=async(file:File)=>{
    if(file.size>1024*1024){notify(t.invalidCsv,true);return;}
    try{
      const text=await file.text();
      const result=Papa.parse<Record<string,string>>(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.replace(/^\uFEFF/,'').trim()});
      if(result.errors.length||!result.data.length||result.data.length>5000)throw new Error();
      const data:Measurement[]=result.data.map(row=>{
        const date=row.date?.trim();const storage=Number(row.storage_mcm);
        if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date).getTime())||new Date(date).toISOString().slice(0,10)!==date||row.storage_mcm?.trim()===''||!Number.isFinite(storage)||storage<0||storage>30000)throw new Error();
        const item:Measurement={date,storage_mcm:storage};
        for(const k of ['inflow_m3s','release_m3s'] as const)if(row[k]?.trim()){const v=Number(row[k]);if(!Number.isFinite(v)||v<0||v>50000)throw new Error();item[k]=v;}
        return item;
      }).sort((a,b)=>a.date.localeCompare(b.date));
      if(new Set(data.map(d=>d.date)).size!==data.length)throw new Error();
      localStorage.setItem('obhush-measurements',JSON.stringify(data));setMeasurements(data);
      notify(`${data.length} ${t.measurementCount}`);
    }catch{notify(t.invalidCsv,true);}
    finally{if(input.current)input.current.value='';}
  };
  const sources=[
    {icon:WavesIcon,title:t.riverSource,text:t.riverDescription,status:t.connected,url:'https://open-meteo.com/en/docs/flood-api',meta:`${snapshot.river.daily.time.length} ${language==='ru'?'дней':'рӯз'} · ${snapshot.river.latitude.toFixed(3)}°N, ${snapshot.river.longitude.toFixed(3)}°E`,kind:'green'},
    {icon:CloudSun,title:t.weatherSource,text:t.weatherDescription,status:t.connected,url:'https://open-meteo.com/en/docs',meta:snapshot.weather.map(p=>`${language==='ru'?p.name:p.nameTj}: ${num(p.elevation)} м`).join(' · '),kind:'green'},
    {icon:Mountain,title:t.terrainSource,text:t.terrainDescription,status:t.connected,url:'https://registry.opendata.aws/terrain-tiles/',meta:'192 × 160 · 30 720 '+(language==='ru'?'точек высоты':'нуқтаи баландӣ'),kind:'green'},
    {icon:Settings2,title:t.infrastructureSource,text:t.infrastructureDescription,status:t.assumed,url:null,meta:t.modelParameters,kind:'amber'},
  ];
  return <><div className="page-title"><div className="eyebrow">DATA PROVENANCE</div><h1>{t.sourcesHeading}</h1><p>{t.sourcesIntro}</p></div><div className="source-cards">{sources.map(({icon:Icon,title,text,status,url,meta,kind})=><article className="panel source-card" key={title}><div className="source-icon"><Icon size={22}/></div><div className="source-content"><div className="source-title"><h3>{title}</h3><span className={`badge ${kind}`}><CheckCircle2 size={12}/>{status}</span></div><p>{text}</p><span className="source-meta">{meta}</span>{url&&<a href={url} target="_blank" rel="noreferrer" className="text-link">{t.openSource}<ArrowUpRight size={14}/></a>}</div></article>)}</div><div className="panel import-panel"><div className="card-heading"><div><h3><FileSpreadsheet size={19}/>{t.importTitle}</h3><p>{t.importText}</p></div></div><div className="csv-format"><code>date,storage_mcm,inflow_m3s,release_m3s</code><span>CSV · UTF-8 · ≤1 MB</span></div><div className="import-actions"><input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label={t.upload} onChange={e=>{const f=e.target.files?.[0];if(f)importCsv(f);}}/><button className="button primary" onClick={()=>input.current?.click()}><Upload size={15}/>{t.upload}</button><button className="button secondary" onClick={()=>downloadBlob('date,storage_mcm,inflow_m3s,release_m3s\n','obhush-measurements-template.csv','text/csv;charset=utf-8')}><ArrowDownToLine size={15}/>{t.sample}</button></div>{measurements.length>0&&<div className="measurement-preview"><div><CheckCircle2 size={17}/><b>{measurements.length} {t.measurementCount}</b><span>{measurements.at(-1)!.date} · {num(measurements.at(-1)!.storage_mcm)} {t.mcm}</span></div><button className="button secondary small" onClick={()=>onApply(measurements.at(-1)!)}>{t.applyMeasurement}</button><button className="icon-button" aria-label={t.clear} onClick={()=>{setMeasurements([]);localStorage.removeItem('obhush-measurements');}}><Trash2 size={15}/></button></div>}</div><div className="panel boundaries-panel"><ShieldCheck size={23}/><div><h3>{t.dataRules}</h3><p>{t.dataRulesText}</p></div></div><div className="source-timestamp"><Database size={13}/>{t.updated}: {new Date(snapshot.retrievedAt).toLocaleString(language==='tj'?'tg-TJ':'ru-RU',{timeZone:'Asia/Dushanbe'})} · UTC+5</div></>;
}
function WavesIcon({size=20}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M2 7c3-5 7 5 10 0s7 5 10 0M2 12c3-5 7 5 10 0s7 5 10 0M2 17c3-5 7 5 10 0s7 5 10 0"/></svg>;}
