import { useEffect, useRef, useState } from 'react';
import { ArrowUp, CheckCircle2, MapPin, MessageSquare, Sparkles, User } from 'lucide-react';
import type { FamilyInputs, GardenInputs } from '../../shared/daily-plans';
import type { EverydayRole, LocationChoice } from '../../shared/local-weather';
import type { Language } from '../../shared/types';
import { consumerStrings } from '../consumer-i18n';
import { shortDate } from '../i18n';
import { Dialog } from './Dialog';

interface Message {id:number;role:'user'|'assistant';text:string;mode?:string;date?:string;error?:boolean}
export function EverydayAssistant({language,role,location,placeName,date,garden,family,duration,onClose}:{
  language:Language;role:EverydayRole;location:LocationChoice;placeName:string;date:string;garden:GardenInputs;family:FamilyInputs;duration:number;onClose:()=>void;
}){
  const c=consumerStrings(language),[messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false);
  const end=useRef<HTMLDivElement>(null),request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[messages,busy]);
  const send=async(text:string)=>{
    if(!text.trim()||busy)return;setMessages(v=>[...v,{id:Date.now(),role:'user',text:text.trim()}]);setInput('');setBusy(true);
    const controller=new AbortController();request.current=controller;
    try{
      const response=await fetch('/api/advice',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]),
        body:JSON.stringify({message:text.trim(),language,role,location,date,garden,family,duration})});
      if(!response.ok)throw new Error();const body=await response.json();
      setMessages(v=>[...v,{id:Date.now()+1,role:'assistant',text:body.answer,mode:body.mode,date:body.date}]);
    }catch{if(!controller.signal.aborted)setMessages(v=>[...v,{id:Date.now()+1,role:'assistant',text:c.aiUnavailable,error:true}]);}
    finally{setBusy(false);}
  };
  const questions=[role==='garden'?c.questionGarden:role==='work'?c.questionWork:c.questionFamily,language==='ru'?'Чем погода сейчас отличается от прогноза на день?':'Обу ҳавои ҳозира аз пешгӯии рӯз чӣ фарқ дорад?'];
  return <Dialog title={c.ask} onClose={onClose} className="assistant-backdrop everyday-assistant-backdrop"><div className="assistant-header"><div className="assistant-logo"><Sparkles size={24}/></div><div><h2>{c.ask}</h2><p>{c[role]}</p></div></div><div className="assistant-context"><MapPin size={14}/>{placeName} · {date?shortDate(date,language):''}</div><div className="messages" aria-live="polite"><div className="assistant-welcome"><Sparkles size={31}/><p>{c.aiText}</p><div className="quick-questions">{questions.map(q=><button key={q} disabled={busy} onClick={()=>void send(q)}><MessageSquare size={15}/>{q}</button>)}</div></div>
      {messages.map(message=><div key={message.id} className={`message ${message.role} ${message.error?'error':''}`}><div className="message-avatar">{message.role==='user'?<User size={15}/>:<Sparkles size={15}/>}</div><div><p>{message.text}</p>{message.role==='assistant'&&!message.error&&<span className="message-source"><CheckCircle2 size={11}/>{message.mode==='llm'?c.llm:c.local}{message.date?` · ${shortDate(message.date,language)}`:''}</span>}</div></div>)}
      {busy&&<div className="message assistant"><span className="spinner"/><p>{c.thinking}</p></div>}<div ref={end}/></div><form className="assistant-form" onSubmit={e=>{e.preventDefault();void send(input);}}><label className="sr-only" htmlFor="daily-question">{c.askPlaceholder}</label><textarea id="daily-question" value={input} maxLength={3000} onChange={e=>setInput(e.target.value)} rows={2} placeholder={c.askPlaceholder} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(input);}}}/><button type="submit" className="button primary icon-button" aria-label={c.send} disabled={busy||!input.trim()}><ArrowUp size={20}/></button></form></Dialog>;
}
