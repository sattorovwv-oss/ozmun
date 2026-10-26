import type { ForecastDay, Parameters, Simulation, SimulationDay } from './types';

export const DEFAULT_PARAMETERS: Parameters = {
  capacity: 4500,
  initialStorage: 2790,
  release: 650,
  inflowChange: 0,
  irrigationDemand: 350,
  head: 220,
  efficiency: 0.9,
  turbineLimit: 1400,
  area: 80,
  evaporation: 2.5,
  reservePercent: 30,
};

export function validateParameters(p: Parameters) {
  const limits: Record<keyof Parameters, [number, number]> = {
    capacity: [1, 30000], initialStorage: [0, 30000], release: [0, 3000],
    inflowChange: [-80, 100], irrigationDemand: [0, 3000], head: [1, 400],
    efficiency: [0.1, 1], turbineLimit: [1, 3000], area: [0, 1000],
    evaporation: [0, 20], reservePercent: [0, 90],
  };
  for (const k of Object.keys(limits) as (keyof Parameters)[]) {
    if (!Number.isFinite(p[k]) || p[k] < limits[k][0] || p[k] > limits[k][1]) throw new Error(`Invalid parameter: ${k}`);
  }
  if (p.initialStorage > p.capacity) throw new Error('Initial storage exceeds capacity');
}

/** A daily, single-reservoir balance. m³/s -> million m³/day = 0.0864.
 * Release first passes the turbines (up to their limit), then is available
 * downstream for irrigation. Irrigation is NOT subtracted from storage twice.
 * All infrastructure parameters are explicit scenario assumptions.
 */
export function simulate(forecast: ForecastDay[], p: Parameters): Simulation {
  validateParameters(p);
  if (!forecast.length || forecast.some(d => !Number.isFinite(d.flow) || d.flow < 0)) throw new Error('Invalid inflow series');
  let storage = p.initialStorage;
  const days: SimulationDay[] = forecast.map(d => {
    const inflow = d.flow * (1 + p.inflowChange / 100);
    const start = storage;
    const incoming = inflow * 0.0864;
    const evaporation = Math.min(p.area * p.evaporation * 0.001, start + incoming);
    const available = Math.max(0, start + incoming - evaporation);
    const release = Math.min(p.release, available / 0.0864);
    const released = release * 0.0864;
    const spill = Math.max(0, available - released - p.capacity);
    storage = Math.max(0, Math.min(p.capacity, available - released - spill));
    const irrigation = Math.min(release, p.irrigationDemand);
    const coverage = p.irrigationDemand === 0 ? 100 : irrigation / p.irrigationDemand * 100;
    // rho * g * Q * H * eta -> watts -> GWh per day
    const energy = 1000 * 9.81 * Math.min(release, p.turbineLimit) * p.head * p.efficiency * 24 / 1e9;
    return { date: d.date, inflow, release, storage, storagePercent: storage / p.capacity * 100,
      energy, irrigation, coverage, spill, evaporation,
      balanceError: start + incoming - released - evaporation - spill - storage };
  });
  return {
    days, energy: days.reduce((a, b) => a + b.energy, 0), finalStorage: storage,
    storageChange: storage - p.initialStorage,
    coverage: days.reduce((a, b) => a + b.coverage, 0) / days.length,
    spill: days.reduce((a, b) => a + b.spill, 0),
    averageInflow: days.reduce((a, b) => a + b.inflow, 0) / days.length,
    reserveViolated: days.some(d => d.storagePercent < p.reservePercent),
  };
}

/** Exhaustive search over a transparent 25 m³/s grid, not an RL model. */
export function optimize(forecast: ForecastDay[], p: Parameters) {
  let best: { parameters: Parameters; result: Simulation; score: number } | null = null;
  for (let release = 0; release <= 2000; release += 25) {
    const parameters = { ...p, release };
    const result = simulate(forecast, parameters);
    if (result.reserveViolated || result.coverage < 95) continue;
    const maxEnergy = 1000 * 9.81 * p.turbineLimit * p.head * p.efficiency * 24 * forecast.length / 1e9;
    const score = 0.55 * result.energy / maxEnergy + 0.45 * result.finalStorage / p.capacity;
    if (!best || score > best.score) best = { parameters, result, score };
  }
  return best;
}
