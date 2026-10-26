export type Language = 'ru' | 'tj';
export type Page = 'overview' | 'scenarios' | 'forecast' | 'sources';
export interface DailyWeather {
  time: string[];
  temperature_2m_mean: (number | null)[];
  precipitation_sum: (number | null)[];
  snowfall_sum: (number | null)[];
}
export interface WeatherPoint {
  id: string;
  name: string;
  nameTj: string;
  requested: { latitude: number; longitude: number };
  latitude: number;
  longitude: number;
  elevation: number;
  daily: DailyWeather;
}
export interface Snapshot {
  version: 1;
  retrievedAt: string;
  today: string;
  weather: WeatherPoint[];
  river: {
    latitude: number;
    longitude: number;
    requested: { latitude: number; longitude: number };
    daily: { time: string[]; river_discharge: (number | null)[] };
  };
}
export interface Parameters {
  capacity: number;
  initialStorage: number;
  release: number;
  inflowChange: number;
  irrigationDemand: number;
  head: number;
  efficiency: number;
  turbineLimit: number;
  area: number;
  evaporation: number;
  reservePercent: number;
}
export interface ForecastDay { date: string; flow: number; source: 'glofas' | 'local-ml' }
export interface SimulationDay {
  date: string;
  inflow: number;
  release: number;
  storage: number;
  storagePercent: number;
  energy: number;
  irrigation: number;
  coverage: number;
  spill: number;
  evaporation: number;
  balanceError: number;
}
export interface Simulation {
  days: SimulationDay[];
  energy: number;
  finalStorage: number;
  storageChange: number;
  coverage: number;
  spill: number;
  averageInflow: number;
  reserveViolated: boolean;
}
export interface Measurement {
  date: string;
  storage_mcm: number;
  inflow_m3s?: number;
  release_m3s?: number;
}
export interface DatasetResponse {
  snapshot: Snapshot;
  servedFrom: 'live' | 'snapshot';
  assistantAvailable: boolean;
  snapshotAgeHours: number;
}
