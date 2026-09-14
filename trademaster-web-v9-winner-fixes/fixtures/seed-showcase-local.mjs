import { SHOWCASE_DATASET_MARKER, syntheticTrades, syntheticWinners } from './showcase-fixtures.mjs';

const TRADES_KEY = 'tmpro_cloud_trades';
const WINNERS_KEY = 'tmpro_cloud_winners';

function read(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${key} is not an array.`);
  return parsed;
}

function mergeSynthetic(existing, fixtures, label) {
  for (const item of existing) {
    if (item.datasetMarker !== SHOWCASE_DATASET_MARKER) {
      throw new Error(`Refusing to seed ${label}: existing data is not the isolated ${SHOWCASE_DATASET_MARKER} dataset.`);
    }
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of fixtures) byId.set(item.id, item);
  return [...byId.values()];
}

/**
 * Idempotently seeds only the designated synthetic local demo dataset.
 * It intentionally does not call the app's replaceAllData path.
 */
export function seedShowcaseLocal(storage = globalThis.localStorage) {
  if (!storage) throw new Error('Run this procedure in a browser with localStorage.');
  const trades = mergeSynthetic(read(storage, TRADES_KEY), syntheticTrades, 'trades');
  const winners = mergeSynthetic(read(storage, WINNERS_KEY), syntheticWinners, 'winners');
  storage.setItem(TRADES_KEY, JSON.stringify(trades));
  storage.setItem(WINNERS_KEY, JSON.stringify(winners));
  return { datasetMarker: SHOWCASE_DATASET_MARKER, trades: trades.length, winners: winners.length };
}

export function resetShowcaseLocal(storage = globalThis.localStorage) {
  if (!storage) throw new Error('Run this procedure in a browser with localStorage.');
  for (const key of [TRADES_KEY, WINNERS_KEY]) {
    const items = read(storage, key);
    if (items.some((item) => item.datasetMarker !== SHOWCASE_DATASET_MARKER)) {
      throw new Error(`Refusing to remove unrelated data from ${key}.`);
    }
    storage.removeItem(key);
  }
  return { datasetMarker: SHOWCASE_DATASET_MARKER, reset: true };
}
