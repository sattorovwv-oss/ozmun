import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import { loadSnapshot, refreshSnapshot } from './data';
import { answerQuestion } from './assistant';
import { validateParameters } from '../shared/model';

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'32kb'}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
const ParametersSchema=z.object({capacity:z.number(),initialStorage:z.number(),release:z.number(),inflowChange:z.number(),irrigationDemand:z.number(),head:z.number(),efficiency:z.number(),turbineLimit:z.number(),area:z.number(),evaporation:z.number(),reservePercent:z.number()}).strict();
const QuestionSchema=z.object({message:z.string().trim().min(1).max(3000),language:z.enum(['ru','tj']),parameters:ParametersSchema,
  monitoring:z.object({pointId:z.enum(['nurek','rasht','upper']).optional(),date:z.iso.date().optional(),addedRain:z.number().min(0).max(60).optional()}).optional()});
let lastRefresh=0;
const visits=new Map<string,{count:number;start:number}>();

app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'obhush',interfaceVersion:2,assistantAvailable:Boolean(process.env.LLM_API_KEY)}));
app.get('/api/data',async(_req,res)=>{
  try{
    const snapshot=await loadSnapshot();
    res.setHeader('Cache-Control','no-store');
    res.json({snapshot,servedFrom:'snapshot',assistantAvailable:Boolean(process.env.LLM_API_KEY),snapshotAgeHours:Math.max(0,(Date.now()-new Date(snapshot.retrievedAt).getTime())/3600000)});
  }catch{res.status(503).json({error:'Data is unavailable. Run npm run data:refresh with access to Open-Meteo.'});}
});
app.post('/api/refresh',async(_req,res)=>{
  if(Date.now()-lastRefresh<60000){res.status(429).json({error:'Please wait 60 seconds before refreshing again.'});return;}
  lastRefresh=Date.now();
  try{
    const snapshot=await refreshSnapshot();
    res.json({snapshot,servedFrom:'live',assistantAvailable:Boolean(process.env.LLM_API_KEY),snapshotAgeHours:0});
  }catch{res.status(502).json({error:'Upstream data is temporarily unavailable. The retained snapshot remains usable.'});}
});
app.post('/api/assistant',async(req,res)=>{
  const parsed=QuestionSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'Invalid question or scenario.'});return;}
  try{validateParameters(parsed.data.parameters);}catch{res.status(400).json({error:'Scenario parameters are outside supported limits.'});return;}
  const ip=req.ip||'local';
  let visit=visits.get(ip);
  if(!visit||Date.now()-visit.start>60000){visit={count:0,start:Date.now()};visits.set(ip,visit);}
  if(visit.count++>=12){res.status(429).json({error:'Too many questions. Please wait a minute.'});return;}
  if(visits.size>1000)for(const [key,value]of visits)if(Date.now()-value.start>60000)visits.delete(key);
  try{res.json(await answerQuestion(parsed.data.message,parsed.data.language,parsed.data.parameters,await loadSnapshot(),parsed.data.monitoring));}
  catch{res.status(502).json({error:'The assistant service is unavailable. Your data and scenario calculations are unaffected.'});}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown API endpoint'}));

if(process.env.NODE_ENV==='production'){
  app.use(express.static(path.resolve('dist'),{maxAge:'1h'}));
  app.get(/.*/,(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
}else{
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true,allowedHosts:true},appType:'spa'});
  app.use(vite.middlewares);
}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error instanceof SyntaxError){res.status(400).json({error:'Malformed JSON'});return;}
  res.status(500).json({error:'Internal server error'});
});
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',(error?:Error)=>{
  if(error){console.error(`OBHUSH could not start on port ${port}: ${error.message}`);process.exitCode=1;return;}
  console.log(`OBHUSH running on port ${port} (${process.env.NODE_ENV||'development'})`);
});
