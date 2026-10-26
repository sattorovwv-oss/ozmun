import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base=process.env.CONTAINER_CHECK_URL||'http://127.0.0.1:43100';
let healthy=false;
for(let i=0;i<15;i++){
  try{
    const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2500)});
    const body=await response.json();
    if(response.ok&&body.status==='ok'){healthy=true;break;}
  }catch{/* Container may still be starting. */}
  await delay(1500);
}
assert.ok(healthy,'Container did not become ready');
const data=await fetch(base+'/api/data',{signal:AbortSignal.timeout(5000)}).then(r=>{assert.equal(r.status,200);return r.json();});
assert.equal(data.snapshot.weather.length,3);
assert.ok(data.snapshot.river.daily.time.length>=180);
const parameters={capacity:4500,initialStorage:2790,release:650,inflowChange:0,irrigationDemand:350,head:220,efficiency:.9,turbineLimit:1400,area:80,evaporation:2.5,reservePercent:30};
const response=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({message:'Сколько энергии получится за неделю?',language:'ru',parameters}),signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const result=await response.json();
assert.equal(result.mode,'local','Build-time image must not contain a live API key');
assert.match(result.answer,/212,1/);
assert.match(result.answer,/ГВт/);
const page=await fetch(base,{signal:AbortSignal.timeout(5000)}).then(r=>r.text());
assert.match(page,/<div id="root">/);
console.log('Container verified: healthy, real retained data, correct energy calculation, SPA served, no baked-in API key.');
