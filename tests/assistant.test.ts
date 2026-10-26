import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {answerQuestion}from'../server/assistant';
import {DEFAULT_PARAMETERS}from'../shared/model';
import type{Snapshot}from'../shared/types';

const snapshot=JSON.parse(readFileSync(new URL('../data/snapshot.json',import.meta.url),'utf8'))as Snapshot;
async function provider(response:()=>Promise<Response>,run:()=>Promise<void>){
  const savedFetch=globalThis.fetch,key=process.env.LLM_API_KEY,model=process.env.LLM_MODEL;
  globalThis.fetch=response;process.env.LLM_API_KEY='test-not-a-real-key';process.env.LLM_MODEL='openrouter/free';
  try{await run();}finally{globalThis.fetch=savedFetch;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;if(model===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=model;}
}
test('a grounded language-model answer is returned as an AI answer',async()=>{
  await provider(async()=>new Response(JSON.stringify({choices:[{message:{content:'В выбранном сценарии за 7 дней получится 212,11 ГВт·ч. Это расчёт, а не фактическая выработка станции.'}}]})),async()=>{
    const result=await answerQuestion('Сколько энергии получится за неделю?','ru',DEFAULT_PARAMETERS,snapshot);
    assert.equal(result.mode,'llm');assert.match(result.answer,/212,11/);
  });
});
test('free-provider rate limits preserve the correctly labeled local calculation',async()=>{
  await provider(async()=>new Response('{}',{status:429}),async()=>{
    const result=await answerQuestion('Сколько энергии получится за неделю?','ru',DEFAULT_PARAMETERS,snapshot);
    assert.equal(result.mode,'local');assert.match(result.answer,/временно недоступна/);assert.match(result.answer,/212,1 ГВт/);
  });
});
test('an incorrect AI energy total is not shown to the user',async()=>{
  await provider(async()=>new Response(JSON.stringify({choices:[{message:{content:'За неделю получится 181,8 МВт·ч.'}}]})),async()=>{
    const result=await answerQuestion('Сколько энергии получится за неделю?','ru',DEFAULT_PARAMETERS,snapshot);
    assert.equal(result.mode,'local');assert.doesNotMatch(result.answer,/181,8/);assert.match(result.answer,/212,1/);
  });
});
test('unavailable or empty AI content falls back without pretending to be an AI response',async()=>{
  await provider(async()=>new Response(JSON.stringify({choices:[{message:{content:''}}]})),async()=>{
    const result=await answerQuestion('Какие источники данных?','ru',DEFAULT_PARAMETERS,snapshot);
    assert.equal(result.mode,'local');assert.match(result.answer,/GloFAS/);
  });
});
test('paid model configuration cannot accidentally route a free-only installation to paid inference',async()=>{
  const key=process.env.LLM_API_KEY,model=process.env.LLM_MODEL,savedFetch=globalThis.fetch;
  process.env.LLM_API_KEY='test-not-a-real-key';process.env.LLM_MODEL='paid-provider/paid-model';
  globalThis.fetch=async(_url,init)=>{assert.equal(JSON.parse(init!.body as string).model,'openrouter/free');return new Response(JSON.stringify({choices:[{message:{content:'Источник — GloFAS через Open-Meteo.'}}]}));};
  try{assert.equal((await answerQuestion('Какие источники данных?','ru',DEFAULT_PARAMETERS,snapshot)).mode,'llm');}
  finally{globalThis.fetch=savedFetch;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;if(model===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=model;}
});
