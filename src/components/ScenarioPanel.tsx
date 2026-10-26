import { useMemo, useState } from 'react';
import { ArrowDownToLine, Check, ChevronRight, Droplets, Info, Leaf, Settings2, ShieldCheck, Sparkles, Waves, Zap } from 'lucide-react';
import type { ForecastDay, Language, Parameters } from '../../shared/types';
import { optimize, simulate, validateParameters } from '../../shared/model';
import { num, strings } from '../i18n';
import { DataChart } from './Charts';
import { Dialog } from './Dialog';

export const POLICIES=[{id:'balanced',release:650,icon:Waves},{id:'energyFirst',release:1000,icon:Zap},{id:'reserveFirst',release:400,icon:Leaf}] as const;

export function ScenarioPanel({language,parameters,setParameters,forecast,notify,full=false}:{
  language:Language;parameters:Parameters;setParameters:(p:Parameters)=>void;forecast:ForecastDay[];notify:(s:string,error?:boolean)=>void;full?:boolean;
}){
  const t=strings(language);
  const [advanced,setAdvanced]=useState(false);
  const [draft,setDraft]=useState(parameters);
  const result=useMemo(()=>simulate(forecast,parameters),[forecast,parameters]);
  const comparisons=useMemo(()=>POLICIES.map(policy=>({...policy,result:simulate(forecast,{...parameters,release:policy.release})})),[forecast,parameters]);
  const data=result.days.map((day,i)=>({date:day.date,storage:day.storage,...Object.fromEntries(comparisons.map(c=>[c.id,c.result.days[i].storage]))}));
  const set=(key:keyof Parameters,value:number)=>setParameters({...parameters,[key]:value});
  const csv=()=>{
    const rows=['date,inflow_m3s,release_m3s,storage_mcm,energy_gwh,irrigation_coverage_pct,spill_mcm',...result.days.map(d=>[d.date,d.inflow.toFixed(3),d.release.toFixed(3),d.storage.toFixed(3),d.energy.toFixed(3),d.coverage.toFixed(2),d.spill.toFixed(3)].join(','))];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='obhush-scenario.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const fields=[
    {key:'release',label:t.release,min:0,max:2000,step:25,unit:t.m3s,icon:Waves},
    {key:'inflowChange',label:t.inflowChange,min:-60,max:60,step:5,unit:'%',icon:Droplets},
    {key:'irrigationDemand',label:t.demand,min:0,max:1200,step:25,unit:t.m3s,icon:Leaf},
    {key:'initialStorage',label:t.initial,min:0,max:parameters.capacity,step:1,unit:t.mcm,icon:ShieldCheck},
  ] as const;
  return <section className={`scenario-section ${full?'full-scenario':''}`}>
    <div className="section-heading"><div><div className="eyebrow"><span className="tiny-line"/>SCENARIO LAB</div><h2>{t.simulationTitle}</h2><p>{t.simulationSubtitle}</p></div><button className="button secondary small" onClick={()=>{setDraft(parameters);setAdvanced(true);}}><Settings2 size={15}/>{t.assumptions}</button></div>
    <div className="scenario-layout">
      <div className="panel scenario-controls">
        <div className="policy-tabs">{POLICIES.map(({id,release,icon:Icon})=><button key={id} className={parameters.release===release?'active':''} onClick={()=>set('release',release)}><Icon size={15}/>{t[id]}</button>)}</div>
        <div className="sliders">{fields.map(({key,label,min,max,step,unit,icon:Icon})=><div className="slider-field" key={key}><div className="slider-label"><label htmlFor={`slider-${key}`}><Icon size={14}/>{label}</label><output htmlFor={`slider-${key}`}>{key==='inflowChange'&&parameters[key]>0?'+':''}{num(parameters[key])}<small>{unit}</small></output></div><input id={`slider-${key}`} aria-label={label} type="range" min={min} max={max} step={step} value={parameters[key]} onChange={e=>set(key,Number(e.target.value))} style={{'--range-progress':`${(parameters[key]-min)/(max-min)*100}%`} as React.CSSProperties}/><div className="range-labels"><span>{num(min)}</span><span>{num(max)}</span></div></div>)}</div>
        <button className="button primary optimize-button" onClick={()=>{const best=optimize(forecast,parameters);if(best){setParameters(best.parameters);notify(t.optimized);}else notify(t.noSolution,true);}}><Sparkles size={16}/>{t.optimize}<ChevronRight size={15}/></button><p className="optimization-note">{t.optimizationNote}</p>
      </div>
      <div className="panel scenario-results">
        <div className="card-heading"><div><h3>{t.storageChart}</h3><p>{t.mcm}</p></div><span className={`badge ${result.reserveViolated?'amber':'green'}`}><ShieldCheck size={12}/>{result.reserveViolated?t.violated:t.preserved}</span></div>
        <DataChart data={data} language={language} series={full?[{key:'balanced',name:t.balanced,color:'#6384a8',dashed:true},{key:'energyFirst',name:t.energyFirst,color:'#dfa968',dashed:true},{key:'reserveFirst',name:t.reserveFirst,color:'#8b9fe5',dashed:true},{key:'storage',name:t.custom,color:'#54dfba',area:true}]:[{key:'storage',name:t.endStorage,color:'#54dfba',area:true}]} height={full?245:205} reference={parameters.capacity*parameters.reservePercent/100} unit={t.mcm}/>
        <div className="scenario-result-stats"><div><span><Zap size={13}/>{t.energy}</span><strong data-testid="scenario-energy">{num(result.energy,1)}<small>{t.gwh}</small></strong></div><div><span><Droplets size={13}/>{t.endStorage}</span><strong data-testid="scenario-storage">{num(result.finalStorage)}<small>{t.mcm}</small></strong></div><div><span><Leaf size={13}/>{t.irrigation}</span><strong>{num(result.coverage)}<small>%</small></strong></div></div>
        <div className="model-note"><Info size={14}/><p>{t.balanceNote}</p></div>
      </div>
    </div>
    {full&&<div className="panel comparison-panel"><div className="card-heading"><h3>{t.compare}</h3><button className="button ghost small" onClick={csv}><ArrowDownToLine size={15}/>{t.exportData}</button></div><div className="table-scroll"><table><thead><tr><th>{t.mode}</th><th>{t.release}</th><th>{t.energy}</th><th>{t.endStorage}</th><th>{t.irrigation}</th><th/></tr></thead><tbody>{comparisons.map(c=><tr key={c.id} className={parameters.release===c.release?'selected-row':''}><td><c.icon size={16}/>{t[c.id]}</td><td>{num(c.release)} <small>{t.m3s}</small></td><td>{num(c.result.energy,1)} <small>{t.gwh}</small></td><td>{num(c.result.finalStorage)} <small>{t.mcm}</small></td><td>{num(c.result.coverage)}%</td><td><button className="button ghost small" onClick={()=>set('release',c.release)}>{parameters.release===c.release?<><Check size={14}/>{t.current}</>:t.choose}</button></td></tr>)}</tbody></table></div></div>}
    {advanced&&<Dialog title={t.assumptions} onClose={()=>setAdvanced(false)}><div className="advanced-dialog"><div className="eyebrow">MODEL SETTINGS</div><h2>{t.assumptions}</h2><p>{t.modelParameters}</p><form onSubmit={e=>{e.preventDefault();try{validateParameters(draft);setParameters(draft);setAdvanced(false);}catch{notify(language==='ru'?'Проверьте значения параметров':'Параметрҳоро санҷед',true);}}}><div className="advanced-grid">{([
      ['capacity',t.capacity,t.mcm,1,30000,1],['head',t.head,'м',1,400,1],['efficiency',t.efficiency,'',.1,1,.01],['turbineLimit',t.turbine,t.m3s,1,3000,1],['area',t.area,'км²',0,1000,1],['evaporation',t.evaporation,'мм/д',0,20,.1],['reservePercent',t.reserve,'%',0,90,1],
    ] as const).map(([key,label,unit,min,max,step])=><label className="number-field" key={key}>{label}<div><input type="number" required min={min} max={max} step={step} value={draft[key]} onChange={e=>{const value=Number(e.target.value);setDraft({...draft,[key]:value,...(key==='capacity'?{initialStorage:Math.min(draft.initialStorage,value)}:{})});}}/><span>{unit}</span></div></label>)}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={()=>setAdvanced(false)}>{t.cancel}</button><button className="button primary" type="submit">{t.save}<Check size={15}/></button></div></form></div></Dialog>}
  </section>;
}
