import { createStorageLayer, defaultSettings } from './storage.js';
import {
  PNL_METHODS,
  summarizeJournal,
  buildEquityCurve,
  groupMonthlyPnl,
  groupPnlByField,
  weekdayBreakdown,
  normalizeTradePayload,
  filterTrades,
  sortTrades,
  computeTradeMetrics,
  toCsvRows,
} from './trade-engine.js';
import { solvePositionCalculator, projectTarget, lockedPnl } from './calc.js';
import { calculateMbi, buildSellChecklist, quickSellCalculator } from './mbi.js';
import { createChartManager } from './charts.js';
import { importTradebookCsv } from './tradebook-importer.js';
import {
  $, $$,
  cn,
  deepClone,
  downloadTextFile,
  escapeHtml,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDurationMinutes,
  formatPercent,
  parseTags,
  round,
  stringifyTags,
  todayLocalDateTimeInput,
  uid,
} from './utils.js';

const chartManager = createChartManager();
const state = {
  storage: null,
  mode: 'demo',
  user: null,
  settings: { ...defaultSettings },
  trades: [],
  unsubTrades: null,
  filters: {
    search: '',
    status: 'ALL',
    direction: 'ALL',
    result: 'ALL',
    strategy: 'ALL',
    sort: 'DATE_DESC',
    fromDate: '',
    toDate: '',
  },
  ui: {
    activeTab: 'dashboard',
    toastTimer: null,
    lastImportSummary: null,
  },
};

const refs = {};
let modalTradeSnapshot = null;

function initRefs() {
  refs.signInBtn = $('#signInBtn');
  refs.signOutBtn = $('#signOutBtn');
  refs.modeBadge = $('#modeBadge');
  refs.userSummary = $('#userSummary');
  refs.summaryCards = $('#summaryCards');
  refs.recentTrades = $('#recentTrades');
  refs.journalTable = $('#journalTable');
  refs.tradeModal = $('#tradeModal');
  refs.tradeForm = $('#tradeForm');
  refs.tradeModalTitle = $('#tradeModalTitle');
  refs.toast = $('#toast');
  refs.fillsContainer = $('#fillsContainer');
  refs.tradeMetricsPreview = $('#tradeMetricsPreview');
  refs.strategyFilter = $('#strategyFilter');
  refs.duplicateTradeBtn = $('#duplicateTradeBtn');
  refs.deleteTradeBtn = $('#deleteTradeBtn');
  refs.importTradebookBtn = $('#importTradebookBtn');
  refs.importTradebookInput = $('#importTradebookInput');
  refs.importSummary = $('#importSummary');
}

function showToast(message, kind = 'info') {
  refs.toast.textContent = message;
  refs.toast.className = cn('toast', kind === 'error' && 'pill-red', kind === 'success' && 'pill-green');
  refs.toast.classList.remove('hidden');
  clearTimeout(state.ui.toastTimer);
  state.ui.toastTimer = setTimeout(() => refs.toast.classList.add('hidden'), 2600);
}

function getCurrency() {
  return state.settings.baseCurrency || 'INR';
}

function requireCloudAuth() {
  return state.mode === 'demo' || Boolean(state.user);
}

function switchTab(tabName) {
  state.ui.activeTab = tabName;
  $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
}

function updateModeBadge() {
  if (state.mode === 'demo') {
    refs.modeBadge.className = 'pill pill-amber';
    refs.modeBadge.textContent = 'Demo mode • local only';
    return;
  }
  if (state.user) {
    refs.modeBadge.className = 'pill pill-green';
    refs.modeBadge.textContent = 'Cloud mode • Firestore live';
    return;
  }
  refs.modeBadge.className = 'pill pill-blue';
  refs.modeBadge.textContent = 'Cloud mode • sign in needed';
}

function updateUserSummary() {
  const name = state.user?.displayName || (state.mode === 'demo' ? 'Demo Mode' : 'Signed out');
  const meta = state.user?.email || (state.mode === 'demo' ? 'Working from localStorage until you add Firebase config.' : 'Connect Google authentication to start syncing.');
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('') || 'TM';

  refs.userSummary.innerHTML = `
    <div class="avatar">${escapeHtml(initials.toUpperCase())}</div>
    <div>
      <div class="user-name">${escapeHtml(name)}</div>
      <div class="user-meta">${escapeHtml(meta)}</div>
    </div>
  `;

  refs.signInBtn.classList.toggle('hidden', state.mode === 'demo' || Boolean(state.user));
  refs.signOutBtn.classList.toggle('hidden', state.mode === 'demo' || !state.user);
  updateModeBadge();
}

function getRenderableTrades() {
  const filtered = filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  return sortTrades(filtered, state.filters.sort);
}

function renderSummaryCards() {
  if (!requireCloudAuth()) {
    refs.summaryCards.innerHTML = '<div class="empty-state">Sign in to see dashboard stats.</div>';
    return;
  }
  const summary = summarizeJournal(state.trades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const cards = [
    { label: 'Closed P&L', value: formatCurrency(summary.netPnl, getCurrency()), className: summary.netPnl >= 0 ? 'positive' : 'negative' },
    { label: 'Win rate', value: formatPercent(summary.winRate, 1), className: summary.winRate >= 50 ? 'positive' : 'warning' },
    { label: 'Profit factor', value: summary.profitFactor ? round(summary.profitFactor, 2).toFixed(2) : '—', className: summary.profitFactor >= 1.5 ? 'positive' : '' },
    { label: 'Expectancy', value: formatCurrency(summary.expectancy, getCurrency()), className: summary.expectancy >= 0 ? 'positive' : 'negative' },
    { label: 'Max drawdown', value: formatCurrency(summary.maxDrawdown, getCurrency()), className: 'negative' },
    { label: 'Open trades', value: String(summary.openTradeCount), className: '' },
  ];
  refs.summaryCards.innerHTML = cards
    .map(
      (card) => `
        <div class="panel metric-card">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value ${card.className || ''}">${card.value}</div>
        </div>
      `,
    )
    .join('');
}

function renderRecentTrades() {
  if (!requireCloudAuth()) {
    refs.recentTrades.innerHTML = '<div class="empty-state">Sign in to view your trades.</div>';
    return;
  }
  const items = getRenderableTrades().slice(0, 5);
  if (!items.length) {
    refs.recentTrades.innerHTML = '<div class="empty-state">No trades logged yet. Add your first trade to start building stats.</div>';
    return;
  }
  refs.recentTrades.innerHTML = items.map(renderTradeCard).join('');
}

function renderTradeCard(trade) {
  const metrics = trade.metrics || computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const statusPill = metrics.status === 'OPEN' ? '<span class="pill pill-blue">Open</span>' : '<span class="pill pill-green">Closed</span>';
  const directionPill = trade.direction === 'SHORT' ? '<span class="pill pill-red">Short</span>' : '<span class="pill pill-green">Long</span>';
  const pnlClass = metrics.realizedNetPnl >= 0 ? 'positive' : 'negative';
  const tags = (trade.tags || []).map((tag) => `<span class="trade-tag">${escapeHtml(tag)}</span>`).join('');

  return `
    <article class="trade-card" data-trade-id="${escapeHtml(trade.id)}">
      <div class="trade-card-head">
        <div>
          <div class="trade-symbol-wrap">
            <div class="trade-symbol">${escapeHtml(trade.symbol || '—')}</div>
            ${statusPill}
            ${directionPill}
            ${trade.strategy ? `<span class="pill pill-muted">${escapeHtml(trade.strategy)}</span>` : ''}
          </div>
          ${tags ? `<div class="trade-tags">${tags}</div>` : ''}
        </div>
        <div class="metric-value ${pnlClass}">${formatCurrency(metrics.realizedNetPnl, getCurrency())}</div>
      </div>
      <div class="trade-meta">
        <div>Opened: ${formatDateTime(metrics.entryAt || trade.createdAt)}</div>
        <div>Avg entry: ${metrics.avgEntryPrice ? formatCurrency(metrics.avgEntryPrice, getCurrency()) : '—'}</div>
        <div>Avg exit: ${metrics.avgExitPrice ? formatCurrency(metrics.avgExitPrice, getCurrency()) : '—'}</div>
        <div>Hold: ${formatDurationMinutes(metrics.holdMinutes)}</div>
      </div>
      <div class="trade-stats">
        <div class="stat-chip"><div class="label">Entry qty</div><div class="value">${metrics.totalEntryQty}</div></div>
        <div class="stat-chip"><div class="label">Exit qty</div><div class="value">${metrics.totalExitQty}</div></div>
        <div class="stat-chip"><div class="label">Open qty</div><div class="value">${metrics.openQty}</div></div>
        <div class="stat-chip"><div class="label">R multiple</div><div class="value">${metrics.realizedR != null ? round(metrics.realizedR, 2).toFixed(2) : '—'}</div></div>
        <div class="stat-chip"><div class="label">Fills</div><div class="value">${metrics.fillCount}</div></div>
      </div>
      ${trade.notes ? `<div class="trade-notes">${escapeHtml(trade.notes)}</div>` : ''}
      <div class="trade-actions">
        <button class="btn btn-ghost" data-action="duplicate" data-trade-id="${escapeHtml(trade.id)}">Duplicate</button>
        <button class="btn btn-ghost" data-action="edit" data-trade-id="${escapeHtml(trade.id)}">Edit</button>
        <button class="btn btn-danger" data-action="delete" data-trade-id="${escapeHtml(trade.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderJournalTable() {
  if (!requireCloudAuth()) {
    refs.journalTable.innerHTML = '<div class="panel empty-state">Sign in with Google to sync trades to Firestore. In demo mode, copy your Firebase config into <code>js/config.js</code>.</div>';
    return;
  }
  const items = getRenderableTrades();
  if (!items.length) {
    refs.journalTable.innerHTML = '<div class="panel empty-state">No trades match the current filters.</div>';
    return;
  }
  refs.journalTable.innerHTML = items.map(renderTradeCard).join('');
}

function renderStrategyFilter() {
  const strategies = [...new Set(state.trades.map((trade) => trade.strategy || 'Unspecified').filter(Boolean))].sort();
  refs.strategyFilter.innerHTML = '<option value="ALL">All</option>' + strategies.map((strategy) => `<option value="${escapeHtml(strategy)}">${escapeHtml(strategy)}</option>`).join('');
  refs.strategyFilter.value = state.filters.strategy;
}

function renderCharts() {
  if (!requireCloudAuth() || !state.trades.length) {
    chartManager.clearAll();
    return;
  }
  const method = state.settings.pnlMethod || PNL_METHODS.AVERAGE;
  const equity = buildEquityCurve(state.trades, method);
  const monthly = groupMonthlyPnl(state.trades, method);
  const strategies = groupPnlByField(state.trades, 'strategy', method).slice(0, 8);
  const weekdays = weekdayBreakdown(state.trades, method);

  chartManager.renderLine(
    'equity',
    $('#equityChart'),
    equity.map((item) => formatDate(item.date, { day: '2-digit', month: 'short' })),
    equity.map((item) => item.value),
    'Equity',
  );

  chartManager.renderBar(
    'monthly',
    $('#monthlyChart'),
    monthly.map((item) => item.label),
    monthly.map((item) => item.value),
    'Monthly P&L',
  );

  chartManager.renderHorizontalBar(
    'strategy',
    $('#strategyChart'),
    strategies.map((item) => item.label || 'Unspecified'),
    strategies.map((item) => item.value),
    'Strategy P&L',
  );

  chartManager.renderBar(
    'weekday',
    $('#weekdayChart'),
    weekdays.map((item) => item.label),
    weekdays.map((item) => item.winRate),
    'Weekday win rate',
  );
}

function renderAll() {
  updateUserSummary();
  renderStrategyFilter();
  renderSummaryCards();
  renderRecentTrades();
  renderJournalTable();
  renderImportSummary();
  renderCharts();
  renderSettingsForm();
}

function makeMetricPreviewCard(label, value, className = '') {
  return `<div class="panel metric-card"><div class="metric-label">${label}</div><div class="metric-value ${className}">${value}</div></div>`;
}

function createFillRow(fill = {}) {
  const row = document.createElement('div');
  row.className = 'fill-card';
  row.dataset.fillId = fill.id || uid('fill');
  row.innerHTML = `
    <div class="fill-row">
      <div class="fill-grid">
        <label class="field">
          <span>Date & time</span>
          <input data-fill-field="executedAt" type="datetime-local" value="${escapeHtml(fill.executedAt ? fill.executedAt.slice(0, 16) : todayLocalDateTimeInput())}" />
        </label>
        <label class="field">
          <span>Side</span>
          <select data-fill-field="side">
            <option value="BUY" ${fill.side === 'BUY' ? 'selected' : ''}>Buy</option>
            <option value="SELL" ${fill.side === 'SELL' ? 'selected' : ''}>Sell</option>
          </select>
        </label>
        <label class="field">
          <span>Qty</span>
          <input data-fill-field="qty" type="number" step="1" value="${fill.qty ?? ''}" />
        </label>
        <label class="field">
          <span>Price</span>
          <input data-fill-field="price" type="number" step="0.01" value="${fill.price ?? ''}" />
        </label>
        <label class="field">
          <span>Fees</span>
          <input data-fill-field="fees" type="number" step="0.01" value="${fill.fees ?? ''}" />
        </label>
      </div>
      <button type="button" class="btn btn-danger" data-action="remove-fill">Remove</button>
    </div>
    <label class="field compact-top">
      <span>Fill note</span>
      <input data-fill-field="note" type="text" value="${escapeHtml(fill.note || '')}" placeholder="Breakout add / partial profit / stop loss" />
    </label>
  `;
  refs.fillsContainer.appendChild(row);
}

function clearTradeForm() {
  refs.tradeForm.reset();
  $('#tradeId').value = '';
  refs.fillsContainer.innerHTML = '';
  modalTradeSnapshot = null;
  createFillRow({ side: 'BUY' });
  refs.tradeModalTitle.textContent = 'New trade';
  refs.duplicateTradeBtn.classList.add('hidden');
  refs.deleteTradeBtn.classList.add('hidden');
  syncTradePreview();
}

function openTradeModal(trade = null, mode = 'edit') {
  clearTradeForm();
  if (trade) {
    modalTradeSnapshot = deepClone(trade);
    $('#tradeId').value = trade.id || '';
    $('#tradeSymbol').value = trade.symbol || '';
    $('#tradeDirection').value = trade.direction || 'LONG';
    $('#tradeStrategy').value = trade.strategy || '';
    $('#tradePlannedRisk').value = trade.plannedRisk || '';
    $('#tradePlannedStop').value = trade.plannedStop || '';
    $('#tradeMbiScore').value = trade.mbiScore ?? '';
    $('#tradeTags').value = stringifyTags(trade.tags || []);
    $('#tradeNotes').value = trade.notes || '';
    refs.fillsContainer.innerHTML = '';
    (trade.fills || []).forEach((fill) => createFillRow(fill));
    refs.tradeModalTitle.textContent = mode === 'duplicate' ? `Duplicate ${trade.symbol}` : `Edit ${trade.symbol}`;
    refs.duplicateTradeBtn.classList.toggle('hidden', mode === 'duplicate');
    refs.deleteTradeBtn.classList.add('hidden');
    if (mode === 'edit') {
      refs.deleteTradeBtn.classList.remove('hidden');
      refs.duplicateTradeBtn.classList.remove('hidden');
    }
    if (mode === 'duplicate') {
      $('#tradeId').value = '';
      refs.deleteTradeBtn.classList.add('hidden');
    }
  }
  refs.tradeModal.classList.remove('hidden');
  refs.tradeModal.setAttribute('aria-hidden', 'false');
  syncTradePreview();
}

function closeTradeModal() {
  refs.tradeModal.classList.add('hidden');
  refs.tradeModal.setAttribute('aria-hidden', 'true');
}

function readTradeForm() {
  const fills = [...refs.fillsContainer.querySelectorAll('.fill-card')].map((card) => ({
    id: card.dataset.fillId || uid('fill'),
    executedAt: card.querySelector('[data-fill-field="executedAt"]').value,
    side: card.querySelector('[data-fill-field="side"]').value,
    qty: Number(card.querySelector('[data-fill-field="qty"]').value || 0),
    price: Number(card.querySelector('[data-fill-field="price"]').value || 0),
    fees: Number(card.querySelector('[data-fill-field="fees"]').value || 0),
    note: card.querySelector('[data-fill-field="note"]').value || '',
  }));

  return normalizeTradePayload({
    id: $('#tradeId').value || uid('trade'),
    symbol: $('#tradeSymbol').value,
    direction: $('#tradeDirection').value,
    strategy: $('#tradeStrategy').value,
    plannedRisk: $('#tradePlannedRisk').value,
    plannedStop: $('#tradePlannedStop').value,
    mbiScore: $('#tradeMbiScore').value,
    tags: parseTags($('#tradeTags').value),
    notes: $('#tradeNotes').value,
    fills,
    createdAt: modalTradeSnapshot?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function syncTradePreview() {
  try {
    const trade = readTradeForm();
    if (!trade.symbol || !(trade.fills || []).length) {
      refs.tradeMetricsPreview.innerHTML = makeMetricPreviewCard('Status', 'Start filling the trade form');
      return;
    }
    const metrics = computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
    refs.tradeMetricsPreview.innerHTML = [
      makeMetricPreviewCard('Status', metrics.status),
      makeMetricPreviewCard('Avg entry', metrics.avgEntryPrice ? formatCurrency(metrics.avgEntryPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Avg exit', metrics.avgExitPrice ? formatCurrency(metrics.avgExitPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Open qty', String(metrics.openQty)),
      makeMetricPreviewCard('Net P&L', formatCurrency(metrics.realizedNetPnl, getCurrency()), metrics.realizedNetPnl >= 0 ? 'positive' : 'negative'),
      makeMetricPreviewCard('R multiple', metrics.realizedR != null ? round(metrics.realizedR, 2).toFixed(2) : '—'),
    ].join('');
  } catch (error) {
    refs.tradeMetricsPreview.innerHTML = makeMetricPreviewCard('Validation', escapeHtml(error.message || 'Fill data is incomplete'), 'warning');
  }
}

function renderImportSummary() {
  if (!refs.importSummary) return;
  const summary = state.ui.lastImportSummary;
  if (!summary) {
    refs.importSummary.textContent = 'Tradebook CSV import accepts raw broker rows and groups them into flat-to-flat journal trades automatically. Unmatched closing-only rows are skipped and reported.';
    return;
  }
  const skippedTail = summary.skippedSymbols?.length
    ? `Skipped symbols: ${summary.skippedSymbols.slice(0, 6).join(', ')}${summary.skippedSymbols.length > 6 ? '…' : ''}.`
    : 'No orphan closing rows were skipped.';
  refs.importSummary.innerHTML = `
    <div class="import-summary">
      <strong>Last import:</strong> ${escapeHtml(summary.fileName || 'tradebook.csv')} •
      ${Number(summary.rawRowCount || 0).toLocaleString('en-IN')} rows →
      ${Number(summary.mergedFillCount || 0).toLocaleString('en-IN')} merged fills →
      ${Number(summary.tradeCount || 0).toLocaleString('en-IN')} journal trades
      (${Number(summary.closedTradeCount || 0)} closed, ${Number(summary.openTradeCount || 0)} open).<br />
      ${escapeHtml(skippedTail)}
    </div>
  `;
}

function mergeImportedTradeWithExisting(importedTrade) {
  const existing = state.trades.find((item) => item.id === importedTrade.id);
  if (!existing) return importedTrade;
  return normalizeTradePayload({
    ...importedTrade,
    strategy: existing.strategy || importedTrade.strategy,
    plannedRisk: existing.plannedRisk || importedTrade.plannedRisk,
    plannedStop: existing.plannedStop || importedTrade.plannedStop,
    mbiScore: existing.mbiScore ?? importedTrade.mbiScore,
    tags: [...new Set([...(importedTrade.tags || []), ...(existing.tags || [])])],
    notes: existing.notes || importedTrade.notes,
    createdAt: existing.createdAt || importedTrade.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

async function handleTradebookImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!requireCloudAuth()) throw new Error('Sign in first before importing trades to the cloud journal.');
    const text = await file.text();
    const imported = importTradebookCsv(text, {
      fileName: file.name,
      allowLeadingSell: false,
      allowReversal: true,
    });

    if (!imported.trades.length) {
      throw new Error('No complete trade cycles were found in this CSV. Try exporting a longer history from your broker.');
    }

    const preparedTrades = imported.trades.map(mergeImportedTradeWithExisting);
    const confirmMessage = [
      `Import ${preparedTrades.length} trades from ${file.name}?`,
      `${Number(imported.summary.rawRowCount || 0).toLocaleString('en-IN')} raw rows will become ${Number(imported.summary.mergedFillCount || 0).toLocaleString('en-IN')} merged fills.`,
      imported.summary.skippedCount
        ? `${Number(imported.summary.skippedCount).toLocaleString('en-IN')} unmatched closing fill groups will be skipped because this CSV starts after those positions were opened.`
        : 'No unmatched closing rows were found.',
      'Existing imported trades with the same ID will be refreshed while preserving your notes, tags, and setup fields.',
    ].join('\n\n');

    if (!window.confirm(confirmMessage)) return;

    if (typeof state.storage.saveTrades === 'function') {
      await state.storage.saveTrades(preparedTrades);
    } else {
      for (const trade of preparedTrades) {
        await state.storage.saveTrade(trade);
      }
    }

    state.ui.lastImportSummary = {
      ...imported.summary,
      fileName: file.name,
      tradeCount: preparedTrades.length,
    };
    renderImportSummary();
    showToast(`Imported ${preparedTrades.length} trades from tradebook CSV.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Tradebook import failed.', 'error');
  } finally {
    event.target.value = '';
  }
}

function renderSettingsForm() {
  $('#settingsPnlMethod').value = state.settings.pnlMethod || 'AVERAGE';
  $('#settingsCurrency').value = state.settings.baseCurrency || 'INR';
}

function exportCsv() {
  const rows = toCsvRows(state.trades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadTextFile(`trademaster-journal-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

function exportJson() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    trades: state.trades,
  };
  downloadTextFile(`trademaster-journal-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
}

async function handleDeleteTrade(tradeId) {
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) return;
  const confirmed = window.confirm(`Delete trade ${trade.symbol}?`);
  if (!confirmed) return;
  try {
    await state.storage.deleteTrade(tradeId);
    showToast('Trade deleted.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not delete trade.', 'error');
  }
}

function handleJournalClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const tradeId = button.dataset.tradeId;
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) return;
  const action = button.dataset.action;
  if (action === 'edit') openTradeModal(trade, 'edit');
  if (action === 'duplicate') openTradeModal(deepClone(trade), 'duplicate');
  if (action === 'delete') handleDeleteTrade(tradeId);
}

function renderCalculator() {
  const solver = solvePositionCalculator({
    capital: $('#calcCapital').value,
    riskPercent: $('#calcRiskPercent').value,
    entry: $('#calcEntry').value,
    slPrice: $('#calcSlPrice').value,
    slPercent: $('#calcSlPercent').value,
    positionSize: $('#calcPositionSize').value,
    riskAmount: $('#calcRiskAmount').value,
    lastEdited: $('#calcLastEdited').value,
  });

  $('#calcQty').textContent = String(solver.qty || 0);
  $('#calcValue').textContent = formatCurrency(solver.totalValue || 0, getCurrency());
  $('#calcActualRisk').textContent = formatCurrency(solver.actualRisk || 0, getCurrency());
  $('#calcPositionPercent').textContent = formatPercent(solver.positionPercent || 0, 1);
  $('#calcRiskCapitalPercent').textContent = formatPercent(solver.riskOfCapital || 0, 2);
  $('#calcTrailLocked').textContent = formatCurrency(lockedPnl(solver.entry, $('#calcTrailPrice').value, solver.qty, solver.long), getCurrency());

  if (document.activeElement !== $('#calcSlPrice') && solver.slPrice) $('#calcSlPrice').value = solver.slPrice;
  if (document.activeElement !== $('#calcSlPercent') && solver.slPercent) $('#calcSlPercent').value = solver.slPercent;
  if (document.activeElement !== $('#calcPositionSize') && solver.positionSize) $('#calcPositionSize').value = solver.positionSize;
  if (document.activeElement !== $('#calcRiskAmount') && solver.riskAmount) $('#calcRiskAmount').value = solver.riskAmount;

  const target = projectTarget({
    entry: solver.entry,
    slPrice: solver.slPrice,
    qty: solver.qty,
    targetR: $('#targetR').value,
    targetPercent: $('#targetPercent').value,
    exitPrice: $('#targetExitPrice').value,
  });
  if (document.activeElement !== $('#targetExitPrice') && target.exitPrice) $('#targetExitPrice').value = target.exitPrice;
  if (document.activeElement !== $('#targetR') && target.targetR) $('#targetR').value = target.targetR;
  if (document.activeElement !== $('#targetPercent') && target.targetPercent) $('#targetPercent').value = target.targetPercent;
  $('#targetPnl').textContent = formatCurrency(target.pnl || 0, getCurrency());
  $('#targetPnl').className = cn('metric-value', (target.pnl || 0) >= 0 ? 'positive' : 'negative');
  $('#targetNetPnl').textContent = formatCurrency(target.charges.net || 0, getCurrency());
  $('#targetNetPnl').className = cn('metric-value', (target.charges.net || 0) >= 0 ? 'positive' : 'negative');
  $('#chargesBrokerage').textContent = formatCurrency(target.charges.brokerage || 0, getCurrency());
  $('#chargesStt').textContent = formatCurrency(target.charges.stt || 0, getCurrency());
  $('#chargesOther').textContent = formatCurrency(target.charges.other || 0, getCurrency());
  $('#chargesTotal').textContent = formatCurrency(target.charges.total || 0, getCurrency());
}

function renderMbi() {
  const mbi = calculateMbi({
    a20: $('#mbiA20').value,
    a50: $('#mbiA50').value,
    a200: $('#mbiA200').value,
    nb: $('#mbiNb').value,
    wh: $('#mbiWh').value,
    wl: $('#mbiWl').value,
    bosf: $('#mbiBosf').value,
    uhlh: $('#mbiUhlh').value,
    vol: $('#mbiVol').value,
    adv: $('#mbiAdv').value,
    nhl: $('#mbiNhl').value,
    bd: $('#mbiBd').value,
  });

  if (!mbi.ready) {
    $('#mbiScore').textContent = '—';
    $('#mbiZone').textContent = 'Fill all inputs';
    $('#mbiActionText').textContent = 'Your swing and intraday guidance will appear here.';
    $('#mbiSignals').innerHTML = '<div class="panel-note">Signals will populate once all breadth inputs are filled.</div>';
    $('#mbiBreakdown').innerHTML = '';
    $('#mbiSizing').innerHTML = '';
    return;
  }

  $('#mbiScore').textContent = String(mbi.score);
  $('#mbiScore').style.color = mbi.color === 'green' ? 'var(--green)' : mbi.color === 'amber' ? 'var(--amber)' : mbi.color === 'red' ? 'var(--red)' : 'var(--slate)';
  $('#mbiZone').textContent = mbi.zone;
  $('#mbiZone').style.color = $('#mbiScore').style.color;
  $('#mbiActionText').textContent = `Swing: ${mbi.swingAction} Intraday: ${mbi.intradayAction}`;

  $('#mbiSignals').innerHTML = mbi.signals.length
    ? mbi.signals.map((signal) => `<div class="signal ${signal.level}">${escapeHtml(signal.text)}</div>`).join('')
    : '<div class="panel-note">No major overrides. Base zone rules apply.</div>';

  $('#mbiBreakdown').innerHTML = mbi.breakdown
    .map((item) => `
      <div class="breakdown-item">
        <div class="top">
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="value ${item.score >= 0 ? 'positive' : 'negative'}">${item.score > 0 ? '+' : ''}${item.score}</div>
        </div>
        <div class="raw">${escapeHtml(item.raw)}</div>
      </div>
    `)
    .join('');

  $('#mbiSizing').innerHTML = mbi.sizing.maxTradeValue
    ? [
        makeMetricPreviewCard('Max trade', formatCompactCurrency(mbi.sizing.maxTradeValue, getCurrency())),
        makeMetricPreviewCard('Max positions', String(mbi.sizing.maxPositions)),
        makeMetricPreviewCard('Max hold', `${mbi.sizing.maxHoldDays} days`),
        makeMetricPreviewCard('Intraday', mbi.sizing.intradayAllowed ? 'Allowed' : 'Skip'),
      ].join('')
    : '<div class="panel-note">No new positions recommended in this zone.</div>';
}

function renderSellCheck() {
  const sell = quickSellCalculator({
    buyPrice: $('#sellBuyPrice').value,
    currentPrice: $('#sellCurrentPrice').value,
    qty: $('#sellQty').value,
    daysHeld: $('#sellDaysHeld').value,
  });

  $('#sellPnl').textContent = formatCurrency(sell.pnl || 0, getCurrency());
  $('#sellPnl').className = cn('metric-value', (sell.pnl || 0) >= 0 ? 'positive' : 'negative');
  $('#sellPnlPercent').textContent = formatPercent(sell.pnlPercent || 0, 2);
  $('#sellPnlPercent').className = cn('metric-value', (sell.pnlPercent || 0) >= 0 ? 'positive' : 'negative');
  $('#sellAdvice').textContent = sell.advice;

  const checklist = buildSellChecklist({
    pnlPercent: sell.pnlPercent || 0,
    daysHeld: Number($('#sellDaysHeld').value || 0),
    mbiScore: Number($('#sellMbiScore').value || 0),
    prevScore: Number($('#sellPrevScore').value || 0),
    lows52wPercent: Number($('#sell52wLows').value || 0),
    above20maPercent: Number($('#sellAbove20').value || 0),
  });

  $('#sellChecklist').innerHTML = checklist
    .map((item) => `
      <div class="check-item">
        <div class="check-badge ${item.level}">${item.order}</div>
        <div>
          <div><strong>${escapeHtml(item.question)}</strong></div>
          <div class="check-copy">${escapeHtml(item.action)}</div>
        </div>
      </div>
    `)
    .join('');
}

async function subscribeToTrades() {
  if (state.unsubTrades) {
    state.unsubTrades();
    state.unsubTrades = null;
  }
  state.unsubTrades = state.storage.subscribeTrades(
    (trades) => {
      state.trades = (trades || []).map((trade) => ({ ...trade, metrics: computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE) }));
      renderAll();
    },
    (error) => showToast(error.message || 'Could not load trades.', 'error'),
  );
}

async function handleAuthChanged(user) {
  state.user = user;
  if (state.mode === 'cloud' && user) {
    state.settings = (await state.storage.loadSettings()) || { ...defaultSettings };
    await subscribeToTrades();
  } else if (state.mode === 'cloud' && !user) {
    if (state.unsubTrades) state.unsubTrades();
    state.unsubTrades = null;
    state.trades = [];
    state.settings = { ...defaultSettings };
  } else {
    state.settings = (await state.storage.loadSettings()) || { ...defaultSettings };
    await subscribeToTrades();
  }
  renderAll();
}

function bindTabEvents() {
  $('#mainTabs').addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (!button) return;
    switchTab(button.dataset.tab);
  });
}

function bindToolbarEvents() {
  refs.signInBtn.addEventListener('click', async () => {
    try {
      await state.storage.signIn();
      showToast('Signed in successfully.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Sign-in failed.', 'error');
    }
  });

  refs.signOutBtn.addEventListener('click', async () => {
    try {
      await state.storage.signOut();
      showToast('Signed out.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not sign out.', 'error');
    }
  });

  $('#openTradeModalBtn').addEventListener('click', () => openTradeModal());
  $('#addTradeFromDashboard').addEventListener('click', () => openTradeModal());
  $('#closeTradeModalBtn').addEventListener('click', closeTradeModal);
  refs.tradeModal.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-modal')) closeTradeModal();
  });

  $('#addBuyFillBtn').addEventListener('click', () => createFillRow({ side: 'BUY' }));
  $('#addSellFillBtn').addEventListener('click', () => createFillRow({ side: 'SELL' }));

  refs.fillsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove-fill"]');
    if (!button) return;
    const card = button.closest('.fill-card');
    if (card) card.remove();
    if (!refs.fillsContainer.children.length) createFillRow({ side: 'BUY' });
    syncTradePreview();
  });
  refs.tradeForm.addEventListener('input', syncTradePreview);
  refs.tradeForm.addEventListener('change', syncTradePreview);

  refs.tradeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const trade = readTradeForm();
      if (!trade.symbol) throw new Error('Symbol is required.');
      if (!(trade.fills || []).length) throw new Error('Add at least one fill.');
      computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
      await state.storage.saveTrade(trade);
      closeTradeModal();
      showToast('Trade saved.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not save trade.', 'error');
    }
  });

  refs.duplicateTradeBtn.addEventListener('click', () => {
    try {
      const trade = readTradeForm();
      trade.id = uid('trade');
      trade.fills = trade.fills.map((fill) => ({ ...fill, id: uid('fill') }));
      openTradeModal(trade, 'duplicate');
    } catch (error) {
      showToast(error.message || 'Could not duplicate trade.', 'error');
    }
  });

  refs.deleteTradeBtn.addEventListener('click', async () => {
    const tradeId = $('#tradeId').value;
    if (!tradeId) return;
    await handleDeleteTrade(tradeId);
    closeTradeModal();
  });

  refs.journalTable.addEventListener('click', handleJournalClick);
  refs.recentTrades.addEventListener('click', handleJournalClick);

  refs.importTradebookBtn.addEventListener('click', () => refs.importTradebookInput.click());
  refs.importTradebookInput.addEventListener('change', handleTradebookImport);
  $('#exportCsvBtn').addEventListener('click', exportCsv);
  $('#exportJsonBtn').addEventListener('click', exportJson);

  const bindFilter = (selector, key) => {
    $(selector).addEventListener('input', (event) => {
      state.filters[key] = event.target.value;
      renderJournalTable();
      renderRecentTrades();
    });
    $(selector).addEventListener('change', (event) => {
      state.filters[key] = event.target.value;
      renderJournalTable();
      renderRecentTrades();
    });
  };

  bindFilter('#searchInput', 'search');
  bindFilter('#statusFilter', 'status');
  bindFilter('#directionFilter', 'direction');
  bindFilter('#resultFilter', 'result');
  bindFilter('#strategyFilter', 'strategy');
  bindFilter('#sortSelect', 'sort');
  bindFilter('#fromDateFilter', 'fromDate');
  bindFilter('#toDateFilter', 'toDate');

  [
    '#calcCapital', '#calcRiskPercent', '#calcLastEdited', '#calcEntry', '#calcSlPrice', '#calcSlPercent', '#calcPositionSize', '#calcRiskAmount', '#calcTrailPrice', '#targetR', '#targetPercent', '#targetExitPrice',
  ].forEach((selector) => $(selector).addEventListener('input', renderCalculator));
  [
    '#mbiA20', '#mbiA50', '#mbiA200', '#mbiNb', '#mbiWh', '#mbiWl', '#mbiBosf', '#mbiUhlh', '#mbiVol', '#mbiAdv', '#mbiNhl', '#mbiBd',
  ].forEach((selector) => $(selector).addEventListener('input', renderMbi));
  [
    '#sellBuyPrice', '#sellCurrentPrice', '#sellQty', '#sellDaysHeld', '#sellMbiScore', '#sellPrevScore', '#sell52wLows', '#sellAbove20',
  ].forEach((selector) => $(selector).addEventListener('input', renderSellCheck));

  $('#saveSettingsBtn').addEventListener('click', async () => {
    try {
      state.settings = await state.storage.saveSettings({
        pnlMethod: $('#settingsPnlMethod').value,
        baseCurrency: $('#settingsCurrency').value,
      });
      renderAll();
      syncTradePreview();
      renderCalculator();
      showToast('Settings saved.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not save settings.', 'error');
    }
  });

  $('#backupDriveBtn').addEventListener('click', async () => {
    try {
      const payload = { version: 1, exportedAt: new Date().toISOString(), settings: state.settings, trades: state.trades };
      await state.storage.backupToDrive(payload);
      showToast('Backup saved to Google Drive.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Backup failed.', 'error');
    }
  });

  $('#restoreDriveBtn').addEventListener('click', async () => {
    try {
      const payload = await state.storage.restoreFromDrive();
      if (!payload?.trades) throw new Error('Backup file is invalid.');
      await state.storage.replaceAllData(payload);
      showToast('Backup restored. Refreshing data…', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Restore failed.', 'error');
    }
  });

  $('#importJsonBtn').addEventListener('click', () => $('#importJsonInput').click());
  $('#importJsonInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = Array.isArray(payload) ? { trades: payload, settings: state.settings } : payload;
      if (!Array.isArray(data.trades)) throw new Error('JSON must contain a trades array.');
      await state.storage.replaceAllData(data);
      showToast('JSON imported successfully.', 'success');
      event.target.value = '';
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Import failed.', 'error');
    }
  });
}

async function bootstrap() {
  initRefs();
  bindTabEvents();
  bindToolbarEvents();
  clearTradeForm();

  const config = window.TRADEMASTER_CONFIG?.firebase || {};
  state.storage = await createStorageLayer(config);
  state.mode = state.storage.mode;
  const initial = await state.storage.init();
  state.user = initial.user;
  state.settings = initial.settings || { ...defaultSettings };
  state.trades = (initial.trades || []).map((trade) => ({ ...trade, metrics: computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE) }));

  state.storage.onAuthChanged(handleAuthChanged);
  renderAll();
  renderCalculator();
  renderMbi();
  renderSellCheck();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<div class="shell"><div class="panel"><div class="section-title">App failed to load</div><p class="section-copy">${escapeHtml(error.message || 'Unknown error')}</p></div></div>`;
});
