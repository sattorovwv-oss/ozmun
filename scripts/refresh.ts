import { saveBundledSnapshot } from '../server/data';

const data=await saveBundledSnapshot();
console.log(`Saved real data: ${data.river.daily.time.length} river days, ${data.weather.length} weather locations, retrieved ${data.retrievedAt}`);
