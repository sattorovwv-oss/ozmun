import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base=process.env.CONTAINER_CHECK_URL||'http://127.0.0.1:43100';
let healthy=false;
for(let i=0;i<15;i++){
  try{
    const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2500)});
    const body=await response.json();
    if(response.ok&&body.status==='ok'&&body.interfaceVersion===3){healthy=true;break;}
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
assert.match(page,/Вода\. Погода\. Жизнь/);
const weatherResponse=await fetch(base+'/api/weather?city=dushanbe',{signal:AbortSignal.timeout(25000)});
assert.equal(weatherResponse.status,200);
const weather=await weatherResponse.json();
assert.equal(weather.weather.place.id,'dushanbe');assert.equal(weather.weather.source,'Open-Meteo');
assert.equal(weather.weather.days.length,7);assert.ok(Number.isFinite(Date.parse(weather.weather.current.at)));
for(const variant of ['desktop','mobile']){
  const video=await fetch(base+`/media/garden-${variant}.mp4`,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(5000)});
  assert.equal(video.status,206);assert.equal((await video.arrayBuffer()).byteLength,1024);
}
const advice=await fetch(base+'/api/advice',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify({
  message:'Как сократить расход воды?',language:'ru',role:'family',location:{city:'dushanbe'},
  garden:{area:50,coefficient:.85,efficiency:.9,useRain:true},family:{people:4,showerMinutes:8,flow:9,loadsPerWeek:3,litresPerLoad:45},duration:2,
})});
assert.equal(advice.status,200);const explanation=await advice.json();assert.equal(explanation.mode,'local');assert.match(explanation.answer,/3.?240/);
console.log('Container verified: version 3, retained river data, current/daily weather separation, both video ranges, daily planning, correct energy and family calculations, no baked-in API key.');
