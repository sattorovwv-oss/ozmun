import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, CheckCircle2, MessageSquare, Sparkles, User } from 'lucide-react';
import type { Language, Parameters } from '../../shared/types';
import { strings, shortDate } from '../i18n';
import { Dialog } from './Dialog';
import { monitoringStrings } from '../monitoring-i18n';

interface Message{id:number;role:'user'|'assistant';text:string;mode?:string;error?:boolean}
export function Assistant({language,parameters,available,onClose,pointId,date,addedRain=0}:{language:Language;parameters:Parameters;available:boolean;onClose:()=>void;pointId?:string;date?:string;addedRain?:number}){
  const t=strings(language);
  const m=monitoringStrings(language);
  const pointName=pointId==='nurek'?(language==='ru'?'Нурек':'Норак'):pointId==='upper'?(language==='ru'?'Верховья':'Болооб'):'Рашт';
  const [messages,setMessages]=useState<Message[]>([]);
  const [input,setInput]=useState('');const [busy,setBusy]=useState(false);
  const end=useRef<HTMLDivElement>(null);const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[messages,busy]);
  const send=async(text:string)=>{
    if(!text.trim()||busy)return;
    setMessages(v=>[...v,{id:Date.now(),role:'user',text:text.trim()}]);setInput('');setBusy(true);
    const controller=new AbortController();request.current=controller;
    try{
      const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text.trim(),language,parameters,monitoring:{pointId,date,addedRain}}),signal:controller.signal});
      if(!response.ok)throw new Error();
      const body=await response.json();setMessages(v=>[...v,{id:Date.now()+1,role:'assistant',text:body.answer,mode:body.mode}]);
    }catch(e){if((e as Error).name!=='AbortError')setMessages(v=>[...v,{id:Date.now()+1,role:'assistant',text:t.assistantError,error:true}]);}
    finally{setBusy(false);}
  };
  return <Dialog title={m.askTitle} onClose={onClose} className="assistant-backdrop"><div className="assistant-header"><div className="assistant-logo"><Sparkles size={24}/></div><div><h2>{m.askTitle}</h2><p>{m.askText}</p></div></div><div className={`assistant-mode ${available?'connected':''}`}><span className="live-dot"/>{available?t.llmMode:t.localMode}</div><div className="assistant-context">{pointName}{date&&<> · {shortDate(date,language)}</>}{addedRain>0&&<span className="scenario-badge">{m.scenarioActive}: +{addedRain} мм</span>}</div><div className="messages" aria-live="polite"><div className="assistant-welcome"><Bot size={30}/><p>{m.assistantIntro}</p><div className="quick-questions">{[m.questionRisk,m.questionRain,m.questionMeaning].map(q=><button key={q} disabled={busy} onClick={()=>send(q)}><MessageSquare size={14}/>{q}</button>)}</div></div>{messages.map(m=><div key={m.id} className={`message ${m.role} ${m.error?'error':''}`}><div className="message-avatar">{m.role==='user'?<User size={15}/>:<Sparkles size={15}/>}</div><div><p>{m.text}</p>{m.role==='assistant'&&!m.error&&<span className="message-source"><CheckCircle2 size={11}/>{m.mode==='llm'?t.llmMode:t.localMode}</span>}</div></div>)}{busy&&<div className="message assistant"><span className="spinner"/><p>{t.thinking}</p></div>}<div ref={end}/></div><form className="assistant-form" onSubmit={e=>{e.preventDefault();send(input);}}><label className="sr-only" htmlFor="assistant-input">{m.placeholder}</label><textarea id="assistant-input" maxLength={3000} value={input} onChange={e=>setInput(e.target.value)} placeholder={m.placeholder} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input);}}}/><button className="button primary icon-button" type="submit" disabled={busy||!input.trim()} aria-label={t.send}><ArrowUp size={20}/></button></form></Dialog>;
}
