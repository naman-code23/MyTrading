import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { solvePositionCalculator } from '../js/calc.js';
import {
  PNL_METHODS,
  buildEquityCurve,
  computeTradeMetrics,
  filterTrades,
  groupMonthlyPnl,
  normalizeTradePayload,
  summarizeJournal,
  toCsvRows,
} from '../js/trade-engine.js';
import {
  createLinkedWinnerDraft,
  linkedWinnerId,
  normalizeSourceTradeSnapshot,
  normalizeWinnerPayload,
} from '../js/winner-db.js';
import { calculateShowcaseManifest, showcaseManifest, syntheticTrades, syntheticWinners } from '../fixtures/showcase-fixtures.mjs';
import { seedShowcaseLocal } from '../fixtures/seed-showcase-local.mjs';
import { createDemoStorage } from '../js/storage.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

async function withBrowserStorage(callback) {
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  try { return await callback(); } finally {
    globalThis.localStorage = previousLocalStorage;
    globalThis.window = previousWindow;
  }
}

test('showcase fixture manifest has the requested deterministic shape', () => {
  const manifestFile = JSON.parse(fs.readFileSync(path.join(repoRoot, 'fixtures/showcase-manifest.json'), 'utf8'));
  assert.equal(syntheticTrades.length, 12);
  assert.equal(syntheticWinners.length, 4);
  assert.equal(new Set(syntheticTrades.map((trade) => trade.createdAt.slice(0, 7))).size, 3);
  assert.deepEqual(calculateShowcaseManifest(), showcaseManifest);
  assert.deepEqual(manifestFile, showcaseManifest);
  assert.equal(showcaseManifest.closedTrades, 10);
  assert.equal(showcaseManifest.wins, 6);
  assert.equal(showcaseManifest.losses, 3);
  assert.equal(showcaseManifest.breakeven, 1);
  assert.equal(showcaseManifest.openPositions, 2);
  assert.equal(showcaseManifest.winRate, 60);
  assert.equal(showcaseManifest.linkedWinnerCount, 2);
  assert.equal(showcaseManifest.screenshotCount, 4);
  assert.deepEqual(showcaseManifest.accounting.AVERAGE, showcaseManifest.accounting.FIFO);
  assert.equal(showcaseManifest.accounting.AVERAGE.netPnl, 6235);
});

test('the current UI contract is exactly three tabs and excludes retired surfaces', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(repoRoot, 'js/app.js'), 'utf8');
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, ['calculator', 'journal', 'winners']);
  assert.doesNotMatch(html, /dashboard|playbook|sell check|ai coach|supermbi/i);
  assert.doesNotMatch(app, /from ['"]\.\/mbi\.js['"]/i);
  assert.match(app, /createLinkedWinnerDraft/);
});

test('Firebase rules preserve owner isolation and server-only verification paths', () => {
  const firestoreRules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.join(repoRoot, 'storage.rules'), 'utf8');
  assert.match(firestoreRules, /request\.auth\.uid == userId/);
  assert.match(firestoreRules, /match \/verificationExchanges\/\{exchangeId\}/);
  assert.match(firestoreRules, /allow read, write: if false/);
  assert.match(storageRules, /users\/\{userId\}\/winner-images\/\{winnerId\}/);
  assert.match(storageRules, /request\.auth\.uid == userId/);
});

test('journal summary uses closed trades only and includes breakeven in denominator', () => {
  const summary = summarizeJournal(syntheticTrades, PNL_METHODS.AVERAGE);
  assert.equal(summary.tradeCount, 12);
  assert.equal(summary.closedTradeCount, 10);
  assert.equal(summary.openTradeCount, 2);
  assert.equal(summary.winCount, 6);
  assert.equal(summary.lossCount, 3);
  assert.equal(summary.winRate, 60);
  assert.equal(Math.round(summary.netPnl), 6235);
  assert.equal(computeTradeMetrics(syntheticTrades[9]).realizedNetPnl, 0);
  assert.equal(computeTradeMetrics(syntheticTrades[10]).status, 'OPEN');
  assert.equal(computeTradeMetrics(syntheticTrades[10]).realizedNetPnl > 0, true);
});

test('charts aggregate by final exit date and expose calculated fixture totals', () => {
  const equity = buildEquityCurve(syntheticTrades);
  const monthly = groupMonthlyPnl(syntheticTrades);
  const expected = showcaseManifest.accounting.AVERAGE;
  assert.deepEqual(equity.map((item) => item.value), expected.equityValues);
  assert.deepEqual(monthly.map(({ key, value }) => ({ key, value })), expected.monthlyPnl);
  assert.equal(equity.at(-1).value, expected.netPnl);
  assert.equal(monthly.length, 3);
});

test('filtering supports result/status without any legacy score field', () => {
  const filters = { search: '', status: 'CLOSED', direction: 'ALL', result: 'WIN', timeframe: 'ALL' };
  const winners = filterTrades(syntheticTrades, filters);
  assert.equal(winners.length, 6);
  assert.ok(winners.every((trade) => trade.metrics.status === 'CLOSED' && trade.metrics.realizedNetPnl > 0));
  assert.equal(Object.hasOwn(winners[0], 'mbiScore'), true);
});

test('calculator keeps primary capital/risk/entry/stop-loss flow and solver modes', () => {
  const primary = solvePositionCalculator({ capital: 100000, riskPercent: 1, entry: 100, slPrice: 95, lastEdited: 'entry' });
  assert.equal(primary.qty, 200);
  assert.equal(primary.actualRisk, 1000);
  const override = solvePositionCalculator({ capital: 100000, riskPercent: 1, entry: 100, slPrice: 95, positionSize: 15000, lastEdited: 'positionSize' });
  assert.equal(override.qty, 150);
  assert.equal(override.actualRisk, 750);
});

test('editing a trade preserves legacy and unknown historical fields', () => {
  const original = syntheticTrades[0];
  const edited = normalizeTradePayload({ ...original, metrics: { status: 'CLOSED' }, notes: 'Edited note' });
  assert.equal(edited.mbiScore, 71);
  assert.deepEqual(edited.hiddenMetadata, { legacyLabel: 'Keep me' });
  assert.equal(edited.notes, 'Edited note');
  assert.equal(edited.fills.length, original.fills.length);
  assert.equal(toCsvRows([edited])[0].includes('SuperMBI'), true);
});

test('linked winner IDs are deterministic and source snapshots are bounded', () => {
  const trade = syntheticTrades[0];
  const metrics = computeTradeMetrics(trade);
  const draftA = createLinkedWinnerDraft(trade, metrics, { capturedAt: '2026-09-14T00:00:00.000Z', pnlMethod: 'AVERAGE', currency: 'INR' });
  const draftB = createLinkedWinnerDraft(trade, metrics, { capturedAt: '2026-09-15T00:00:00.000Z', pnlMethod: 'FIFO', currency: 'USD' });
  assert.equal(draftA.id, linkedWinnerId(trade.id));
  assert.equal(draftA.id, draftB.id);
  assert.equal(draftA.sourceTradeId, trade.id);
  assert.deepEqual(Object.keys(draftA.sourceTradeSnapshot).sort(), ['capturedAt', 'currency', 'direction', 'entryAt', 'exitAt', 'pnlMethod', 'realizedNetPnl', 'realizedPct', 'symbol']);
  assert.deepEqual(normalizeSourceTradeSnapshot({ symbol: 'tcs', realizedNetPnl: 12, unknown: 'drop' }), { symbol: 'TCS', realizedNetPnl: 12 });
  assert.throws(() => createLinkedWinnerDraft(syntheticTrades[10], computeTradeMetrics(syntheticTrades[10])));
});

test('winner normalization preserves historical fields but removes derived values from persistence', () => {
  const normalized = normalizeWinnerPayload({ ...syntheticWinners[2], pattern: { stale: true }, effectiveMove: 999, mbiScore: 88, hiddenMetadata: { keep: true } });
  assert.deepEqual(normalized.hiddenMetadata, { keep: true });
  assert.equal(normalized.mbiScore, 88);
  assert.notDeepEqual(normalized.pattern, { stale: true });
  assert.equal(normalized.effectiveMove, 36.8);
});

test('demo winner create-if-absent is idempotent', async () => {
  await withBrowserStorage(async () => {
    const storage = createDemoStorage();
    const entry = syntheticWinners[0];
    const first = await storage.createWinnerIfAbsent(entry);
    const second = await storage.createWinnerIfAbsent({ ...entry, notes: 'must not overwrite' });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.entry.notes, entry.notes);
  });
});

test('showcase seed merges only its marker and is safe to repeat', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  assert.deepEqual(seedShowcaseLocal(storage), { datasetMarker: 'trademaster-showcase-synthetic-v1', trades: 12, winners: 4 });
  assert.deepEqual(seedShowcaseLocal(storage), { datasetMarker: 'trademaster-showcase-synthetic-v1', trades: 12, winners: 4 });
  values.set('tmpro_cloud_trades', JSON.stringify([{ id: 'user-data' }]));
  assert.throws(() => seedShowcaseLocal(storage), /Refusing to seed trades/);
});
