import { buildEquityCurve, computeTradeMetrics, groupMonthlyPnl, summarizeJournal } from '../js/trade-engine.js';
import { createLinkedWinnerDraft, normalizeWinnerPayload } from '../js/winner-db.js';

export const SHOWCASE_DATASET_MARKER = 'trademaster-showcase-synthetic-v1';

function fill(id, executedAt, side, qty, price, fees, note = '') {
  return { id, executedAt, side, qty, price, fees, note };
}

function trade(id, symbol, direction, strategy, fills, extra = {}) {
  return {
    id,
    datasetMarker: SHOWCASE_DATASET_MARKER,
    symbol,
    direction,
    timeframe: 'SWING',
    strategy,
    plannedRisk: extra.plannedRisk || 1000,
    plannedStop: extra.plannedStop || 0,
    dipBeforeMove: extra.dipBeforeMove ?? null,
    tags: extra.tags || ['showcase'],
    notes: extra.notes || 'Synthetic showcase record; not a live trading result.',
    createdAt: fills[0].executedAt,
    updatedAt: fills[fills.length - 1].executedAt,
    fills,
    ...(extra.hiddenMetadata ? { hiddenMetadata: extra.hiddenMetadata } : {}),
    ...(extra.mbiScore != null ? { mbiScore: extra.mbiScore } : {}),
  };
}

export const syntheticTrades = [
  trade('showcase-trade-01', 'RELIANCE', 'LONG', 'AVWAP reclaim', [
    fill('showcase-fill-01a', '2026-04-10T09:20:00.000Z', 'BUY', 100, 100, 10, 'Initial entry'),
    fill('showcase-fill-01b', '2026-04-10T10:05:00.000Z', 'BUY', 50, 102, 5, 'Scale in'),
    fill('showcase-fill-01c', '2026-04-10T11:15:00.000Z', 'SELL', 80, 110, 8, 'Partial exit'),
    fill('showcase-fill-01d', '2026-04-10T13:40:00.000Z', 'SELL', 70, 112, 7, 'Final exit'),
  ], { plannedRisk: 900, plannedStop: 95, dipBeforeMove: 2.1, tags: ['showcase', 'linked-winner'], mbiScore: 71, hiddenMetadata: { legacyLabel: 'Keep me' } }),
  trade('showcase-trade-02', 'TCS', 'SHORT', 'Breakdown retest', [
    fill('showcase-fill-02a', '2026-04-15T09:30:00.000Z', 'SELL', 120, 200, 12, 'Initial short'),
    fill('showcase-fill-02b', '2026-04-15T11:00:00.000Z', 'BUY', 60, 185, 6, 'Partial cover'),
    fill('showcase-fill-02c', '2026-04-15T14:00:00.000Z', 'BUY', 60, 180, 6, 'Final cover'),
  ], { plannedRisk: 1100, plannedStop: 210, dipBeforeMove: 1.4, tags: ['showcase', 'linked-winner'] }),
  trade('showcase-trade-03', 'INFY', 'LONG', 'Tight base', [
    fill('showcase-fill-03a', '2026-04-24T09:45:00.000Z', 'BUY', 80, 300, 8),
    fill('showcase-fill-03b', '2026-04-24T14:20:00.000Z', 'SELL', 80, 318, 8),
  ], { plannedRisk: 800, plannedStop: 290, dipBeforeMove: 2.8 }),
  trade('showcase-trade-04', 'HDFCBANK', 'SHORT', 'Failed breakout', [
    fill('showcase-fill-04a', '2026-04-29T10:00:00.000Z', 'SELL', 50, 500, 5),
    fill('showcase-fill-04b', '2026-04-29T15:00:00.000Z', 'BUY', 50, 470, 5),
  ], { plannedRisk: 750, plannedStop: 515, dipBeforeMove: 2.2 }),
  trade('showcase-trade-05', 'COALINDIA', 'LONG', 'Range expansion', [
    fill('showcase-fill-05a', '2026-05-05T09:25:00.000Z', 'BUY', 150, 80, 15),
    fill('showcase-fill-05b', '2026-05-05T13:10:00.000Z', 'SELL', 150, 86, 15),
  ], { plannedRisk: 950, plannedStop: 74, dipBeforeMove: 1.8 }),
  trade('showcase-trade-06', 'BEL', 'LONG', 'Earnings gap', [
    fill('showcase-fill-06a', '2026-05-18T09:20:00.000Z', 'BUY', 60, 420, 6),
    fill('showcase-fill-06b', '2026-05-18T14:45:00.000Z', 'SELL', 60, 435, 6),
  ], { plannedRisk: 700, plannedStop: 405, dipBeforeMove: 3.2 }),
  trade('showcase-trade-07', 'ITC', 'LONG', 'Late breakout', [
    fill('showcase-fill-07a', '2026-05-25T09:35:00.000Z', 'BUY', 100, 150, 10),
    fill('showcase-fill-07b', '2026-05-25T12:00:00.000Z', 'SELL', 100, 145, 10),
  ], { plannedRisk: 600, plannedStop: 143, dipBeforeMove: 4.6 }),
  trade('showcase-trade-08', 'SBIN', 'SHORT', 'Support failure', [
    fill('showcase-fill-08a', '2026-05-29T10:10:00.000Z', 'SELL', 90, 250, 9),
    fill('showcase-fill-08b', '2026-05-29T14:30:00.000Z', 'BUY', 90, 258, 9),
  ], { plannedRisk: 700, plannedStop: 256, dipBeforeMove: 5.1 }),
  trade('showcase-trade-09', 'MARUTI', 'LONG', 'Failed retest', [
    fill('showcase-fill-09a', '2026-06-04T09:40:00.000Z', 'BUY', 75, 360, 7.5),
    fill('showcase-fill-09b', '2026-06-04T13:50:00.000Z', 'SELL', 75, 350, 7.5),
  ], { plannedRisk: 650, plannedStop: 350, dipBeforeMove: 6.2 }),
  trade('showcase-trade-10', 'ASIANPAINT', 'SHORT', 'Flat close', [
    fill('showcase-fill-10a', '2026-06-12T09:30:00.000Z', 'SELL', 40, 700, 4),
    fill('showcase-fill-10b', '2026-06-12T15:00:00.000Z', 'BUY', 40, 699.8, 4),
  ], { plannedRisk: 500, plannedStop: 712, dipBeforeMove: 0.8 }),
  trade('showcase-trade-11', 'TRENT', 'LONG', 'Partial runner', [
    fill('showcase-fill-11a', '2026-06-18T09:25:00.000Z', 'BUY', 100, 120, 10),
    fill('showcase-fill-11b', '2026-06-18T10:20:00.000Z', 'BUY', 50, 122, 5),
    fill('showcase-fill-11c', '2026-06-18T13:15:00.000Z', 'SELL', 50, 130, 5, 'Partial exit; position remains open'),
  ], { plannedRisk: 800, plannedStop: 112, dipBeforeMove: 2.5 }),
  trade('showcase-trade-12', 'AXISBANK', 'SHORT', 'Open watch', [
    fill('showcase-fill-12a', '2026-06-25T11:10:00.000Z', 'SELL', 60, 600, 6, 'Still open'),
  ], { plannedRisk: 900, plannedStop: 615, dipBeforeMove: 1.1 }),
];

const metricsByTradeId = new Map(syntheticTrades.map((item) => [item.id, computeTradeMetrics(item)]));

const linkedWinnerOne = createLinkedWinnerDraft(syntheticTrades[0], metricsByTradeId.get(syntheticTrades[0].id), {
  pnlMethod: 'AVERAGE', currency: 'INR', capturedAt: '2026-04-11T08:00:00.000Z',
});
const linkedWinnerTwo = createLinkedWinnerDraft(syntheticTrades[1], metricsByTradeId.get(syntheticTrades[1].id), {
  pnlMethod: 'AVERAGE', currency: 'INR', capturedAt: '2026-04-16T08:00:00.000Z',
});

export const syntheticWinners = [
  normalizeWinnerPayload({ ...linkedWinnerOne, datasetMarker: SHOWCASE_DATASET_MARKER, sector: 'Diversified', type: 'Leader', breakoutDate: '2026-04-11', initialMove: 9.5, move: 28.4, imageUrl: './fixtures/assets/synthetic-chart-1.svg', notes: 'Linked to a profitable closed journal trade.', tags: ['showcase', 'linked'], moves: [{ id: 'winner-move-01', movePct: 28.4, breakoutExpansions: [9.5, 11.2, 7.7], bases: [{ length: 18, depth: 4.2, expansions: [6.1, 8.2, 10.4] }] }] }),
  normalizeWinnerPayload({ ...linkedWinnerTwo, datasetMarker: SHOWCASE_DATASET_MARKER, sector: 'Technology', type: 'Leader', breakoutDate: '2026-04-16', initialMove: 8.2, move: 24.7, imageUrl: './fixtures/assets/synthetic-chart-2.svg', notes: 'A deterministic linked example; repeated clicks must not create another record.', tags: ['showcase', 'linked'], moves: [{ id: 'winner-move-02', movePct: 24.7, breakoutExpansions: [8.2, 9.4, 7.1], bases: [{ length: 14, depth: 3.6, expansions: [5.4, 7.8, 9.1] }] }] }),
  normalizeWinnerPayload({ id: 'showcase-winner-03', datasetMarker: SHOWCASE_DATASET_MARKER, stockName: 'HAL', sector: 'Defence', type: 'Leader', setup: 'Tight flag', timeframe: 'SWING', breakoutDate: '2026-05-19', period: '5 weeks', initialMove: 12.4, move: 36.8, dipBeforeMove: 2.3, imageUrl: './fixtures/assets/synthetic-chart-3.svg', notes: 'Standalone synthetic chart example.', tags: ['showcase', 'standalone'], moves: [{ id: 'winner-move-03', movePct: 36.8, breakoutExpansions: [12.4, 10.1, 14.3], bases: [{ length: 22, depth: 5.1, expansions: [8.2, 11.4, 13.6] }] }], createdAt: '2026-05-19T08:00:00.000Z', updatedAt: '2026-05-19T08:00:00.000Z', hiddenMetadata: { source: 'synthetic-fixture' }, mbiScore: 88 }),
  normalizeWinnerPayload({ id: 'showcase-winner-04', datasetMarker: SHOWCASE_DATASET_MARKER, stockName: 'PERSISTENT', sector: 'Technology', type: 'Turnaround', setup: 'Base breakout', timeframe: 'MTF', breakoutDate: '2026-06-13', period: '8 weeks', initialMove: 7.8, move: 21.6, dipBeforeMove: 1.9, imageUrl: './fixtures/assets/synthetic-chart-4.svg', notes: 'Standalone synthetic chart example.', tags: ['showcase', 'standalone'], moves: [{ id: 'winner-move-04', movePct: 21.6, breakoutExpansions: [7.8, 6.7, 7.1], bases: [{ length: 16, depth: 3.1, expansions: [5.2, 6.5, 8.8] }] }], createdAt: '2026-06-13T08:00:00.000Z', updatedAt: '2026-06-13T08:00:00.000Z' }),
];

function calculateAccountingManifest(method) {
  const summary = summarizeJournal(syntheticTrades, method);
  const equity = buildEquityCurve(syntheticTrades, method);
  const monthly = groupMonthlyPnl(syntheticTrades, method);
  const cents = (value) => Math.round(Number(value || 0) * 100) / 100;
  return {
    netPnl: cents(summary.netPnl),
    grossProfit: cents(summary.grossProfit),
    grossLossAbs: cents(summary.grossLossAbs),
    equityValues: equity.map((item) => item.value),
    monthlyPnl: monthly.map((item) => ({ key: item.key, value: item.value })),
  };
}

export function calculateShowcaseManifest() {
  const summary = summarizeJournal(syntheticTrades, 'AVERAGE');
  const average = calculateAccountingManifest('AVERAGE');
  const fifo = calculateAccountingManifest('FIFO');
  return {
    datasetMarker: SHOWCASE_DATASET_MARKER,
    tradeCount: syntheticTrades.length,
    winnerCount: syntheticWinners.length,
    closedTrades: summary.closedTradeCount,
    wins: summary.winCount,
    losses: summary.lossCount,
    breakeven: syntheticTrades.filter((item) => { const metrics = computeTradeMetrics(item, 'AVERAGE'); return metrics.status === 'CLOSED' && metrics.realizedNetPnl === 0; }).length,
    openPositions: summary.openTradeCount,
    winRate: summary.winRate,
    linkedWinnerCount: syntheticWinners.filter((entry) => entry.sourceTradeId).length,
    screenshotCount: syntheticWinners.filter((entry) => entry.imageUrl).length,
    accounting: { AVERAGE: average, FIFO: fifo },
  };
}

export const showcaseManifest = calculateShowcaseManifest();
