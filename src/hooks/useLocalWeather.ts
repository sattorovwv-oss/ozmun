import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocationChoice, WeatherPayload } from '../../shared/local-weather';
import { weatherIsStale } from '../../shared/local-weather';

export function useLocalWeather(location:LocationChoice){
  const key=JSON.stringify(location);
  const [payload,setPayload]=useState<WeatherPayload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const active=useRef<AbortController|null>(null);
  const payloadKey=useRef<string|null>(null);
  const load=useCallback(async(force=false)=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;
    setLoading(true);setError(false);
    const query=new URLSearchParams(Object.entries(JSON.parse(key)).map(([name,value])=>[name,String(value)]));
    if(force)query.set('refresh','1');
    try{
      const response=await fetch('/api/weather?'+query,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])});
      if(!response.ok)throw new Error('Weather unavailable');
      const body=await response.json() as WeatherPayload;
      if(!body.weather?.current?.at||!body.weather.days.length)throw new Error('Incomplete weather');
      const selected=JSON.parse(key);
      if(selected.city?body.weather.place.id!==selected.city:body.weather.place.latitude!==selected.latitude||body.weather.place.longitude!==selected.longitude)throw new Error('Weather location mismatch');
      if(controller.signal.aborted)return;
      payloadKey.current=key;
      setPayload(body);try{localStorage.setItem('obhush-weather-v3:'+key,JSON.stringify(body));}catch{/* Storage is optional. */}
    }catch{
      if(controller.signal.aborted)return;
      try{
        const saved=JSON.parse(localStorage.getItem('obhush-weather-v3:'+key)||'null') as WeatherPayload|null;
        if(!saved?.weather?.current?.at||!saved.weather.days.length)throw new Error();
        const selected=JSON.parse(key);
        if(selected.city?saved.weather.place.id!==selected.city:saved.weather.place.latitude!==selected.latitude||saved.weather.place.longitude!==selected.longitude)throw new Error();
        payloadKey.current=key;
        setPayload({...saved,stale:true,upstreamUnavailable:true,from:'saved'});
      }catch{setPayload(null);setError(true);}
    }finally{if(!controller.signal.aborted)setLoading(false);}
  },[key]);
  useEffect(()=>{
    setPayload(null);void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},10*60000);
    const online=()=>void load(true);window.addEventListener('online',online);
    const visible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visible);
    return()=>{active.current?.abort();clearInterval(timer);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);};
  },[load]);
  const visiblePayload=payloadKey.current===key&&payload?{...payload,stale:payload.stale||weatherIsStale(payload.weather)}:null;
  return {payload:visiblePayload,loading:loading||(!error&&payloadKey.current!==key),error,refresh:()=>void load(true)};
}
