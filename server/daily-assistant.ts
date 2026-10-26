import type { FamilyInputs, GardenInputs } from '../shared/daily-plans';
import { familyWater, gardenWater, outdoorWindows } from '../shared/daily-plans';
import type { EverydayRole, LocalPlace, WeatherPayload } from '../shared/local-weather';
import { localDate, weatherKind } from '../shared/local-weather';
import type { Language } from '../shared/types';

export interface DailyQuestion {message:string;language:Language;role:EverydayRole;date?:string;garden:GardenInputs;family:FamilyInputs;duration:number}
export async function dailyAnswer(question:DailyQuestion,place:LocalPlace,payload:WeatherPayload|null){
  const {language,role,message}=question,ru=language==='ru',weather=payload?.weather;
  const relative=/послезавтра|пасфардо/i.test(message)?2:/завтра|фардо/i.test(message)?1:/сегодня|имрӯз/i.test(message)?0:null;
  const explicit=message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const date=explicit|| (relative===null?question.date||localDate(Date.now()):localDate(Date.now()+relative*86400000));
  const irrigation=weather&&!payload?.stale?gardenWater(weather,date,question.garden):null;
  const household=familyWater(question.family);
  const windows=weather&&!payload?.stale?outdoorWindows(weather,date,question.duration):[];
  const name=ru?place.name:place.nameTj,n=(v:number)=>v.toLocaleString('ru-RU',{maximumFractionDigits:1});
  const time=(at:string)=>new Date(at).toLocaleTimeString(ru?'ru-RU':'tg-TJ',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'});
  const descriptions={clear:ru?'ясно':'соф',partly:ru?'малооблачно':'кам­абр',cloudy:ru?'облачно':'абрнок',fog:ru?'туман':'туман',rain:ru?'дождь':'борон',snow:ru?'снег':'барф',storm:ru?'гроза':'раъду барқ',unknown:ru?'состояние неизвестно':'ҳолат номаълум'};
  let local=weather?(ru?`${name}: ${payload?.stale?'сохранённые данные':'модельная погода'} на ${localDate(weather.current.at)}, ${time(weather.current.at)} — ${weather.current.temperature===null?'температура недоступна':n(weather.current.temperature)+' °C'}, ${descriptions[weatherKind(weather.current.code)]}.`:
    `${name}: ${payload?.stale?'маълумоти захирашуда':'обу ҳавои моделӣ'} дар ${localDate(weather.current.at)}, ${time(weather.current.at)} — ${weather.current.temperature===null?'ҳарорат дастрас нест':n(weather.current.temperature)+' °C'}, ${descriptions[weatherKind(weather.current.code)]}.`):
    (ru?`Актуальная погода для ${name} сейчас недоступна.`:`Обу ҳавои ҷории ${name} ҳоло дастрас нест.`);
  const explainWeather=/погод.*отлич|ҳозир.*фарқ/i.test(message);
  if(explainWeather)local+='\n\n'+(ru?'«Сейчас» показывает состояние и температуру на время модели. Прогноз осадков за день охватывает все 24 часа: дождь может пройти позже, пока в данный момент ясно. Поэтому эти значения показаны отдельно.':'«Ҳозир» ҳолат ва ҳароратро дар вақти модел нишон медиҳад. Пешгӯии бориши рӯз тамоми 24 соатро дар бар мегирад: ҳатто агар ҳозир соф бошад, борон метавонад дертар борад. Аз ин рӯ онҳо ҷудо нишон дода мешаванд.');
  if(!explainWeather&&role==='garden')local+='\n\n'+(irrigation?(ru?`На ${date} для ${n(question.garden.area)} м² расчётная потребность — ${n(irrigation.litres)} л. ET₀ ${n(irrigation.et0)} мм, прогноз осадков за весь день ${n(irrigation.rain)} мм. Это оценка по коэффициенту культуры и эффективности полива. Проверьте почву: её фактическая влажность не измерена.`:
    `Барои ${date} ва ${n(question.garden.area)} м² талаботи ҳисобӣ ${n(irrigation.litres)} л аст. ET₀ ${n(irrigation.et0)} мм, бориши тамоми рӯз ${n(irrigation.rain)} мм. Ҳисоб ба коэффисиенти зироат ва самаранокии обёрӣ такя мекунад. Хокро санҷед: намнокии воқеӣ чен нашудааст.`):
    (ru?'Для расчёта полива нужны свежие данные выбранного дня. Не заменяем отсутствующие осадки или испарение нулём.':'Барои ҳисоби обёрӣ маълумоти тозаи рӯзи интихобшуда лозим аст. Бориш ё бухоршавии номаълумро сифр намешуморем.'));
  if(!explainWeather&&role==='work')local+='\n\n'+(windows.length?(ru?`На ${date} подходит прогнозное окно ${time(windows[0].start)}–${time(windows[0].end)}. Выбираем светлые часы с температурой +5…+32 °C, ветром до 8 м/с, осадками менее 0,2 мм/ч и вероятностью не выше 35%. Это фильтр погодных условий, не разрешение на любые работы. Проверьте обновление перед выходом.`:
    `Барои ${date} вақти ${time(windows[0].start)}–${time(windows[0].end)} мувофиқ аст. Соатҳои рӯшноӣ бо +5…+32 °C, шамол то 8 м/с, бориш камтар аз 0,2 мм/соат ва эҳтимол то 35% интихоб мешаванд. Ин филтри обу ҳавост, на иҷозати ҳамаи корҳо. Пеш аз баромадан маълумотро нав кунед.`):
    (ru?'Для выбранной длительности подходящее окно не найдено или свежих данных не хватает. Попробуйте другой день. Неизвестные значения не считаются хорошей погодой.':'Барои давомнокии интихобшуда вақти муносиб ёфт нашуд ё маълумот намерасад. Рӯзи дигарро санҷед. Маълумоти номаълум обу ҳавои хуб ҳисоб намешавад.'));
  if(!explainWeather&&role==='family')local+='\n\n'+(ru?`По вашим параметрам душ и стирка расходуют примерно ${n(household.totalDaily)} л в день. Если сократить душ до 5 минут при том же расходе воды, расчётная экономия — ${n(household.savedDaily)} л в день, ${n(household.savedMonthly)} л за 30 дней. Кухня, туалет и остальные расходы не учтены; это не показания счётчика.`:
    `Аз рӯйи параметрҳои шумо душ ва ҷомашӯӣ тақрибан ${n(household.totalDaily)} л дар рӯз сарф мекунанд. Агар душ то 5 дақиқа бошад, сарфаи ҳисобӣ ${n(household.savedDaily)} л дар рӯз ё ${n(household.savedMonthly)} л дар 30 рӯз аст. Ошхона, ҳоҷатхона ва дигар хароҷот дохил нестанд; ин ченкунии ҳисобкунак нест.`);
  const hazard=/сел|павод|обхез|хатар/i.test(message);
  if(hazard)local+='\n\n'+(ru?'По этим данным нельзя достоверно предсказать конкретный сель. Следите за официальными сообщениями КЧС: kchs.tj.':'Бо ин маълумот сели мушаххасро боэътимод пешгӯӣ кардан мумкин нест. Хабарҳои расмии КҲФ-ро дар kchs.tj пайгирӣ кунед.');
  const exactCalculation=(role==='garden'||role==='family')&&/сколько|ч[ӣи]\s*қадар/i.test(message);
  if(!process.env.LLM_API_KEY||exactCalculation)return {answer:local,mode:'local' as const,date};
  const context={place,date,role,weather:weather?{fetchedAt:weather.fetchedAt,stale:payload?.stale,current:weather.current,selectedDay:weather.days.find(d=>d.date===date),source:weather.source}:null,
    verifiedGarden:irrigation,gardenInputs:question.garden,verifiedFamily:household,familyInputs:question.family,verifiedWorkWindows:windows.slice(0,3),
    limitations:'Daily precipitation is for the ENTIRE day and does not imply rain now. Current conditions come ONLY from current weather_code, temperature, is_day and time. Weather is modeled, not a local station measurement. ET0/crop coefficient are assumptions, not measured soil moisture. No water-supply schedules, outage predictions, official emergency alerts or calibrated debris-flow predictions are available.'};
  try{
    const configured=process.env.LLM_MODEL||'openrouter/free';
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(25000),
      headers:{Authorization:`Bearer ${process.env.LLM_API_KEY}`,'Content-Type':'application/json','X-Title':'OBHUSH Everyday Water'},
      body:JSON.stringify({model:configured==='openrouter/free'||configured.endsWith(':free')?configured:'openrouter/free',temperature:.1,max_tokens:900,reasoning:{exclude:true,effort:'low'},messages:[
        {role:'system',content:`You explain practical water and weather planning for residents of Tajikistan. Answer in ${ru?'Russian':'Tajik Cyrillic'}, plain text, at most 140 words. Use ONLY the verified context and precomputed totals; do not invent facts or recalculate totals. Explain without step-by-step arithmetic; quote precomputed totals directly. Never invent extra showers, habits or household members beyond the inputs. Start with the selected place and date when weather is relevant. Clearly distinguish current weather from whole-day forecasts and user assumptions. Do not give absolute safety guarantees, irrigation prescriptions based on unmeasured soil, invented flood probabilities, water-supply/outage schedules or claim satellite glacier monitoring. If weather is stale/unavailable, say it cannot be treated as current. Answer only the final helpful explanation, never classification, analysis or reasoning steps. Context:\n${JSON.stringify(context)}`},
        {role:'user',content:message}]})});
    if(!response.ok)throw new Error();
    const body=await response.json() as {choices?:{message?:{content?:string}}[]};
    const answer=body.choices?.[0]?.message?.content?.trim();
    if(!answer||answer.length<30||(answer.match(/[А-Яа-яЁёҒғҚқҲҳҶҷӢӣӮӯ]/g)?.length||0)<5||/User Safety:|<think>|Analyze the Request/i.test(answer))throw new Error();
    if(hazard&&/\d+(?:[.,]\d+)?\s*%/.test(answer))throw new Error();
    if(role==='garden'&&irrigation&&/сколько|литр|объ[её]м|ч[ӣи]\s*қадар/i.test(message)){
      const normalized=answer.replace(/[\s\u00a0\u202f]/g,'').replace(/,/g,'.');
      if(![0,1].some(d=>normalized.includes(irrigation.litres.toFixed(d))))throw new Error();
    }
    if(role==='family'&&/сколько|ч[ӣи]\s*қадар/i.test(message)){
      const normalized=answer.replace(/[\s\u00a0\u202f]/g,'').replace(/,/g,'.');
      const totals=/эконом|сократ|сберег|сарфа/i.test(message)?[household.savedDaily,household.savedMonthly]:[household.totalDaily];
      if(!totals.some(value=>[0,1].some(d=>normalized.includes(value.toFixed(d)))))throw new Error();
    }
    return {answer,mode:'llm' as const,date};
  }catch{return {answer:local,mode:'local' as const,date};}
}
