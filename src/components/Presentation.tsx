import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BrainCircuit, Database, Droplets, Globe2, Waves } from 'lucide-react';
import type { Language, Simulation, Snapshot } from '../../shared/types';
import { analyzeForecast } from '../../shared/forecast';
import { num, strings } from '../i18n';
import { Dialog } from './Dialog';

export function Presentation({language,snapshot,result,onClose}:{language:Language;snapshot:Snapshot;result:Simulation;onClose:()=>void}){
  const [slide,setSlide]=useState(0);const t=strings(language);const ml=analyzeForecast(snapshot);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='ArrowRight')setSlide(s=>Math.min(4,s+1));if(e.key==='ArrowLeft')setSlide(s=>Math.max(0,s-1));};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const slides=[{title:t.slide1Title,text:t.slide1Text,icon:Droplets,big:'ОБҲУШ',label:'WATER INTELLIGENCE · TAJIKISTAN'},{title:t.slide2Title,text:t.slide2Text,icon:Database,big:'188 + 3',label:'GloFAS · Open-Meteo · AWS Terrain'},{title:t.slide3Title,text:t.slide3Text,icon:BrainCircuit,big:ml.mae===null?'—':num(ml.mae,2),label:`MAE · ${t.m3s} · ${ml.validation.length} ${language==='ru'?'дней проверки':'рӯзи санҷиш'}`},{title:t.slide4Title,text:t.slide4Text,icon:Waves,big:`${num(result.energy,1)}`,label:`${t.gwh} · ${t.scenarioCalculation}`},{title:t.slide5Title,text:t.slide5Text,icon:Globe2,big:'01 → ∞',label:t.basin}];
  const s=slides[slide];
  return <Dialog title={t.presentation} onClose={onClose} className="presentation-backdrop"><div className="presentation-slide"><div className="presentation-brand"><img src="/favicon.svg" alt=""/>ОБҲУШ<span>WATER INTELLIGENCE</span></div><div className="presentation-content" key={slide}><s.icon size={38}/><div className="presentation-big">{s.big}</div><div className="eyebrow">{s.label}</div><h1>{s.title}</h1><p>{s.text}</p></div><div className="presentation-controls"><button className="button secondary" disabled={slide===0} onClick={()=>setSlide(v=>v-1)}><ArrowLeft size={16}/>{t.previous}</button><div className="slide-dots">{slides.map((_,i)=><button key={i} aria-label={`${i+1}`} className={i===slide?'active':''} onClick={()=>setSlide(i)}/>)}</div><button className="button primary" onClick={()=>slide===4?onClose():setSlide(v=>v+1)}>{slide===4?t.finish:t.next}<ArrowRight size={16}/></button></div></div></Dialog>;
}
