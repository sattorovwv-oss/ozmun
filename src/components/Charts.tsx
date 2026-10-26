import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Language } from '../../shared/types';
import { shortDate } from '../i18n';

export type ChartSeries={key:string;name:string;color:string;dashed?:boolean;area?:boolean};
export function DataChart({data,series,language,height=220,reference,unit='',compact=false}:{
  data:Record<string,unknown>[];series:ChartSeries[];language:Language;height?:number;reference?:number;unit?:string;compact?:boolean;
}){
  return <div className={`data-chart ${compact?'compact':''}`} style={{height}} role="img" aria-label={series.map(s=>s.name).join(', ')}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ComposedChart data={data} margin={{top:12,right:12,bottom:0,left:compact?-20:-8}}>
        <defs>{series.map(s=><linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={.23}/><stop offset="100%" stopColor={s.color} stopOpacity={.01}/></linearGradient>)}</defs>
        <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:10}} tickFormatter={v=>shortDate(String(v),language)} minTickGap={compact?32:40} dy={8}/>
        <YAxis axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:10}} width={compact?47:55} domain={['auto','auto']} tickFormatter={v=>Math.round(v).toLocaleString('ru-RU')}/>
        <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border-strong)',borderRadius:12,color:'var(--text)',fontSize:12,boxShadow:'0 12px 36px #0005'}} labelFormatter={v=>shortDate(String(v),language)} formatter={(value:unknown,name:unknown)=>[`${Number(value).toLocaleString('ru-RU',{maximumFractionDigits:1})} ${unit}`,String(name)]}/>
        {reference!==undefined&&<ReferenceLine y={reference} stroke="#e9b868" strokeDasharray="5 5"/>}
        {series.map(s=>s.area?<Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.4} fill={`url(#grad-${s.key})`} isAnimationActive={false} connectNulls={false}/>:<Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed?'5 5':undefined} dot={false} activeDot={{r:4,strokeWidth:2}} isAnimationActive={false}/>)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

export function Sparkline({values,color='#53dfba'}:{values:number[];color?:string}){
  return <div className="sparkline" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={values.map(v=>({v}))}><Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={.08} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>;
}
