import { createStorageLayer, defaultSettings } from './storage.js';
import {
  PNL_METHODS,
  TRADE_TIMEFRAMES,
  summarizeJournal,
  buildEquityCurve,
  groupMonthlyPnl,
  normalizeTradePayload,
  filterTrades,
  sortTrades,
  computeTradeMetrics,
  inferTradeTimeframe,
  toCsvRows,
} from './trade-engine.js';
import { solvePositionCalculator, projectTarget, lockedPnl } from './calc.js';
import { createChartManager } from './charts.js';
import { importTradebookCsv } from './tradebook-importer.js';
import { formatBytes, prepareImageForUpload, revokePreparedPreview } from './image-tools.js';
import {
  createLinkedWinnerDraft,
  normalizeWinnerPayload,
  normalizeWinnerMoves,
  summarizeWinnerPattern,
  filterWinnerEntries,
  sortWinnerEntries,
  summarizeWinnerEntries,
} from './winner-db.js';
import {
  $, $$,
  cn,
  deepClone,
  downloadTextFile,
  escapeHtml,
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
  user: null,
  sessionEpoch: 0,
  settings: { ...defaultSettings },
  trades: [],
  winners: [],
  unsubTrades: null,
  unsubWinners: null,
  filters: {
    search: '', periodPreset: 'ALL', status: 'ALL', direction: 'ALL', result: 'ALL',
    timeframe: 'ALL', strategy: 'ALL', lossWorseThan: '', minAbsMove: '', maxDipBeforeMove: '',
    sort: 'DATE_DESC', fromDate: '', toDate: '',
  },
  winnerFilters: {
    search: '', sector: 'ALL', type: 'ALL', setup: 'ALL', timeframe: 'ALL', period: 'ALL',
    minMove: '', minInitialMove: '', maxDipBeforeMove: '', maxStage4Decline: '',
    minMoveCount: '', minBaseCount: '', minAvgExpansion: '', minMaxExpansion: '',
    minBiggestBaseLength: '', maxDeepestBase: '', hasImage: 'ALL', sort: 'DATE_DESC',
  },
  ui: {
    activeTab: 'calculator', toastTimer: null, lastImportSummary: null,
    winnerImageDraft: null, tradeDraft: null, winnerDraft: null,
  },
};

const refs = {};
let modalTradeSnapshot = null;
let modalWinnerSnapshot = null;

function initRefs() {
  for (const id of [
    'mainTabs', 'signInBtn', 'phoneSignInBtn', 'signOutBtn', 'authStatus', 'accountMenuBtn', 'accountSignOutBtn',
    'accountModal', 'accountModalCopy', 'closeAccountModalBtn', 'openAccountFromJournalBtn',
    'settingsPnlMethod', 'settingsCurrency', 'saveSettingsBtn', 'settingsSaveStatus',
    'phoneAuthModal', 'phoneAuthForm', 'phoneAuthTitle', 'phoneNumberStep', 'phoneCodeStep',
    'phoneNumberInput', 'phoneCodeInput', 'requestPhoneCodeBtn', 'confirmPhoneCodeBtn',
    'closePhoneAuthBtn', 'restartPhoneAuthBtn', 'phoneAuthStatus', 'journalAccessNotice',
    'winnerAccessNotice', 'journalSummaryCards', 'journalStatsCards', 'journalStatsNote',
    'journalFilterSummary', 'importSummary', 'journalChartsEmpty', 'journalPerformanceDetails',
    'journalTable', 'equityChart', 'monthlyChart', 'strategyFilter', 'openTradeModalBtn', 'importTradebookBtn', 'importTradebookInput',
    'exportCsvBtn', 'tradeModal', 'tradeForm', 'tradeModalTitle', 'closeTradeModalBtn',
    'tradeId', 'tradeSymbol', 'tradeDirection', 'tradeTimeframe', 'tradeStrategy', 'tradePlannedRisk',
    'tradePlannedStop', 'tradeDipBeforeMove', 'tradeTags', 'tradeNotes', 'fillsContainer',
    'addBuyFillBtn', 'addSellFillBtn', 'tradeMetricsPreview', 'tradeSaveStatus', 'saveTradeBtn',
    'duplicateTradeBtn', 'deleteTradeBtn', 'winnerTable', 'winnerSummaryCards', 'winnerFilterSummary',
    'winnerSectorFilter', 'winnerTypeFilter', 'winnerSetupFilter', 'winnerTimeframeFilter',
    'winnerPeriodFilter', 'winnerHasImageFilter', 'winnerSortSelect', 'openWinnerModalBtn',
    'winnerModal', 'winnerForm', 'winnerModalTitle', 'winnerId', 'winnerStockName', 'winnerSector',
    'winnerType', 'winnerSetup', 'winnerTimeframe', 'winnerBreakoutDate', 'winnerCircuits',
    'winnerPeriod', 'winnerInitialMove', 'winnerBaseLength', 'winnerMove', 'winnerDipBeforeMove',
    'winnerStage4Decline', 'winnerImageUrl', 'winnerImageStoragePath', 'winnerTags', 'winnerNotes',
    'winnerSourceTradeSection', 'winnerImagePreview', 'winnerImageFile', 'pickWinnerImageBtn',
    'clearWinnerImageBtn', 'winnerMovesBuilder', 'winnerMovesSummary', 'addWinnerMoveBtn',
    'winnerSaveStatus', 'saveWinnerBtn', 'deleteWinnerBtn', 'closeWinnerModalBtn', 'imagePreviewModal',
    'imagePreview', 'imagePreviewTitle', 'closeImagePreviewBtn', 'resetCalcBtn', 'pushCalcToTradeBtn',
    'calcCapital', 'calcRiskPercent', 'calcEntry', 'calcSlPrice', 'calcLastEdited', 'calcSlPercent',
    'calcPositionSize', 'calcRiskAmount', 'calcTrailPrice', 'calcQty', 'calcValue', 'calcActualRisk',
    'calcPositionPercent', 'calcRiskCapitalPercent', 'calcTrailLocked', 'calcDirectionPill', 'calcHint',
    'targetR', 'targetPercent', 'targetExitPrice', 'targetPnl', 'targetNetPnl', 'chargesBrokerage',
    'chargesStt', 'chargesOther', 'chargesTotal', 'toast',
  ]) refs[id] = $(`#${id}`);
}

function showToast(message, kind = 'info') {
  refs.toast.textContent = message;
  refs.toast.className = cn('toast', kind === 'error' && 'pill-red', kind === 'success' && 'pill-green');
  refs.toast.classList.remove('hidden');
  clearTimeout(state.ui.toastTimer);
  state.ui.toastTimer = setTimeout(() => refs.toast.classList.add('hidden'), 3200);
}

function friendlyError(error, fallback = 'Something went wrong.') {
  const code = String(error?.code || '').replace(/^firebase\//, '');
  const messages = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled. You can try again when ready.',
    'auth/unauthorized-domain': 'This web address is not authorized in Firebase Authentication. Add the current Hosting domain in Firebase Console.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/quota-exceeded': 'Firebase has reached an authentication quota. Try again later or use a configured test number.',
    'auth/invalid-phone-number': 'Enter a valid phone number with country code.',
    'auth/invalid-verification-code': 'That verification code is not valid. Check it and try again.',
    'permission-denied': 'Firebase denied this account action. Check the signed-in account and deployed rules.',
    'storage/unauthorized': 'Firebase Storage denied this screenshot action. Check the signed-in account and Storage rules.',
    'storage/unknown': 'Firebase Storage could not complete the screenshot action. Check the connection and try again.',
    'storage/canceled': 'The screenshot upload was cancelled. The prepared image is still available to retry.',
    'unavailable': 'Firebase is temporarily unavailable. Check the connection and retry; the form is still open.',
    'deadline-exceeded': 'Firebase did not confirm this operation in time. The result is uncertain; retry only after checking the record.',
    'network-request-failed': 'The network request failed. Check the connection and retry; your form is still open.',
  };
  const message = messages[code] || error?.message || fallback;
  return code && !message.includes(code) ? `${message} (Code: ${code})` : message;
}

function setFormStatus(ref, message = '', kind = '') {
  if (!ref) return;
  ref.textContent = message;
  ref.className = cn('form-status', kind && `form-status-${kind}`);
  if (kind) ref.dataset.state = kind;
  else delete ref.dataset.state;
}

function isPrivateDataAvailable() {
  return Boolean(state.user);
}

function getCurrency() {
  return state.settings.baseCurrency || 'INR';
}

function canUploadWinnerImages() {
  return Boolean(state.user) && Boolean(state.storage?.storageAvailable);
}

function clearWinnerImageDraft() {
  if (state.ui.winnerImageDraft?.prepared) revokePreparedPreview(state.ui.winnerImageDraft.prepared);
  state.ui.winnerImageDraft = null;
  if (refs.winnerImageFile) refs.winnerImageFile.value = '';
}

function looksLikeViewableImageUrl(value = '') {
  return /^(https?:\/\/|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(String(value).trim());
}

function winnerImageEmptyState() {
  if (canUploadWinnerImages()) return 'Choose a screenshot or paste an external image URL.';
  if (!state.user) return 'Sign in with Google or phone to upload screenshots to Firebase Storage.';
  return 'Firebase Storage is not configured. Paste an external image URL instead.';
}

function switchTab(tabName) {
  if (!['calculator', 'journal', 'winners'].includes(tabName)) return;
  state.ui.activeTab = tabName;
  $$('.tab').forEach((button) => { const active = button.dataset.tab === tabName; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
  requestAnimationFrame(() => renderCharts());
}

function updateUserSummary() {
  const signedIn = Boolean(state.user);
  const ready = Boolean(state.storage);
  refs.signInBtn.classList.toggle('hidden', signedIn);
  refs.phoneSignInBtn.classList.toggle('hidden', signedIn);
  refs.signOutBtn.classList.toggle('hidden', !signedIn);
  refs.signInBtn.disabled = !ready;
  refs.phoneSignInBtn.disabled = !ready;
  refs.signOutBtn.disabled = !ready;
  refs.accountSignOutBtn.classList.toggle('hidden', !signedIn);
  refs.accountSignOutBtn.disabled = !ready;
  refs.authStatus.textContent = signedIn
    ? `Signed in${state.user.email ? ` · ${state.user.email}` : ''}`
    : 'Signed out · sign in to view private data';
  refs.journalAccessNotice.textContent = signedIn
    ? ''
    : 'Sign in with Google or phone to load your private journal. The calculator remains available while signed out.';
  refs.winnerAccessNotice.textContent = signedIn
    ? ''
    : 'Sign in with Google or phone to load your private Winner Database.';
}

function periodPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (date) => date.toISOString().slice(0, 10);
  if (preset === 'THIS_MONTH') return { fromDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), toDate: iso(now) };
  if (preset === 'LAST_30') { today.setDate(today.getDate() - 29); return { fromDate: iso(today), toDate: iso(now) }; }
  if (preset === 'LAST_90') { today.setDate(today.getDate() - 89); return { fromDate: iso(today), toDate: iso(now) }; }
  if (preset === 'YTD') return { fromDate: iso(new Date(now.getFullYear(), 0, 1)), toDate: iso(now) };
  return { fromDate: '', toDate: '' };
}

function getFilteredTradesRaw() {
  return filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE)
    .map(({ metrics, ...trade }) => trade);
}

function getRenderableTrades() {
  return sortTrades(
    filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE),
    state.filters.sort,
  );
}

function getRenderableWinners() {
  return sortWinnerEntries(filterWinnerEntries(state.winners, state.winnerFilters), state.winnerFilters.sort);
}

function activeTradeFilterLabels() {
  const f = state.filters;
  const labels = [];
  if (f.search) labels.push(`Search: ${f.search}`);
  if (f.periodPreset && f.periodPreset !== 'ALL' && f.periodPreset !== 'CUSTOM') labels.push(f.periodPreset.replace(/_/g, ' '));
  if (f.status !== 'ALL') labels.push(f.status);
  if (f.direction !== 'ALL') labels.push(f.direction);
  if (f.result !== 'ALL') labels.push(f.result === 'WIN' ? 'Winners' : 'Losers');
  if (f.timeframe !== 'ALL') labels.push(f.timeframe);
  if (f.strategy !== 'ALL') labels.push(`Strategy: ${f.strategy}`);
  if (f.lossWorseThan) labels.push(`Loss ≤ -${f.lossWorseThan}%`);
  if (f.minAbsMove) labels.push(`Move ≥ ${f.minAbsMove}%`);
  if (f.maxDipBeforeMove) labels.push(`Dip ≤ ${f.maxDipBeforeMove}%`);
  if (f.fromDate || f.toDate) labels.push(`${f.fromDate || '…'} → ${f.toDate || '…'}`);
  return labels;
}

function activeWinnerFilterLabels() {
  const f = state.winnerFilters;
  const labels = [];
  if (f.search) labels.push(`Search: ${f.search}`);
  if (f.setup !== 'ALL') labels.push(`Setup: ${f.setup}`);
  if (f.sector !== 'ALL') labels.push(`Sector: ${f.sector}`);
  if (f.type !== 'ALL') labels.push(`Type: ${f.type}`);
  if (f.timeframe !== 'ALL') labels.push(f.timeframe);
  if (f.period !== 'ALL') labels.push(`Period: ${f.period}`);
  if (f.minInitialMove) labels.push(`Initial ≥ ${f.minInitialMove}%`);
  if (f.maxDipBeforeMove) labels.push(`Dip ≤ ${f.maxDipBeforeMove}%`);
  if (f.maxStage4Decline) labels.push(`Stage-4 ≤ ${f.maxStage4Decline}%`);
  if (f.minMoveCount) labels.push(`Moves ≥ ${f.minMoveCount}`);
  if (f.minBaseCount) labels.push(`Bases ≥ ${f.minBaseCount}`);
  if (f.hasImage !== 'ALL') labels.push(f.hasImage === 'YES' ? 'Has screenshot' : 'No screenshot');
  return labels;
}

function filterPills(labels) {
  return labels.length
    ? `<div class="filter-pill-row">${labels.map((label) => `<span class="pill pill-muted">${escapeHtml(label)}</span>`).join('')}</div>`
    : '<div class="filter-pill-row"><span class="pill pill-muted">No extra filters</span></div>';
}

function renderTradeFilterSummary() {
  const items = getRenderableTrades();
  const closed = items.filter((trade) => trade.metrics.status === 'CLOSED').length;
  const uniqueSymbols = new Set(items.map((trade) => trade.symbol).filter(Boolean)).size;
  refs.journalFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">${items.length} filtered trades · ${uniqueSymbols} symbols · ${closed} closed</div></div>${filterPills(activeTradeFilterLabels())}`;
}

function makeMetricPreviewCard(label, value, className = '') {
  return `<div class="panel metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value ${className}">${value}</div></div>`;
}

function renderJournalSummary() {
  if (!isPrivateDataAvailable()) {
    refs.journalSummaryCards.innerHTML = '<div class="empty-state">Sign in to see private journal performance.</div>';
    refs.journalStatsCards.innerHTML = '';
    refs.journalStatsNote.textContent = '';
    return;
  }
  const summary = summarizeJournal(getFilteredTradesRaw(), state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const rate = summary.closedTradeCount ? formatPercent(summary.winRate, 1) : '—';
  refs.journalSummaryCards.innerHTML = [
    makeMetricPreviewCard('Closed-trade net P&L', formatCurrency(summary.netPnl, getCurrency()), summary.netPnl >= 0 ? 'positive' : 'negative'),
    makeMetricPreviewCard('Closed trades', String(summary.closedTradeCount)),
    makeMetricPreviewCard(`Win rate · ${summary.winCount} of ${summary.closedTradeCount}`, rate, summary.winRate >= 50 ? 'positive' : 'warning'),
    makeMetricPreviewCard('Open positions', String(summary.openTradeCount)),
  ].join('');
  refs.journalStatsCards.innerHTML = [
    makeMetricPreviewCard('Gross wins', summary.winCount ? formatCurrency(summary.grossProfit, getCurrency()) : '—', 'positive'),
    makeMetricPreviewCard('Gross losses', summary.lossCount ? formatCurrency(Math.abs(summary.grossLossAbs), getCurrency()) : '—', 'negative'),
    makeMetricPreviewCard('Average win hold', summary.winCount ? formatDurationMinutes(summary.avgWinHoldMinutes) : '—'),
    makeMetricPreviewCard('Average loss hold', summary.lossCount ? formatDurationMinutes(summary.avgLossHoldMinutes) : '—'),
    makeMetricPreviewCard('Open risk now', summary.currentOpenRisk > 0 ? formatCurrency(summary.currentOpenRisk, getCurrency()) : '—', summary.currentOpenRisk > 0 ? 'warning' : ''),
  ].join('');
  refs.journalStatsNote.textContent = summary.trackedRiskTradeCount
    ? `Open risk uses planned risk first, then planned stop-loss distance. ${summary.trackedRiskTradeCount} trade(s) have measurable risk data.`
    : 'Open risk needs Planned risk or a valid planned stop-loss price.';
}

function renderTradeCard(trade) {
  const metrics = trade.metrics || computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const links = state.winners.filter((entry) => entry.sourceTradeId === trade.id);
  const linkAction = links.length ? 'view-winner' : 'save-winner';
  const linkLabel = links.length ? 'View winner example' : 'Save as winner example';
  const status = metrics.status === 'OPEN' ? '<span class="pill pill-blue">Open</span>' : '<span class="pill pill-green">Closed</span>';
  const direction = trade.direction === 'SHORT' ? '<span class="pill pill-red">Short</span>' : '<span class="pill pill-green">Long</span>';
  const pnlClass = metrics.realizedNetPnl >= 0 ? 'positive' : 'negative';
  const tags = (trade.tags || []).map((tag) => `<span class="trade-tag">${escapeHtml(tag)}</span>`).join('');
  return `<article class="trade-card" data-trade-id="${escapeHtml(trade.id)}"><div class="trade-card-head"><div><div class="trade-symbol-wrap"><div class="trade-symbol">${escapeHtml(trade.symbol || '—')}</div>${status}${direction}<span class="pill pill-muted">${escapeHtml(metrics.timeframe || inferTradeTimeframe(trade, metrics))}</span>${trade.strategy ? `<span class="pill pill-muted">${escapeHtml(trade.strategy)}</span>` : ''}</div>${tags ? `<div class="trade-tags">${tags}</div>` : ''}</div><div><div class="metric-value ${pnlClass}">${formatCurrency(metrics.realizedNetPnl, getCurrency())}</div><div class="metric-sub">${metrics.realizedPct != null ? formatPercent(metrics.realizedPct, 2) : metrics.openQty ? `${metrics.openQty} open` : '—'}</div></div></div><div class="trade-meta"><div>Entry: ${formatDateTime(metrics.entryAt || trade.createdAt)}</div><div>Exit: ${metrics.exitAt ? formatDateTime(metrics.exitAt) : 'Open'}</div><div>Qty: ${metrics.totalEntryQty} in · ${metrics.totalExitQty} out</div><div>Net realized P&amp;L: ${formatCurrency(metrics.realizedNetPnl, getCurrency())}</div></div><div class="trade-stats"><div class="stat-chip"><div class="label">Open qty</div><div class="value">${metrics.openQty}</div></div><div class="stat-chip"><div class="label">Move %</div><div class="value">${metrics.realizedPct != null ? formatPercent(metrics.realizedPct, 2) : '—'}</div></div><div class="stat-chip"><div class="label">R multiple</div><div class="value">${metrics.realizedR != null ? round(metrics.realizedR, 2).toFixed(2) : '—'}</div></div><div class="stat-chip"><div class="label">Fees</div><div class="value">${formatCurrency(metrics.feesTotal, getCurrency())}</div></div><div class="stat-chip"><div class="label">Fills</div><div class="value">${metrics.fillCount}</div></div></div>${trade.notes ? `<div class="trade-notes">${escapeHtml(trade.notes)}</div>` : ''}<div class="trade-actions"><button class="btn btn-ghost" data-action="duplicate" data-trade-id="${escapeHtml(trade.id)}">Duplicate</button><button class="btn btn-ghost" data-action="edit" data-trade-id="${escapeHtml(trade.id)}">Edit</button>${metrics.status === 'CLOSED' && metrics.realizedNetPnl > 0 ? `<button class="btn btn-ghost" data-action="${linkAction}" data-trade-id="${escapeHtml(trade.id)}">${linkLabel}</button>` : ''}<button class="btn btn-danger" data-action="delete" data-trade-id="${escapeHtml(trade.id)}">Delete</button></div></article>`;
}

function renderJournalTable() {
  if (!isPrivateDataAvailable()) {
    refs.journalTable.innerHTML = '<div class="panel empty-state">Your private trades will appear here after sign-in. The calculator can create a draft before authentication.</div>';
    return;
  }
  const items = getRenderableTrades();
  refs.journalTable.innerHTML = items.length ? items.map(renderTradeCard).join('') : '<div class="panel empty-state">No trades match the current filters. Try clearing a filter or add a trade.</div>';
}

function renderStrategyFilter() {
  const strategies = [...new Set(state.trades.map((trade) => trade.strategy || 'Unspecified').filter(Boolean))].sort();
  refs.strategyFilter.innerHTML = '<option value="ALL">All</option>' + strategies.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  refs.strategyFilter.value = state.filters.strategy;
}

function renderWinnerFilterOptions() {
  const values = (field) => [...new Set(state.winners.map((entry) => entry[field] || 'Unspecified').filter(Boolean))].sort();
  for (const [ref, field] of [[refs.winnerSectorFilter, 'sector'], [refs.winnerTypeFilter, 'type'], [refs.winnerSetupFilter, 'setup'], [refs.winnerPeriodFilter, 'period']]) {
    ref.innerHTML = '<option value="ALL">All</option>' + values(field).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    ref.value = state.winnerFilters[field];
  }
}

function sourceTradeSummary(entry, compact = false) {
  if (!entry.sourceTradeId) return '';
  const snapshot = entry.sourceTradeSnapshot || {};
  const current = state.trades.find((trade) => trade.id === entry.sourceTradeId);
  const currentMetrics = current ? computeTradeMetrics(current, snapshot.pnlMethod || state.settings.pnlMethod || PNL_METHODS.AVERAGE) : null;
  const result = snapshot.realizedNetPnl != null ? formatCurrency(snapshot.realizedNetPnl, snapshot.currency || getCurrency()) : 'Result unavailable';
  const dates = [snapshot.entryAt && `Entry ${formatDateTime(snapshot.entryAt)}`, snapshot.exitAt && `Exit ${formatDateTime(snapshot.exitAt)}`].filter(Boolean).join(' · ');
  return `<div class="source-trade-box ${compact ? 'compact' : ''}"><div class="panel-title">Saved source trade</div><div class="small-copy">${escapeHtml(snapshot.symbol || entry.stockName || entry.sourceTradeId)} · ${escapeHtml(snapshot.direction || '—')} · ${escapeHtml(dates || 'Dates unavailable')} · ${escapeHtml(result)}</div>${current ? `<button type="button" class="btn btn-ghost compact-top" data-winner-action="view-source" data-source-trade-id="${escapeHtml(entry.sourceTradeId)}">View original trade</button>` : `<div class="small-copy warning-text compact-top">Original trade unavailable · this saved snapshot remains available.</div>`}${currentMetrics && currentMetrics.status !== 'CLOSED' ? '<div class="small-copy warning-text">Current trade is no longer closed; the saved winner snapshot is historical.</div>' : ''}</div>`;
}

function renderWinnerCard(entry) {
  const image = entry.imageUrl && looksLikeViewableImageUrl(entry.imageUrl)
    ? `<button type="button" class="winner-image-button" data-winner-action="preview-image" data-image-url="${escapeHtml(entry.imageUrl)}" data-image-title="${escapeHtml(entry.stockName || 'Chart preview')}"><img data-winner-image src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.stockName || 'Winner chart')}" loading="lazy" /><span class="image-fallback hidden">Screenshot unavailable</span></button>`
    : `<div class="winner-image-fallback">${entry.imageUrl || entry.imageStoragePath ? 'Image reference saved · preview unavailable' : 'No screenshot'}</div>`;
  const tags = (entry.tags || []).map((tag) => `<span class="trade-tag">${escapeHtml(tag)}</span>`).join('');
  const move = entry.effectiveMove != null ? formatPercent(entry.effectiveMove, 1) : 'Move not entered';
  return `<article class="winner-card" data-winner-id="${escapeHtml(entry.id)}"><div class="winner-card-media">${image}</div><div class="winner-card-body"><div class="winner-card-head"><div><div class="winner-stock">${escapeHtml(entry.stockName || 'Untitled example')}</div><div class="small-copy">${escapeHtml(entry.setup || 'Setup not entered')} · ${escapeHtml(entry.timeframe || 'Timeframe not entered')}</div></div><span class="pill pill-muted">${escapeHtml(move)}</span></div><div class="winner-meta">${entry.breakoutDate ? `Date ${escapeHtml(formatDate(entry.breakoutDate))}` : 'Date not entered'}${entry.period ? ` · ${escapeHtml(entry.period)}` : ''}</div>${tags ? `<div class="trade-tags">${tags}</div>` : ''}${entry.notes ? `<p class="winner-note">${escapeHtml(entry.notes)}</p>` : ''}${sourceTradeSummary(entry, true)}<div class="winner-card-actions"><button type="button" class="btn btn-ghost" data-winner-action="edit" data-winner-id="${escapeHtml(entry.id)}">Edit</button></div></div></article>`;
}

function renderWinnerSummary() {
  if (!isPrivateDataAvailable()) {
    refs.winnerSummaryCards.innerHTML = '<div class="empty-state">Sign in to build the private Winner Database.</div>';
    refs.winnerTable.innerHTML = '';
    return;
  }
  const items = getRenderableWinners();
  const summary = summarizeWinnerEntries(items);
  refs.winnerFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">${summary.count} examples · ${summary.uniqueStocks} stocks · ${summary.withImages} screenshots</div></div>${filterPills(activeWinnerFilterLabels())}`;
  refs.winnerSummaryCards.innerHTML = [
    makeMetricPreviewCard('Examples', String(summary.count)),
    makeMetricPreviewCard('Stocks', String(summary.uniqueStocks)),
    makeMetricPreviewCard('With screenshots', String(summary.withImages), summary.withImages ? 'positive' : ''),
    makeMetricPreviewCard('Average move', summary.avgMove != null ? formatPercent(summary.avgMove, 1) : '—'),
  ].join('');
  refs.winnerTable.innerHTML = items.length ? items.map(renderWinnerCard).join('') : '<div class="panel empty-state">No examples match the current filters. Add one or clear a filter.</div>';
}

function renderCharts() {
  chartManager.clearAll();
  if (state.ui.activeTab !== 'journal' || !isPrivateDataAvailable()) return;
  const scopedTrades = getFilteredTradesRaw();
  const method = state.settings.pnlMethod || PNL_METHODS.AVERAGE;
  const closed = scopedTrades.filter((trade) => computeTradeMetrics(trade, method).status === 'CLOSED');
  refs.journalChartsEmpty.classList.toggle('hidden', closed.length > 0);
  if (!closed.length || !refs.journalPerformanceDetails.open) return;
  const equity = buildEquityCurve(scopedTrades, method);
  const monthly = groupMonthlyPnl(scopedTrades, method);
  chartManager.renderLine('equity', refs.equityChart, equity.map((item) => formatDate(item.date, { day: '2-digit', month: 'short' })), equity.map((item) => item.value), 'Cumulative closed-trade P&L');
  chartManager.renderBar('monthly', refs.monthlyChart, monthly.map((item) => item.label), monthly.map((item) => item.value), 'Monthly closed-trade P&L');
}

function renderAll() {
  updateUserSummary();
  renderTradeFilterSummary();
  renderJournalSummary();
  renderStrategyFilter();
  renderJournalTable();
  renderImportSummary();
  renderWinnerFilterOptions();
  renderWinnerSummary();
  renderSettingsForm();
  renderCharts();
}

function createFillRow(fill = {}) {
  const row = document.createElement('div');
  row.className = 'fill-card';
  row.dataset.fillId = fill.id || uid('fill');
  row.innerHTML = `<div class="fill-row"><div class="fill-grid"><label class="field"><span>Date &amp; time</span><input data-fill-field="executedAt" type="datetime-local" value="${escapeHtml(fill.executedAt ? String(fill.executedAt).slice(0, 16) : todayLocalDateTimeInput())}" /></label><label class="field"><span>Side</span><select data-fill-field="side"><option value="BUY" ${fill.side !== 'SELL' ? 'selected' : ''}>Buy</option><option value="SELL" ${fill.side === 'SELL' ? 'selected' : ''}>Sell</option></select></label><label class="field"><span>Quantity</span><input data-fill-field="qty" type="number" step="1" value="${fill.qty ?? ''}" /></label><label class="field"><span>Price</span><input data-fill-field="price" type="number" step="0.01" value="${fill.price ?? ''}" /></label><label class="field"><span>Fees</span><input data-fill-field="fees" type="number" step="0.01" value="${fill.fees ?? ''}" /></label></div><button type="button" class="btn btn-danger" data-action="remove-fill">Remove</button></div><label class="field compact-top"><span>Fill note</span><input data-fill-field="note" type="text" value="${escapeHtml(fill.note || '')}" placeholder="Scale-in / partial exit / stop-loss" /></label>`;
  refs.fillsContainer.appendChild(row);
}

function clearTradeForm() {
  refs.tradeForm.reset();
  const id = uid('trade');
  refs.tradeId.value = id;
  refs.tradeTimeframe.value = TRADE_TIMEFRAMES.AUTO;
  refs.fillsContainer.innerHTML = '';
  createFillRow({ side: 'BUY' });
  refs.tradeModalTitle.textContent = 'New trade';
  refs.duplicateTradeBtn.classList.add('hidden');
  refs.deleteTradeBtn.classList.add('hidden');
  setFormStatus(refs.tradeSaveStatus);
  state.ui.tradeDraft = { id, mode: 'new', dirty: false, saving: false, operationId: uid('trade-save'), calculatorSeeded: false };
  modalTradeSnapshot = null;
}

function openTradeModal(trade = null, mode = 'edit') {
  clearTradeForm();
  if (trade) {
    modalTradeSnapshot = deepClone(trade);
    refs.tradeId.value = trade.id || refs.tradeId.value;
    refs.tradeSymbol.value = trade.symbol || '';
    refs.tradeDirection.value = trade.direction || 'LONG';
    refs.tradeTimeframe.value = trade.timeframe || TRADE_TIMEFRAMES.AUTO;
    refs.tradeStrategy.value = trade.strategy || '';
    refs.tradePlannedRisk.value = trade.plannedRisk || '';
    refs.tradePlannedStop.value = trade.plannedStop || '';
    refs.tradeDipBeforeMove.value = trade.dipBeforeMove ?? '';
    refs.tradeTags.value = stringifyTags(trade.tags || []);
    refs.tradeNotes.value = trade.notes || '';
    refs.fillsContainer.innerHTML = '';
    (trade.fills || []).forEach((fill) => createFillRow(fill));
    refs.tradeModalTitle.textContent = mode === 'duplicate' ? `Duplicate ${trade.symbol || 'trade'}` : `Edit ${trade.symbol || 'trade'}`;
    refs.duplicateTradeBtn.classList.toggle('hidden', mode === 'duplicate');
    refs.deleteTradeBtn.classList.toggle('hidden', mode !== 'edit');
    state.ui.tradeDraft = { ...state.ui.tradeDraft, id: refs.tradeId.value, mode, dirty: mode === 'duplicate', calculatorSeeded: false };
  }
  refs.tradeModal.classList.remove('hidden');
  refs.tradeModal.setAttribute('aria-hidden', 'false');
  syncTradePreview();
  refs.tradeSymbol.focus();
}

function closeTradeModal(force = false) {
  const draft = state.ui.tradeDraft;
  if (!force && draft?.dirty && !window.confirm('Discard this unsaved trade draft?')) return false;
  refs.tradeModal.classList.add('hidden');
  refs.tradeModal.setAttribute('aria-hidden', 'true');
  state.ui.tradeDraft = null;
  modalTradeSnapshot = null;
  state.ui.calculatorDraftActive = false;
  return true;
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
  const { metrics: _metrics, ...historical } = modalTradeSnapshot || {};
  return normalizeTradePayload({
    ...historical,
    id: refs.tradeId.value,
    symbol: refs.tradeSymbol.value,
    direction: refs.tradeDirection.value,
    timeframe: refs.tradeTimeframe.value,
    strategy: refs.tradeStrategy.value,
    plannedRisk: refs.tradePlannedRisk.value,
    plannedStop: refs.tradePlannedStop.value,
    dipBeforeMove: refs.tradeDipBeforeMove.value,
    tags: parseTags(refs.tradeTags.value),
    notes: refs.tradeNotes.value,
    fills,
    createdAt: modalTradeSnapshot?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function syncTradePreview() {
  try {
    const trade = readTradeForm();
    if (!trade.symbol || !trade.fills.length) {
      refs.tradeMetricsPreview.innerHTML = makeMetricPreviewCard('Status', 'Start filling the trade form');
      return;
    }
    const metrics = computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
    refs.tradeMetricsPreview.innerHTML = [
      makeMetricPreviewCard('Status', metrics.status), makeMetricPreviewCard('Timeframe', metrics.timeframe),
      makeMetricPreviewCard('Average entry', metrics.avgEntryPrice ? formatCurrency(metrics.avgEntryPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Average exit', metrics.avgExitPrice ? formatCurrency(metrics.avgExitPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Open quantity', String(metrics.openQty)), makeMetricPreviewCard('Fees', formatCurrency(metrics.feesTotal, getCurrency())),
      makeMetricPreviewCard('Realized P&L', formatCurrency(metrics.realizedNetPnl, getCurrency()), metrics.realizedNetPnl >= 0 ? 'positive' : 'negative'),
      makeMetricPreviewCard('R multiple', metrics.realizedR != null ? round(metrics.realizedR, 2).toFixed(2) : '—'),
    ].join('');
  } catch (error) {
    refs.tradeMetricsPreview.innerHTML = makeMetricPreviewCard('Validation', escapeHtml(error.message || 'Fill data is incomplete'), 'warning');
  }
}

function renderImportSummary() {
  if (!state.ui.lastImportSummary) {
    refs.importSummary.textContent = 'Broker CSV import groups execution rows into journal trades and reports unmatched closing rows.';
    return;
  }
  const summary = state.ui.lastImportSummary;
  refs.importSummary.innerHTML = `<div class="import-summary"><strong>Last import:</strong> ${escapeHtml(summary.fileName || 'tradebook.csv')} · ${Number(summary.rawRowCount || 0).toLocaleString('en-IN')} rows → ${Number(summary.mergedFillCount || 0).toLocaleString('en-IN')} fills → ${Number(summary.tradeCount || 0).toLocaleString('en-IN')} trades (${Number(summary.closedTradeCount || 0)} closed, ${Number(summary.openTradeCount || 0)} open).</div>`;
}

function mergeImportedTradeWithExisting(importedTrade) {
  const existing = state.trades.find((item) => item.id === importedTrade.id);
  if (!existing) return importedTrade;
  const { metrics: _metrics, ...historical } = existing;
  return normalizeTradePayload({
    ...historical, ...importedTrade,
    strategy: existing.strategy || importedTrade.strategy, plannedRisk: existing.plannedRisk || importedTrade.plannedRisk,
    plannedStop: existing.plannedStop || importedTrade.plannedStop, timeframe: existing.timeframe || importedTrade.timeframe,
    dipBeforeMove: existing.dipBeforeMove ?? importedTrade.dipBeforeMove,
    tags: [...new Set([...(importedTrade.tags || []), ...(existing.tags || [])])], notes: existing.notes || importedTrade.notes,
    createdAt: existing.createdAt || importedTrade.createdAt, updatedAt: new Date().toISOString(),
  });
}

async function handleTradebookImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!isPrivateDataAvailable()) throw new Error('Sign in first before importing trades to the private journal.');
    const imported = importTradebookCsv(await file.text(), { fileName: file.name, allowLeadingSell: false, allowReversal: true });
    if (!imported.trades.length) throw new Error('No complete trade cycles were found in this CSV.');
    const prepared = imported.trades.map(mergeImportedTradeWithExisting);
    if (!window.confirm(`Import ${prepared.length} trades from ${file.name}? Existing matching trades keep their notes and hidden metadata.`)) return;
    await state.storage.saveTrades(prepared);
    state.ui.lastImportSummary = { ...imported.summary, fileName: file.name, tradeCount: prepared.length };
    renderAll();
    showToast(`Imported ${prepared.length} trades.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(friendlyError(error, 'Tradebook import failed.'), 'error');
  } finally { event.target.value = ''; }
}

function renderSettingsForm() {
  refs.settingsPnlMethod.value = state.settings.pnlMethod || PNL_METHODS.AVERAGE;
  refs.settingsCurrency.value = state.settings.baseCurrency || 'INR';
}

function exportCsv() {
  const rows = toCsvRows(getFilteredTradesRaw(), state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  downloadTextFile(`trademaster-journal-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}

async function handleDeleteTrade(tradeId) {
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade || !window.confirm(`Delete trade ${trade.symbol || tradeId}?`)) return false;
  try {
    await state.storage.deleteTrade(tradeId);
    showToast('Trade deleted.', 'success');
    return true;
  } catch (error) { console.error(error); showToast(friendlyError(error, 'Could not delete trade.'), 'error'); return false; }
}

function handleJournalClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const tradeId = button.dataset.tradeId;
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) return;
  if (button.dataset.action === 'edit') openTradeModal(trade, 'edit');
  if (button.dataset.action === 'duplicate') openTradeModal(deepClone(trade), 'duplicate');
  if (button.dataset.action === 'delete') handleDeleteTrade(tradeId);
  if (button.dataset.action === 'save-winner') openLinkedWinnerFromTrade(trade);
  if (button.dataset.action === 'view-winner') {
    const linked = state.winners.find((entry) => entry.sourceTradeId === trade.id);
    if (linked) openWinnerModal(linked);
  }
}

const WINNER_MOVE_BASES = 4;
const WINNER_MOVE_EXPANSIONS = 3;

function emptyWinnerMoveForm() {
  return { id: uid('move'), movePct: '', breakoutExpansions: Array(WINNER_MOVE_EXPANSIONS).fill(''), bases: Array.from({ length: WINNER_MOVE_BASES }, () => ({ length: '', depth: '', expansions: Array(WINNER_MOVE_EXPANSIONS).fill('') })) };
}

function cloneWinnerMoveForForm(move = {}) {
  return { id: move.id || uid('move'), movePct: move.movePct ?? move.move ?? move.totalMovePct ?? '', breakoutExpansions: Array.from({ length: WINNER_MOVE_EXPANSIONS }, (_, i) => move.breakoutExpansions?.[i] ?? ''), bases: Array.from({ length: WINNER_MOVE_BASES }, (_, baseIndex) => ({ length: move.bases?.[baseIndex]?.length ?? '', depth: move.bases?.[baseIndex]?.depth ?? '', expansions: Array.from({ length: WINNER_MOVE_EXPANSIONS }, (_, i) => move.bases?.[baseIndex]?.expansions?.[i] ?? '') })) };
}

function readWinnerMoveCard(card) {
  const move = emptyWinnerMoveForm();
  move.id = card.dataset.moveId || uid('move');
  move.movePct = card.querySelector('[data-move-field="movePct"]')?.value ?? '';
  move.breakoutExpansions = Array.from({ length: WINNER_MOVE_EXPANSIONS }, (_, i) => card.querySelector(`[data-breakout-expansion-index="${i}"]`)?.value ?? '');
  move.bases = Array.from({ length: WINNER_MOVE_BASES }, (_, baseIndex) => ({ length: card.querySelector(`[data-base-index="${baseIndex}"][data-base-field="length"]`)?.value ?? '', depth: card.querySelector(`[data-base-index="${baseIndex}"][data-base-field="depth"]`)?.value ?? '', expansions: Array.from({ length: WINNER_MOVE_EXPANSIONS }, (_, i) => card.querySelector(`[data-base-index="${baseIndex}"][data-base-expansion-index="${i}"]`)?.value ?? '') }));
  return move;
}

function readWinnerMovesBuilderRaw() { return [...refs.winnerMovesBuilder.querySelectorAll('[data-move-card]')].map(readWinnerMoveCard); }
function readWinnerMovesBuilder() { return normalizeWinnerMoves(readWinnerMovesBuilderRaw()); }

function winnerMoveSummaryText(summary = {}) {
  if (!summary.moveCount) return 'Move is empty. Add any expansion, base, or total move if useful.';
  return [`${summary.totalBases} base${summary.totalBases === 1 ? '' : 's'}`, summary.avgExpansion != null && `Avg expansion ${formatPercent(summary.avgExpansion, 1)}`, summary.maxExpansion != null && `Best expansion ${formatPercent(summary.maxExpansion, 1)}`, summary.maxBaseLength != null && `Biggest base ${summary.maxBaseLength} bars`, summary.maxBaseDepth != null && `Deepest base ${formatPercent(summary.maxBaseDepth, 1)}`, summary.totalMovePctAuto != null && `Auto move ${formatPercent(summary.totalMovePctAuto, 1)}`].filter(Boolean).join(' · ');
}

function winnerMoveCardHtml(rawMove, moveIndex) {
  const move = cloneWinnerMoveForForm(rawMove);
  return `<div class="panel compact-top" data-move-card data-move-id="${escapeHtml(move.id)}"><div class="section-row"><div class="panel-title">Move ${moveIndex + 1}</div><button type="button" class="btn btn-ghost" data-move-builder-action="remove" data-move-id="${escapeHtml(move.id)}">Remove</button></div><div class="form-grid form-grid-4 compact-top"><label class="field"><span>Total move %</span><input data-move-field="movePct" type="number" step="0.1" value="${escapeHtml(String(move.movePct ?? ''))}" /></label>${move.breakoutExpansions.map((value, i) => `<label class="field"><span>E${i + 1}B %</span><input data-breakout-expansion-index="${i}" type="number" step="0.1" value="${escapeHtml(String(value ?? ''))}" /></label>`).join('')}</div>${move.bases.map((base, baseIndex) => `<div class="form-grid form-grid-3 compact-top"><label class="field"><span>B${baseIndex + 1} length</span><input data-base-index="${baseIndex}" data-base-field="length" type="number" step="0.1" value="${escapeHtml(String(base.length ?? ''))}" /></label><label class="field"><span>B${baseIndex + 1} depth %</span><input data-base-index="${baseIndex}" data-base-field="depth" type="number" step="0.1" value="${escapeHtml(String(base.depth ?? ''))}" /></label>${base.expansions.map((value, i) => `<label class="field"><span>E${i + 1}B${baseIndex + 1} %</span><input data-base-index="${baseIndex}" data-base-expansion-index="${i}" type="number" step="0.1" value="${escapeHtml(String(value ?? ''))}" /></label>`).join('')}</div>`).join('')}<div class="panel-note compact-top">${escapeHtml(winnerMoveSummaryText(summarizeWinnerPattern([move])))}</div></div>`;
}

function renderWinnerMovesSummary() {
  const summary = summarizeWinnerPattern(readWinnerMovesBuilderRaw());
  refs.winnerMovesSummary.textContent = summary.moveCount ? `${summary.moveCount} move${summary.moveCount === 1 ? '' : 's'} · ${winnerMoveSummaryText(summary)}` : 'No move pattern data yet.';
}

function renderWinnerMovesBuilder(moves = []) {
  refs.winnerMovesBuilder.innerHTML = moves.length ? moves.map((move, i) => winnerMoveCardHtml(move, i)).join('') : '<div class="panel-note">No move legs added yet. Every pattern field is optional.</div>';
  renderWinnerMovesSummary();
}

function clearWinnerForm() {
  refs.winnerForm.reset();
  const id = uid('winner');
  refs.winnerId.value = id;
  refs.winnerTimeframe.value = 'SWING';
  refs.deleteWinnerBtn.classList.add('hidden');
  refs.winnerModalTitle.textContent = 'New winner example';
  refs.winnerSourceTradeSection.classList.add('hidden');
  setFormStatus(refs.winnerSaveStatus);
  clearWinnerImageDraft();
  refs.winnerImagePreview.innerHTML = winnerImageEmptyState();
  renderWinnerMovesBuilder([]);
  state.ui.winnerDraft = { id, mode: 'new', dirty: false, saving: false, operationId: uid('winner-save') };
  modalWinnerSnapshot = null;
}

function syncWinnerImagePreview() {
  const draft = state.ui.winnerImageDraft?.prepared;
  const url = refs.winnerImageUrl.value.trim();
  const storagePath = refs.winnerImageStoragePath.value.trim();
  if (draft) {
    refs.winnerImagePreview.innerHTML = `<div class="preview-wrap"><img class="modal-thumb" src="${escapeHtml(draft.previewUrl)}" alt="Prepared screenshot preview" /><div class="preview-meta small-copy"><div class="text-strong">Prepared screenshot · uploads when you save</div><div>${escapeHtml(formatBytes(draft.sizeBytes))} · ${draft.width}×${draft.height} · ${escapeHtml(draft.contentType)}</div></div></div>`;
    return;
  }
  if (!url) { refs.winnerImagePreview.innerHTML = winnerImageEmptyState(); return; }
  refs.winnerImagePreview.innerHTML = looksLikeViewableImageUrl(url)
    ? `<div class="preview-wrap"><img class="modal-thumb" src="${escapeHtml(url)}" alt="Winner chart preview" /><div class="preview-meta small-copy"><div class="text-strong">${storagePath ? 'Stored screenshot' : 'External image URL'}</div><div>${storagePath ? 'Saved in Firebase Storage.' : 'Referenced from the URL you supplied.'}</div></div></div>`
    : '<div class="preview-meta small-copy"><div class="text-strong">Saved image reference</div><div>This value is not a direct browser-viewable image URL.</div></div>';
}

async function handleWinnerImageFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!canUploadWinnerImages()) { event.target.value = ''; showToast('Sign in with any Firebase provider and configure Storage before uploading screenshots.', 'error'); return; }
  try {
    clearWinnerImageDraft();
    setFormStatus(refs.winnerSaveStatus, 'Preparing screenshot…', 'busy');
    const prepared = await prepareImageForUpload(file, { maxDimension: 1600, quality: 0.82 });
    state.ui.winnerImageDraft = { prepared };
    state.ui.winnerDraft.dirty = true;
    syncWinnerImagePreview();
    setFormStatus(refs.winnerSaveStatus, 'Screenshot ready. Save the example to upload it.', 'success');
  } catch (error) { console.error(error); clearWinnerImageDraft(); syncWinnerImagePreview(); setFormStatus(refs.winnerSaveStatus, friendlyError(error, 'Could not prepare the screenshot.'), 'error'); }
}

function clearWinnerImageSelection() { clearWinnerImageDraft(); refs.winnerImageUrl.value = ''; refs.winnerImageStoragePath.value = ''; syncWinnerImagePreview(); }

function openWinnerModal(entry = null) {
  clearWinnerForm();
  if (entry) {
    modalWinnerSnapshot = deepClone(entry);
    refs.winnerId.value = entry.id || refs.winnerId.value;
    refs.winnerStockName.value = entry.stockName || ''; refs.winnerSector.value = entry.sector || ''; refs.winnerType.value = entry.type || '';
    refs.winnerSetup.value = entry.setup || ''; refs.winnerTimeframe.value = entry.timeframe || 'SWING'; refs.winnerBreakoutDate.value = entry.breakoutDate || '';
    refs.winnerCircuits.value = entry.circuits ?? ''; refs.winnerPeriod.value = entry.period || ''; refs.winnerInitialMove.value = entry.initialMove ?? '';
    refs.winnerBaseLength.value = entry.baseLength ?? ''; refs.winnerMove.value = entry.move ?? ''; refs.winnerDipBeforeMove.value = entry.dipBeforeMove ?? '';
    refs.winnerStage4Decline.value = entry.stage4Decline ?? ''; refs.winnerImageUrl.value = entry.imageUrl || ''; refs.winnerImageStoragePath.value = entry.imageStoragePath || '';
    refs.winnerTags.value = stringifyTags(entry.tags || []); refs.winnerNotes.value = entry.notes || ''; refs.winnerModalTitle.textContent = `Edit ${entry.stockName || 'winner example'}`;
    refs.deleteWinnerBtn.classList.remove('hidden'); renderWinnerMovesBuilder(entry.moves || []); syncWinnerImagePreview();
    if (entry.sourceTradeId) { refs.winnerSourceTradeSection.innerHTML = sourceTradeSummary(entry); refs.winnerSourceTradeSection.classList.remove('hidden'); }
    state.ui.winnerDraft = { ...state.ui.winnerDraft, id: refs.winnerId.value, mode: 'edit', dirty: false };
  }
  refs.winnerModal.classList.remove('hidden'); refs.winnerModal.setAttribute('aria-hidden', 'false');
  refs.winnerStockName.focus();
}

function closeWinnerModal(force = false) {
  if (!force && state.ui.winnerDraft?.dirty && !window.confirm('Discard this unsaved winner example?')) return false;
  clearWinnerImageDraft(); refs.winnerModal.classList.add('hidden'); refs.winnerModal.setAttribute('aria-hidden', 'true'); state.ui.winnerDraft = null; modalWinnerSnapshot = null; return true;
}

function readWinnerForm() {
  const { pattern: _pattern, effectiveInitialMove: _effectiveInitialMove, effectiveBaseLength: _effectiveBaseLength, effectiveMove: _effectiveMove, ...historical } = modalWinnerSnapshot || {};
  return normalizeWinnerPayload({ ...historical, id: refs.winnerId.value, stockName: refs.winnerStockName.value, sector: refs.winnerSector.value, type: refs.winnerType.value, setup: refs.winnerSetup.value, timeframe: refs.winnerTimeframe.value, breakoutDate: refs.winnerBreakoutDate.value, circuits: refs.winnerCircuits.value, period: refs.winnerPeriod.value, initialMove: refs.winnerInitialMove.value, baseLength: refs.winnerBaseLength.value, move: refs.winnerMove.value, dipBeforeMove: refs.winnerDipBeforeMove.value, stage4Decline: refs.winnerStage4Decline.value, imageUrl: refs.winnerImageUrl.value, imageStoragePath: refs.winnerImageStoragePath.value, tags: parseTags(refs.winnerTags.value), notes: refs.winnerNotes.value, moves: readWinnerMovesBuilder(), createdAt: modalWinnerSnapshot?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
}

function isDefinitivePersistenceError(error) {
  return ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'already-exists', 'storage/unauthorized', 'storage/invalid-format'].includes(String(error?.code || ''));
}

async function reconcileWinnerWrite(entry, uploadedPath) {
  try {
    const saved = await state.storage.getWinner(entry.id);
    if (!saved) return { state: 'unknown' };
    if (saved.imageStoragePath === uploadedPath) return { state: 'committed', entry: saved };
    return { state: 'different', entry: saved };
  } catch { return { state: 'unknown' }; }
}

async function saveWinnerForm(event) {
  event.preventDefault();
  const draft = state.ui.winnerDraft;
  if (!draft || draft.saving) return;
  draft.saving = true; refs.saveWinnerBtn.disabled = true; setFormStatus(refs.winnerSaveStatus, state.ui.winnerImageDraft?.prepared ? 'Uploading screenshot…' : 'Saving example…', 'busy');
  const epoch = state.sessionEpoch;
  let uploadedPath = ''; let entry;
  try {
    entry = readWinnerForm();
    if (!entry.stockName && !entry.notes && !entry.imageUrl && !entry.moves.length) throw new Error('Add a stock name, note, or chart detail before saving.');
    const existingLocal = state.winners.find((item) => item.id === entry.id);
    let existing = existingLocal;
    if (!existing && entry.sourceTradeId) existing = await state.storage.getWinner(entry.id);
    if (epoch !== state.sessionEpoch) throw new Error('Account changed while saving. Please reopen this example for the current account.');
    const existingPath = existing?.imageStoragePath || '';
    const existingUrl = existing?.imageUrl || '';
    const pending = state.ui.winnerImageDraft?.prepared;
    if (pending) {
      if (!canUploadWinnerImages()) throw new Error('Sign in and configure Firebase Storage before uploading screenshots.');
      const upload = await state.storage.uploadWinnerImage({ winnerId: entry.id, blob: pending.blob, fileName: pending.fileName, contentType: pending.contentType });
      if (epoch !== state.sessionEpoch) throw new Error('Account changed while uploading. The new image was not attached to this account.');
      uploadedPath = upload.storagePath; entry.imageUrl = upload.downloadUrl; entry.imageStoragePath = upload.storagePath; entry.imageBytes = upload.sizeBytes; entry.imageContentType = upload.contentType; entry.imageWidth = pending.width; entry.imageHeight = pending.height;
    } else if (!entry.imageUrl) {
      entry.imageStoragePath = ''; entry.imageBytes = null; entry.imageContentType = ''; entry.imageWidth = null; entry.imageHeight = null;
    } else if (entry.imageUrl !== existingUrl && existingPath) {
      entry.imageStoragePath = ''; entry.imageBytes = null; entry.imageContentType = ''; entry.imageWidth = null; entry.imageHeight = null;
    }
    if (entry.sourceTradeId && !existing) {
      const result = await state.storage.createWinnerIfAbsent(entry);
      if (!result.created) {
        if (uploadedPath) await state.storage.deleteWinnerImage(uploadedPath);
        closeWinnerModal(true); openWinnerModal(normalizeWinnerPayload(result.entry)); showToast('This source trade already has a winner example; nothing was overwritten.', 'info'); return;
      }
    } else {
      await state.storage.saveWinner(entry);
    }
    if (epoch !== state.sessionEpoch) return;
    // Firestore-triggered cleanup removes the old referenced object after this write.
    closeWinnerModal(true); showToast('Winner example saved to Firebase.', 'success');
  } catch (error) {
    console.error(error);
    let message = friendlyError(error, 'Could not save winner example.');
    if (uploadedPath) {
      if (isDefinitivePersistenceError(error)) {
        try { await state.storage.deleteWinnerImage(uploadedPath); } catch (cleanupError) { console.warn('Uploaded screenshot rollback failed', cleanupError); message += ' Cleanup of the new screenshot also needs attention.'; }
      } else {
        const reconciliation = await reconcileWinnerWrite(entry || { id: draft.id }, uploadedPath);
        if (reconciliation.state === 'committed') message = 'Firebase may have completed the save. The uploaded screenshot is retained; reload before retrying.';
        else message += ' The save result is uncertain, so the uploaded screenshot was retained for reconciliation.';
      }
    }
    if (epoch === state.sessionEpoch) setFormStatus(refs.winnerSaveStatus, message, 'error');
  } finally { if (epoch === state.sessionEpoch) { draft.saving = false; refs.saveWinnerBtn.disabled = false; } }
}

async function handleDeleteWinner(entryId) {
  const entry = state.winners.find((item) => item.id === entryId);
  if (!entry || !window.confirm(`Delete winner example ${entry.stockName || entryId}?`)) return false;
  try {
    await state.storage.deleteWinner(entryId);
    // Firestore-triggered cleanup removes the referenced screenshot after the delete.
    showToast('Winner example deleted.', 'success'); return true;
  } catch (error) { console.error(error); setFormStatus(refs.winnerSaveStatus, friendlyError(error, 'Could not delete winner example.'), 'error'); showToast(friendlyError(error, 'Could not delete winner example.'), 'error'); return false; }
}

function handleWinnerTableClick(event) {
  const button = event.target.closest('[data-winner-action]');
  if (!button) return;
  const action = button.dataset.winnerAction;
  if (action === 'preview-image') { openImagePreview(button.dataset.imageUrl, button.dataset.imageTitle); return; }
  if (action === 'view-source') { openSourceTrade(button.dataset.sourceTradeId); return; }
  const entry = state.winners.find((item) => item.id === button.dataset.winnerId);
  if (entry && action === 'edit') openWinnerModal(entry);
}

function openSourceTrade(tradeId) {
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) { showToast('Original trade unavailable. The saved winner snapshot remains available.', 'info'); return; }
  switchTab('journal'); openTradeModal(trade, 'edit');
}

function openImagePreview(url, title = 'Chart preview') {
  if (!looksLikeViewableImageUrl(url)) return;
  refs.imagePreview.src = url; refs.imagePreview.alt = title; refs.imagePreviewTitle.textContent = title; refs.imagePreviewModal.classList.remove('hidden'); refs.imagePreviewModal.setAttribute('aria-hidden', 'false'); refs.closeImagePreviewBtn.focus();
}

function closeImagePreview() { refs.imagePreview.src = ''; refs.imagePreviewModal.classList.add('hidden'); refs.imagePreviewModal.setAttribute('aria-hidden', 'true'); }

function renderCalculator() {
  const solver = solvePositionCalculator({ capital: refs.calcCapital.value, riskPercent: refs.calcRiskPercent.value, entry: refs.calcEntry.value, slPrice: refs.calcSlPrice.value, slPercent: refs.calcSlPercent.value, positionSize: refs.calcPositionSize.value, riskAmount: refs.calcRiskAmount.value, lastEdited: refs.calcLastEdited.value });
  $$('.risk-chip').forEach((chip) => chip.classList.toggle('active', Number(chip.dataset.risk) === Number(refs.calcRiskPercent.value || 0)));
  refs.calcQty.textContent = String(solver.qty || 0); refs.calcValue.textContent = formatCurrency(solver.totalValue || 0, getCurrency()); refs.calcActualRisk.textContent = formatCurrency(solver.actualRisk || 0, getCurrency()); refs.calcPositionPercent.textContent = formatPercent(solver.positionPercent || 0, 1); refs.calcRiskCapitalPercent.textContent = formatPercent(solver.riskOfCapital || 0, 2); refs.calcTrailLocked.textContent = formatCurrency(lockedPnl(solver.entry, refs.calcTrailPrice.value, solver.qty, solver.long), getCurrency()); refs.calcDirectionPill.className = cn('pill', solver.entry ? solver.long ? 'pill-green' : 'pill-red' : 'pill-muted'); refs.calcDirectionPill.textContent = solver.entry ? solver.long ? 'Long setup' : 'Short setup' : 'Waiting for setup'; refs.calcHint.textContent = refs.calcLastEdited.value === 'positionSize' ? 'Solving from position size.' : refs.calcLastEdited.value === 'riskAmount' ? 'Solving from risk amount.' : 'Solving from entry + stop-loss using account risk.';
  if (document.activeElement !== refs.calcSlPrice) refs.calcSlPrice.value = solver.slPrice || ''; if (document.activeElement !== refs.calcSlPercent) refs.calcSlPercent.value = solver.slPercent || ''; if (document.activeElement !== refs.calcPositionSize) refs.calcPositionSize.value = solver.positionSize || ''; if (document.activeElement !== refs.calcRiskAmount) refs.calcRiskAmount.value = solver.riskAmount || '';
  const target = projectTarget({ entry: solver.entry, slPrice: solver.slPrice, qty: solver.qty, targetR: refs.targetR.value, targetPercent: refs.targetPercent.value, exitPrice: refs.targetExitPrice.value });
  if (document.activeElement !== refs.targetExitPrice) refs.targetExitPrice.value = target.exitPrice || ''; if (document.activeElement !== refs.targetR) refs.targetR.value = target.targetR || ''; if (document.activeElement !== refs.targetPercent) refs.targetPercent.value = target.targetPercent || '';
  refs.targetPnl.textContent = formatCurrency(target.pnl || 0, getCurrency()); refs.targetNetPnl.textContent = formatCurrency(target.charges.net || 0, getCurrency()); refs.chargesBrokerage.textContent = formatCurrency(target.charges.brokerage || 0, getCurrency()); refs.chargesStt.textContent = formatCurrency(target.charges.stt || 0, getCurrency()); refs.chargesOther.textContent = formatCurrency(target.charges.other || 0, getCurrency()); refs.chargesTotal.textContent = formatCurrency(target.charges.total || 0, getCurrency());
}

function resetCalculatorForm() { for (const ref of [refs.calcEntry, refs.calcSlPrice, refs.calcSlPercent, refs.calcPositionSize, refs.calcRiskAmount, refs.calcTrailPrice, refs.targetR, refs.targetPercent, refs.targetExitPrice]) ref.value = ''; refs.calcLastEdited.value = 'entry'; renderCalculator(); }

function pushCalculatorToTrade() {
  const solver = solvePositionCalculator({ capital: refs.calcCapital.value, riskPercent: refs.calcRiskPercent.value, entry: refs.calcEntry.value, slPrice: refs.calcSlPrice.value, slPercent: refs.calcSlPercent.value, positionSize: refs.calcPositionSize.value, riskAmount: refs.calcRiskAmount.value, lastEdited: refs.calcLastEdited.value });
  if (!(solver.entry > 0) || !(solver.qty > 0)) { showToast('Enter entry and a valid stop-loss first.', 'error'); return; }
  openTradeModal(); refs.tradeDirection.value = solver.long ? 'LONG' : 'SHORT'; refs.tradePlannedRisk.value = solver.actualRisk || refs.calcRiskAmount.value || ''; refs.tradePlannedStop.value = solver.slPrice || ''; refs.fillsContainer.innerHTML = ''; createFillRow({ side: solver.long ? 'BUY' : 'SELL', qty: solver.qty, price: solver.entry, note: 'Draft seeded from calculator' }); state.ui.tradeDraft.dirty = true; state.ui.tradeDraft.calculatorSeeded = true; state.ui.calculatorDraftActive = true; switchTab('journal'); syncTradePreview(); showToast('Calculator values opened as an unsaved journal draft.', 'success');
}

async function saveTradeForm(event) {
  event.preventDefault(); const draft = state.ui.tradeDraft; if (!draft || draft.saving) return; draft.saving = true; refs.saveTradeBtn.disabled = true; setFormStatus(refs.tradeSaveStatus, 'Saving to Firebase…', 'busy'); const epoch = state.sessionEpoch;
  try { const trade = readTradeForm(); if (!trade.symbol) throw new Error('Symbol is required.'); if (!trade.fills.length) throw new Error('Add at least one fill.'); computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE); await state.storage.saveTrade(trade); if (epoch !== state.sessionEpoch) return; closeTradeModal(true); showToast('Trade saved to Firebase.', 'success'); }
  catch (error) { console.error(error); if (epoch === state.sessionEpoch) setFormStatus(refs.tradeSaveStatus, friendlyError(error, 'Could not save trade.'), 'error'); }
  finally { if (epoch === state.sessionEpoch) { draft.saving = false; refs.saveTradeBtn.disabled = false; } }
}

function openLinkedWinnerFromTrade(trade) {
  const metrics = computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  if (metrics.status !== 'CLOSED' || !(metrics.realizedNetPnl > 0)) { showToast('Only profitable closed trades can become winner examples.', 'error'); return; }
  const existing = state.winners.find((entry) => entry.sourceTradeId === trade.id);
  if (existing) { openWinnerModal(existing); return; }
  const entry = createLinkedWinnerDraft(trade, metrics, { pnlMethod: state.settings.pnlMethod, currency: getCurrency() });
  openWinnerModal(entry); state.ui.winnerDraft.dirty = true; state.ui.winnerDraft.mode = 'linked-new'; refs.winnerSourceTradeSection.innerHTML = sourceTradeSummary(entry); refs.winnerSourceTradeSection.classList.remove('hidden'); showToast('Winner example opened as a draft. Nothing has been saved yet.', 'success');
}

function setPhoneAuthStep(step) { const code = step === 'code'; refs.phoneNumberStep.classList.toggle('hidden', code); refs.phoneCodeStep.classList.toggle('hidden', !code); refs.phoneNumberInput.required = !code; refs.phoneCodeInput.required = code; if (code) refs.phoneCodeInput.focus(); }
function openPhoneAuthModal() { refs.phoneAuthModal.classList.remove('hidden'); refs.phoneAuthModal.setAttribute('aria-hidden', 'false'); refs.phoneAuthStatus.textContent = ''; refs.phoneNumberInput.value = ''; refs.phoneCodeInput.value = ''; setPhoneAuthStep('number'); refs.phoneNumberInput.focus(); }
function closePhoneAuthModal() { state.storage?.cancelPhoneAuth?.(); refs.phoneAuthModal.classList.add('hidden'); refs.phoneAuthModal.setAttribute('aria-hidden', 'true'); setPhoneAuthStep('number'); }
function openAccountModal() { renderSettingsForm(); refs.accountModal.classList.remove('hidden'); refs.accountModal.setAttribute('aria-hidden', 'false'); refs.closeAccountModalBtn.focus(); }
function closeAccountModal() { refs.accountModal.classList.add('hidden'); refs.accountModal.setAttribute('aria-hidden', 'true'); }

async function subscribeToTrades(epoch = state.sessionEpoch, userId = state.user?.uid) {
  state.unsubTrades?.(); state.unsubTrades = null;
  state.unsubTrades = state.storage.subscribeTrades((trades) => { if (epoch !== state.sessionEpoch || state.user?.uid !== userId) return; state.trades = (trades || []).map((trade) => ({ ...trade, metrics: computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE) })); renderAll(); }, (error) => { if (epoch === state.sessionEpoch) showToast(friendlyError(error, 'Could not load trades.'), 'error'); });
}
async function subscribeToWinners(epoch = state.sessionEpoch, userId = state.user?.uid) {
  state.unsubWinners?.(); state.unsubWinners = null;
  state.unsubWinners = state.storage.subscribeWinners((entries) => { if (epoch !== state.sessionEpoch || state.user?.uid !== userId) return; state.winners = (entries || []).map((entry) => normalizeWinnerPayload(entry)); renderAll(); }, (error) => { if (epoch === state.sessionEpoch) showToast(friendlyError(error, 'Could not load winner examples.'), 'error'); });
}

function clearPrivateUi() {
  state.unsubTrades?.(); state.unsubWinners?.(); state.unsubTrades = null; state.unsubWinners = null; state.trades = []; state.winners = []; state.settings = { ...defaultSettings }; closeTradeModal(true); closeWinnerModal(true); clearWinnerImageDraft(); state.ui.tradeDraft = null; state.ui.winnerDraft = null; state.ui.calculatorDraftActive = false;
}

async function handleAuthChanged(user) {
  const previousUid = state.user?.uid || null; const nextUid = user?.uid || null; const keepCalculatorDraft = !previousUid && Boolean(nextUid) && Boolean(state.ui.calculatorDraftActive);
  state.sessionEpoch += 1; const epoch = state.sessionEpoch; state.user = user;
  if (previousUid && previousUid !== nextUid) clearPrivateUi();
  if (!user) { clearPrivateUi(); renderAll(); return; }
  try { state.settings = (await state.storage.loadSettings()) || { ...defaultSettings }; if (epoch !== state.sessionEpoch) return; await subscribeToTrades(epoch, user.uid); await subscribeToWinners(epoch, user.uid); if (!keepCalculatorDraft && !state.ui.tradeDraft) switchTab('journal'); }
  catch (error) { if (epoch === state.sessionEpoch) showToast(friendlyError(error, 'Could not load this account.'), 'error'); }
  if (epoch === state.sessionEpoch) renderAll();
}

function bindTabEvents() { refs.mainTabs = $('#mainTabs'); refs.mainTabs.addEventListener('click', (event) => { const button = event.target.closest('.tab'); if (button) switchTab(button.dataset.tab); }); }

function bindToolbarEvents() {
  refs.signInBtn.addEventListener('click', async () => { try { await state.storage.signIn(); } catch (error) { console.error(error); showToast(friendlyError(error, 'Sign-in failed.'), 'error'); } });
  refs.phoneSignInBtn.addEventListener('click', openPhoneAuthModal); refs.closePhoneAuthBtn.addEventListener('click', closePhoneAuthModal); refs.phoneAuthModal.addEventListener('click', (event) => { if (event.target.hasAttribute('data-close-phone-modal')) closePhoneAuthModal(); });
  refs.restartPhoneAuthBtn.addEventListener('click', () => { state.storage?.cancelPhoneAuth?.(); refs.phoneCodeInput.value = ''; setPhoneAuthStep('number'); refs.phoneNumberInput.focus(); });
  refs.phoneAuthForm.addEventListener('submit', async (event) => { event.preventDefault(); refs.requestPhoneCodeBtn.disabled = true; setFormStatus(refs.phoneAuthStatus, 'Requesting verification code…', 'busy'); try { await state.storage.requestPhoneCode(refs.phoneNumberInput.value, 'phoneRecaptcha'); setPhoneAuthStep('code'); setFormStatus(refs.phoneAuthStatus, 'Verification code sent.'); } catch (error) { console.error(error); setFormStatus(refs.phoneAuthStatus, friendlyError(error, 'Could not send verification code.'), 'error'); } finally { refs.requestPhoneCodeBtn.disabled = false; } });
  refs.confirmPhoneCodeBtn.addEventListener('click', async () => { refs.confirmPhoneCodeBtn.disabled = true; setFormStatus(refs.phoneAuthStatus, 'Confirming code…', 'busy'); try { await state.storage.confirmPhoneCode(refs.phoneCodeInput.value); closePhoneAuthModal(); } catch (error) { console.error(error); setFormStatus(refs.phoneAuthStatus, friendlyError(error, 'Could not verify the code.'), 'error'); } finally { refs.confirmPhoneCodeBtn.disabled = false; } });
  const signOut = async () => { try { await state.storage.signOut(); closeAccountModal(); } catch (error) { console.error(error); showToast(friendlyError(error, 'Could not sign out.'), 'error'); } };
  refs.signOutBtn.addEventListener('click', signOut); refs.accountSignOutBtn.addEventListener('click', signOut);
  refs.accountMenuBtn.addEventListener('click', openAccountModal); refs.closeAccountModalBtn.addEventListener('click', closeAccountModal); refs.accountModal.addEventListener('click', (event) => { if (event.target.hasAttribute('data-close-account-modal')) closeAccountModal(); }); refs.openAccountFromJournalBtn.addEventListener('click', openAccountModal);
  refs.resetCalcBtn.addEventListener('click', resetCalculatorForm); refs.pushCalcToTradeBtn.addEventListener('click', pushCalculatorToTrade); $$('.risk-chip').forEach((chip) => chip.addEventListener('click', () => { refs.calcRiskPercent.value = chip.dataset.risk; refs.calcLastEdited.value = 'entry'; renderCalculator(); }));
  refs.openTradeModalBtn.addEventListener('click', () => { switchTab('journal'); openTradeModal(); }); refs.closeTradeModalBtn.addEventListener('click', () => closeTradeModal()); refs.tradeModal.addEventListener('click', (event) => { if (event.target.hasAttribute('data-close-modal')) closeTradeModal(); });
  refs.addBuyFillBtn.addEventListener('click', () => { createFillRow({ side: 'BUY' }); state.ui.tradeDraft.dirty = true; syncTradePreview(); }); refs.addSellFillBtn.addEventListener('click', () => { createFillRow({ side: 'SELL' }); state.ui.tradeDraft.dirty = true; syncTradePreview(); });
  refs.fillsContainer.addEventListener('click', (event) => { const button = event.target.closest('[data-action="remove-fill"]'); if (!button) return; button.closest('.fill-card')?.remove(); if (!refs.fillsContainer.children.length) createFillRow({ side: 'BUY' }); state.ui.tradeDraft.dirty = true; syncTradePreview(); }); refs.tradeForm.addEventListener('input', () => { if (state.ui.tradeDraft) state.ui.tradeDraft.dirty = true; syncTradePreview(); }); refs.tradeForm.addEventListener('change', () => { if (state.ui.tradeDraft) state.ui.tradeDraft.dirty = true; syncTradePreview(); }); refs.tradeForm.addEventListener('submit', saveTradeForm);
  refs.duplicateTradeBtn.addEventListener('click', () => { const trade = readTradeForm(); trade.id = uid('trade'); trade.fills = trade.fills.map((fill) => ({ ...fill, id: uid('fill') })); openTradeModal(trade, 'duplicate'); }); refs.deleteTradeBtn.addEventListener('click', async () => { if (await handleDeleteTrade(refs.tradeId.value)) closeTradeModal(true); }); refs.journalTable.addEventListener('click', handleJournalClick);
  refs.importTradebookBtn.addEventListener('click', () => refs.importTradebookInput.click()); refs.importTradebookInput.addEventListener('change', handleTradebookImport); refs.exportCsvBtn.addEventListener('click', exportCsv); refs.journalPerformanceDetails.addEventListener('toggle', renderCharts);
  const bindFilter = (selector, key, render = renderAll) => { const element = $(selector); element.addEventListener('input', (event) => { state.filters[key] = event.target.value; render(); }); element.addEventListener('change', (event) => { state.filters[key] = event.target.value; render(); }); };
  for (const [selector, key] of [['#searchInput', 'search'], ['#statusFilter', 'status'], ['#directionFilter', 'direction'], ['#resultFilter', 'result'], ['#timeframeFilter', 'timeframe'], ['#strategyFilter', 'strategy'], ['#sortSelect', 'sort'], ['#lossThresholdFilter', 'lossWorseThan'], ['#moveThresholdFilter', 'minAbsMove'], ['#dipBeforeMoveFilter', 'maxDipBeforeMove']]) bindFilter(selector, key);
  $('#periodPresetFilter').addEventListener('change', (event) => { state.filters.periodPreset = event.target.value; const range = periodPresetRange(event.target.value); state.filters.fromDate = range.fromDate; state.filters.toDate = range.toDate; $('#fromDateFilter').value = range.fromDate; $('#toDateFilter').value = range.toDate; renderAll(); });
  for (const [selector, key] of [['#fromDateFilter', 'fromDate'], ['#toDateFilter', 'toDate']]) $(selector).addEventListener('change', (event) => { state.filters[key] = event.target.value; state.filters.periodPreset = 'CUSTOM'; $('#periodPresetFilter').value = 'CUSTOM'; renderAll(); });
  const bindWinnerFilter = (selector, key) => { const element = $(selector); element.addEventListener('input', (event) => { state.winnerFilters[key] = event.target.value; renderWinnerSummary(); }); element.addEventListener('change', (event) => { state.winnerFilters[key] = event.target.value; renderWinnerSummary(); }); };
  for (const [selector, key] of [['#winnerSearchInput', 'search'], ['#winnerSetupFilter', 'setup'], ['#winnerHasImageFilter', 'hasImage'], ['#winnerSortSelect', 'sort'], ['#winnerSectorFilter', 'sector'], ['#winnerTypeFilter', 'type'], ['#winnerTimeframeFilter', 'timeframe'], ['#winnerPeriodFilter', 'period'], ['#winnerMinMoveFilter', 'minMove'], ['#winnerMinInitialMoveFilter', 'minInitialMove'], ['#winnerMaxDipFilter', 'maxDipBeforeMove'], ['#winnerMaxStage4Filter', 'maxStage4Decline'], ['#winnerMinMoveCountFilter', 'minMoveCount'], ['#winnerMinBaseCountFilter', 'minBaseCount'], ['#winnerMinAvgExpansionFilter', 'minAvgExpansion'], ['#winnerMinMaxExpansionFilter', 'minMaxExpansion'], ['#winnerMinBiggestBaseFilter', 'minBiggestBaseLength'], ['#winnerMaxDeepestBaseFilter', 'maxDeepestBase']]) bindWinnerFilter(selector, key);
  for (const selector of ['#calcCapital', '#calcRiskPercent', '#calcLastEdited', '#calcEntry', '#calcSlPrice', '#calcSlPercent', '#calcPositionSize', '#calcRiskAmount', '#calcTrailPrice', '#targetR', '#targetPercent', '#targetExitPrice']) $(selector).addEventListener('input', renderCalculator); for (const [selector, mode] of [['#calcPositionSize', 'positionSize'], ['#calcRiskAmount', 'riskAmount'], ['#calcEntry', 'entry'], ['#calcSlPrice', 'entry'], ['#calcSlPercent', 'entry']]) $(selector).addEventListener('input', () => { refs.calcLastEdited.value = mode; renderCalculator(); });
  refs.saveSettingsBtn.addEventListener('click', async () => { refs.saveSettingsBtn.disabled = true; setFormStatus(refs.settingsSaveStatus, 'Saving settings to Firebase…', 'busy'); try { state.settings = await state.storage.saveSettings({ pnlMethod: refs.settingsPnlMethod.value, baseCurrency: refs.settingsCurrency.value }); renderAll(); renderCalculator(); setFormStatus(refs.settingsSaveStatus, 'Settings saved.', 'success'); } catch (error) { console.error(error); setFormStatus(refs.settingsSaveStatus, friendlyError(error, 'Could not save settings.'), 'error'); } finally { refs.saveSettingsBtn.disabled = false; } });
  refs.openWinnerModalBtn.addEventListener('click', () => openWinnerModal()); refs.closeWinnerModalBtn.addEventListener('click', () => closeWinnerModal()); refs.winnerModal.addEventListener('click', (event) => { if (event.target.hasAttribute('data-close-winner-modal')) closeWinnerModal(); }); refs.winnerTable.addEventListener('click', handleWinnerTableClick); refs.winnerTable.addEventListener('error', (event) => { const image = event.target.closest('[data-winner-image]'); if (image) { image.classList.add('hidden'); image.nextElementSibling?.classList.remove('hidden'); } }, true);
  refs.winnerForm.addEventListener('input', () => { if (state.ui.winnerDraft) state.ui.winnerDraft.dirty = true; }); refs.winnerForm.addEventListener('change', () => { if (state.ui.winnerDraft) state.ui.winnerDraft.dirty = true; }); refs.winnerForm.addEventListener('submit', saveWinnerForm); refs.winnerImageUrl.addEventListener('input', syncWinnerImagePreview); refs.pickWinnerImageBtn.addEventListener('click', () => refs.winnerImageFile.click()); refs.clearWinnerImageBtn.addEventListener('click', clearWinnerImageSelection); refs.winnerImageFile.addEventListener('change', handleWinnerImageFileChange); refs.addWinnerMoveBtn.addEventListener('click', () => { const moves = readWinnerMovesBuilderRaw(); moves.push(emptyWinnerMoveForm()); renderWinnerMovesBuilder(moves); state.ui.winnerDraft.dirty = true; }); refs.winnerMovesBuilder.addEventListener('click', (event) => { const button = event.target.closest('[data-move-builder-action="remove"]'); if (!button) return; renderWinnerMovesBuilder(readWinnerMovesBuilderRaw().filter((move) => move.id !== button.dataset.moveId)); state.ui.winnerDraft.dirty = true; }); refs.winnerMovesBuilder.addEventListener('input', renderWinnerMovesSummary); refs.deleteWinnerBtn.addEventListener('click', async () => { if (await handleDeleteWinner(refs.winnerId.value)) closeWinnerModal(true); });
  refs.closeImagePreviewBtn.addEventListener('click', closeImagePreview); refs.imagePreviewModal.addEventListener('click', (event) => { if (event.target.hasAttribute('data-close-image-preview')) closeImagePreview(); });
}

function bindKeyboardEvents() { document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (!refs.imagePreviewModal.classList.contains('hidden')) closeImagePreview(); else if (!refs.phoneAuthModal.classList.contains('hidden')) closePhoneAuthModal(); else if (!refs.accountModal.classList.contains('hidden')) closeAccountModal(); else if (!refs.winnerModal.classList.contains('hidden')) closeWinnerModal(); else if (!refs.tradeModal.classList.contains('hidden')) closeTradeModal(); }); }

async function bootstrap() {
  initRefs(); bindTabEvents(); bindToolbarEvents(); bindKeyboardEvents(); clearTradeForm(); clearWinnerForm();
  const config = window.TRADEMASTER_CONFIG?.firebase || {}; state.storage = await createStorageLayer(config); const initial = await state.storage.init(); state.user = initial.user; state.settings = initial.settings || { ...defaultSettings }; state.trades = (initial.trades || []).map((trade) => ({ ...trade, metrics: computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE) })); state.winners = (initial.winners || []).map((entry) => normalizeWinnerPayload(entry));
  state.storage.onAuthChanged(handleAuthChanged); renderAll(); renderCalculator();
}

bootstrap().catch((error) => { console.error(error); document.body.innerHTML = `<div class="shell"><div class="panel"><div class="section-title">App failed to load</div><p class="section-copy">${escapeHtml(friendlyError(error, 'Unknown error'))}</p></div></div>`; });
