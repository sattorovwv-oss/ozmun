import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Compass, Layers, Minus, Plus, RotateCcw } from 'lucide-react';
import type { Language, Snapshot } from '../../shared/types';
import { pointConditions } from '../../shared/monitoring';
import { num } from '../i18n';
import { monitoringStrings } from '../monitoring-i18n';

const TerrainMap = lazy(() => import('./TerrainMap'));
const INITIAL = { x: 0, y: 205, w: 1200, h: 730 };
const colors = { quiet: '#17818c', watch: '#d39229', attention: '#da634c', unknown: '#81929b' };
const project = (lon: number, lat: number) => ({ x: (lon - 68.85) / 3.3 * 1200, y: (40.35 - lat) / 2.2 * 1000 });
const river = [[71.95,39.45],[71.55,39.38],[71.12,39.22],[70.75,39.13],[70.43,39.08],[70.19,38.99],[70.05,38.86],[69.9,38.77],[69.78,38.69],[69.69,38.62],[69.57,38.57],[69.46,38.51],[69.43,38.44],[69.35,38.37],[69.25,38.3],[69.17,38.18]].map(([lon, lat]) => project(lon, lat));
const riverPath = river.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');

export function WaterMap({ language, snapshot, date, selected, onSelect, addedRain = 0 }: {
  language: Language; snapshot: Snapshot; date: string; selected: string; onSelect: (id: string) => void; addedRain?: number;
}) {
  const t = monitoringStrings(language);
  const [view, setView] = useState(INITIAL);
  const [mode, setMode] = useState<'map' | '3d'>('map');
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({width:800,height:454});
  useEffect(()=>{
    if(mode!=='map'||!svg.current)return;
    const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setSize({width:rect.width,height:rect.height});});
    observer.observe(svg.current);return()=>observer.disconnect();
  },[mode]);
  const markerScale=.77/Math.min(size.width/view.w,size.height/view.h);
  const zoom = (factor: number) => setView(v => {
    const w = Math.max(350, Math.min(1600, v.w * factor)); const h = w * INITIAL.h / INITIAL.w;
    return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
  });
  return <div className={`water-map ${addedRain ? 'scenario-map' : ''}`}>
    <div className="map-mode-switch"><button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}><Compass size={14}/>{t.geographic}</button><button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}><Layers size={14}/>{t.relief}</button></div>
    {mode === 'map' ? <>
      <svg ref={svg} className="geographic-map" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="group" aria-label={t.mapLabel}
        onPointerDown={event => {
          if ((event.target as Element).closest('[role="button"]')) return;
          drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current || !svg.current) return;
          const scale = Math.min(svg.current.clientWidth / view.w, svg.current.clientHeight / view.h);
          setView(v => ({ ...v, x: Math.max(-250, Math.min(1050, drag.current!.vx - (event.clientX - drag.current!.x) / scale)), y: Math.max(-100, Math.min(850, drag.current!.vy - (event.clientY - drag.current!.y) / scale)) }));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <defs><filter id="map-shadow" x="-40%" y="-70%" width="180%" height="250%"><feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#213b43" floodOpacity=".13"/></filter>
          <linearGradient id="map-wash" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f3f6ef" stopOpacity=".2"/><stop offset="1" stopColor="#fff" stopOpacity=".05"/></linearGradient></defs>
        <rect x="-2000" y="-2000" width="6000" height="6000" fill="#e8ecdf"/>
        <image href="/relief.webp" x="0" y="0" width="1200" height="1000" preserveAspectRatio="none"/>
        <rect width="1200" height="1000" fill="url(#map-wash)"/>
        <g className="map-grid" stroke="#6c80601a" strokeWidth="1" strokeDasharray="3 6">
          {[69,70,71,72].map(lon => <line key={lon} x1={project(lon,40.35).x} y1="0" x2={project(lon,40.35).x} y2="1000"/>)}
          {[38.5,39,39.5,40].map(lat => <line key={lat} x1="0" y1={project(69,lat).y} x2="1200" y2={project(69,lat).y}/>)}
        </g>
        <path d={riverPath} stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".75"/>
        <path d={riverPath} className="river-line" stroke="#56a8bc" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="12 3"/>
        <text x="400" y="660" className="river-name" transform="rotate(-32 400 660)">{language === 'ru' ? 'В А Х Ш' : 'В А Х Ш'}</text>
        <g className="mountain-labels"><text x="480" y="310">{language === 'ru' ? 'Г И С С А Р О - А Л А Й' : 'Ҳ И С О Р У  О Л О Й'}</text><text x="1000" y="715">{language === 'ru' ? 'П А М И Р' : 'П О М И Р'}</text></g>
        {[{lon:69.7736,lat:38.6844,ru:'Рогун',tj:'Роғун'},{lon:70.48,lat:38.70,ru:'Тавильдара',tj:'Тавилдара'},{lon:71.51,lat:39.22,ru:'Лахш',tj:'Лахш'},{lon:69.04,lat:38.55,ru:'Вахдат',tj:'Ваҳдат'}].map(town => {
          const p=project(town.lon,town.lat); return <g key={town.ru} className="map-town"><circle cx={p.x} cy={p.y} r="3"/><text x={p.x+9} y={p.y+5}>{language==='ru'?town.ru:town.tj}</text></g>;
        })}
        {snapshot.weather.map(point => {
          const p = project(point.requested.longitude, point.requested.latitude);
          const condition = pointConditions(point, date, addedRain);
          const active = point.id === selected;
          const name = language === 'ru' ? point.name : point.nameTj;
          return <g key={point.id} transform={`translate(${p.x},${p.y}) scale(${markerScale})`} role="button" tabIndex={0} aria-label={name} aria-pressed={active} className={`weather-map-marker ${active ? 'selected' : ''}`} onClick={() => onSelect(point.id)} onKeyDown={e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(point.id);} }}>
            <circle cx="0" cy="0" r={active?29:23} fill={colors[condition.level]} opacity=".12"/>
            <circle cx="0" cy="0" r="12" fill={colors[condition.level]} stroke="white" strokeWidth="4" filter="url(#map-shadow)"/>
            <g transform="translate(-70,-73)" filter="url(#map-shadow)">
              <rect width="140" height="49" rx="10" fill="white" stroke={active ? colors[condition.level] : '#d8e0d9'} strokeWidth={active?2:1}/>
              <circle cx="17" cy="25" r="4" fill={colors[condition.level]}/>
              <text x="30" y="21" className="marker-name">{name}</text>
              <text x="30" y="37" className="marker-value">{condition.rain===null?'—':num(condition.rain,1)} {language==='ru'?'мм осадков':'мм бориш'}</text>
            </g>
          </g>;
        })}
      </svg>
      <div className="map-north"><span>N</span><Compass size={25}/></div>
      <div className="geographic-map-tools"><button aria-label={t.zoomIn} onClick={()=>zoom(.78)}><Plus size={18}/></button><button aria-label={t.zoomOut} onClick={()=>zoom(1.28)}><Minus size={18}/></button><button aria-label={t.reset} onClick={()=>setView(INITIAL)}><RotateCcw size={16}/></button></div>
      <div className="map-legend"><span><i className="signal-dot quiet"/>{t.quiet}</span><span><i className="signal-dot watch"/>{t.watch}</span><span><i className="signal-dot attention"/>{t.attention}</span></div>
      <div className="geographic-attribution"><span>{t.realRelief}</span><span>{t.schematic}</span></div>
    </> : <Suspense fallback={<div className="map-loading"><span className="spinner"/></div>}><TerrainMap language={language} storagePercent={0} onSelect={id=>onSelect(id==='garm'?'rasht':id==='rogun'?'nurek':id)}/></Suspense>}
  </div>;
}
