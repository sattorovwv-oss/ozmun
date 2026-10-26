import type { Snapshot, WeatherPoint } from './types';

/** Transparent weather screening, not a calibrated debris-flow prediction. */
export const RAIN_THRESHOLDS = { watch: 15, attention: 30 } as const;
export type SignalLevel = 'quiet' | 'watch' | 'attention' | 'unknown';
export interface PointConditions {
  point: WeatherPoint;
  date: string;
  rain: number | null;
  originalRain: number | null;
  temperature: number | null;
  snow: number | null;
  level: SignalLevel;
  scenario: boolean;
}
export function offsetDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function monitoringDates(snapshot: Snapshot) {
  return Array.from({ length: 7 }, (_, i) => offsetDate(snapshot.today, i));
}
export function rainLevel(rain: number | null): SignalLevel {
  if (rain === null || !Number.isFinite(rain) || rain < 0) return 'unknown';
  if (rain >= RAIN_THRESHOLDS.attention) return 'attention';
  if (rain >= RAIN_THRESHOLDS.watch) return 'watch';
  return 'quiet';
}
export function pointConditions(point: WeatherPoint, date: string, addedRain = 0): PointConditions {
  if (!Number.isFinite(addedRain) || addedRain < 0 || addedRain > 100) throw new Error('Invalid rain scenario');
  const index = point.daily.time.indexOf(date);
  const value = (key: keyof Omit<WeatherPoint['daily'], 'time'>) => {
    const v = index < 0 ? null : point.daily[key][index];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const originalRain = value('precipitation_sum');
  const rain = originalRain === null ? null : originalRain + addedRain;
  return { point, date, rain, originalRain, temperature: value('temperature_2m_mean'),
    snow: value('snowfall_sum'), level: rainLevel(rain), scenario: addedRain > 0 };
}
export function monitoringOverview(snapshot: Snapshot) {
  const dates = monitoringDates(snapshot);
  const all = snapshot.weather.flatMap(point => dates.map(date => pointConditions(point, date)));
  const known = all.filter((p): p is PointConditions & { rain: number } => p.rain !== null);
  const peak = [...known].sort((a, b) => b.rain - a.rain)[0] ?? null;
  const next72 = known.filter(p => p.date <= dates[2]).sort((a, b) => b.rain - a.rain)[0] ?? null;
  return { dates, peak, next72, all, complete: known.length === all.length };
}
