import { createStorageLayer, defaultSettings } from './storage.js';
import {
  PNL_METHODS,
  TRADE_TIMEFRAMES,
  summarizeJournal,
  buildEquityCurve,
  groupMonthlyPnl,
  groupPnlByField,
  weekdayBreakdown,
  normalizeTradePayload,
  filterTrades,
  sortTrades,
  computeTradeMetrics,
  inferTradeTimeframe,
  toCsvRows,
} from './trade-engine.js';
import { solvePositionCalculator, projectTarget, lockedPnl } from './calc.js';
import { calculateMbi, buildSellChecklist, quickSellCalculator, calculateSuperMbiHistoryFromText } from './mbi.js';
import { createChartManager } from './charts.js';
import { buildAiCoachReport } from './ai-coach.js';
import { importTradebookCsv } from './tradebook-importer.js';
import { formatBytes, prepareImageForUpload, revokePreparedPreview } from './image-tools.js';
import {
  normalizeWinnerPayload,
  normalizeWinnerMoves,
  summarizeWinnerPattern,
  filterWinnerEntries,
  sortWinnerEntries,
  summarizeWinnerEntries,
  flattenWinnerObservations,
  buildWinnerExportData,
} from './winner-db.js';
import { answerJournalQuestion, answerWinnerQuestion } from './local-assistant.js';
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
  winners: [],
  unsubTrades: null,
  unsubWinners: null,
  filters: {
    search: '',
    periodPreset: 'ALL',
    status: 'ALL',
    direction: 'ALL',
    result: 'ALL',
    timeframe: 'ALL',
    strategy: 'ALL',
    minMbi: '',
    lossWorseThan: '',
    minAbsMove: '',
    maxDipBeforeMove: '',
    sort: 'DATE_DESC',
    fromDate: '',
    toDate: '',
  },
  winnerFilters: {
    search: '',
    sector: 'ALL',
    type: 'ALL',
    setup: 'ALL',
    timeframe: 'ALL',
    period: 'ALL',
    minMove: '',
    minInitialMove: '',
    maxDipBeforeMove: '',
    maxStage4Decline: '',
    minMbi: '',
    minMoveCount: '',
    minExpansionCount: '',
    minBaseCount: '',
    minMoveDays: '',
    minAvgExpansion: '',
    minMaxExpansion: '',
    minAvgExpansionLength: '',
    minMaxExpansionLength: '',
    minMajorBaseLength: '',
    maxMajorBaseDepth: '',
    minExpansionBaseLength: '',
    maxExpansionBaseDepth: '',
    hasImage: 'ALL',
    sort: 'DATE_DESC',
    fromDate: '',
    toDate: '',
  },
  ui: {
    activeTab: 'dashboard',
    toastTimer: null,
    lastImportSummary: null,
    lastCoachPrompt: '',
    mbiHistoryRows: [],
    mbiHistorySource: '',
    lastMbiImportSummary: null,
    winnerImageDraft: null,
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
  refs.dashboardFilterSummary = $('#dashboardFilterSummary');
  refs.dashboardInsightCards = $('#dashboardInsightCards');
  refs.dashboardInsights = $('#dashboardInsights');
  refs.recentTrades = $('#recentTrades');
  refs.journalTable = $('#journalTable');
  refs.journalFilterSummary = $('#journalFilterSummary');
  refs.journalStatsCards = $('#journalStatsCards');
  refs.journalStatsNote = $('#journalStatsNote');
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
  refs.journalAssistantInput = $('#journalAssistantInput');
  refs.journalAssistantAnswer = $('#journalAssistantAnswer');
  refs.askJournalAssistantBtn = $('#askJournalAssistantBtn');
  refs.resetCalcBtn = $('#resetCalcBtn');
  refs.pushCalcToTradeBtn = $('#pushCalcToTradeBtn');
  refs.copyCoachPromptBtn = $('#copyCoachPromptBtn');
  refs.coachVerdict = $('#coachVerdict');
  refs.coachSummary = $('#coachSummary');
  refs.coachScorePill = $('#coachScorePill');
  refs.coachMetaCards = $('#coachMetaCards');
  refs.coachStrengths = $('#coachStrengths');
  refs.coachLeaks = $('#coachLeaks');
  refs.coachActions = $('#coachActions');
  refs.coachPatternCards = $('#coachPatternCards');
  refs.mbiImportBtn = $('#mbiImportBtn');
  refs.mbiHistoryInput = $('#mbiHistoryInput');
  refs.mbiApplyTextareaBtn = $('#mbiApplyTextareaBtn');
  refs.mbiClearHistoryBtn = $('#mbiClearHistoryBtn');
  refs.mbiHistoryText = $('#mbiHistoryText');
  refs.mbiHistoryMeta = $('#mbiHistoryMeta');
  refs.mbiHistoryTable = $('#mbiHistoryTable');
  refs.winnerTable = $('#winnerTable');
  refs.winnerSummaryCards = $('#winnerSummaryCards');
  refs.winnerPatternAnalysis = $('#winnerPatternAnalysis');
  refs.winnerAssistantInput = $('#winnerAssistantInput');
  refs.winnerAssistantAnswer = $('#winnerAssistantAnswer');
  refs.askWinnerAssistantBtn = $('#askWinnerAssistantBtn');
  refs.winnerFilterSummary = $('#winnerFilterSummary');
  refs.winnerSectorFilter = $('#winnerSectorFilter');
  refs.winnerTypeFilter = $('#winnerTypeFilter');
  refs.winnerSetupFilter = $('#winnerSetupFilter');
  refs.winnerPeriodFilter = $('#winnerPeriodFilter');
  refs.winnerModal = $('#winnerModal');
  refs.winnerForm = $('#winnerForm');
  refs.winnerModalTitle = $('#winnerModalTitle');
  refs.deleteWinnerBtn = $('#deleteWinnerBtn');
  refs.winnerImagePreview = $('#winnerImagePreview');
  refs.winnerImageFile = $('#winnerImageFile');
  refs.pickWinnerImageBtn = $('#pickWinnerImageBtn');
  refs.clearWinnerImageBtn = $('#clearWinnerImageBtn');
  refs.winnerMovesBuilder = $('#winnerMovesBuilder');
  refs.winnerMovesSummary = $('#winnerMovesSummary');
  refs.addWinnerMoveBtn = $('#addWinnerMoveBtn');
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

function canUploadWinnerImages() {
  return state.mode === 'cloud' && Boolean(state.user) && Boolean(state.storage?.storageAvailable);
}

function clearWinnerImageDraft() {
  if (state.ui.winnerImageDraft?.prepared) revokePreparedPreview(state.ui.winnerImageDraft.prepared);
  state.ui.winnerImageDraft = null;
  if (refs.winnerImageFile) refs.winnerImageFile.value = '';
}

function winnerImageEmptyState() {
  if (canUploadWinnerImages()) {
    return 'Upload a screenshot or paste an external image URL.';
  }
  return 'Paste an external image URL, or enable Firebase Storage in cloud mode to upload screenshots directly.';
}

function requireCloudAuth() {
  return state.mode === 'demo' || Boolean(state.user);
}

function isPresent(value) {
  return value != null && value !== '';
}

function hasWinnerContent(entry = {}, pendingImage = null) {
  return Boolean(
    entry.stockName
    || entry.sector
    || entry.type
    || entry.setup
    || entry.period
    || entry.breakoutDate
    || entry.imageUrl
    || entry.imageStoragePath
    || entry.notes
    || (entry.tags || []).length
    || isPresent(entry.circuits)
    || isPresent(entry.initialMove)
    || isPresent(entry.baseLength)
    || isPresent(entry.move)
    || isPresent(entry.dipBeforeMove)
    || isPresent(entry.stage4Decline)
    || isPresent(entry.mbiScore)
    || (entry.moves || []).length
    || pendingImage,
  );
}

function looksLikeViewableImageUrl(value = '') {
  return /^(https?:\/\/|data:image\/|blob:)/i.test(String(value).trim());
}

function switchTab(tabName) {
  state.ui.activeTab = tabName;
  $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
  requestAnimationFrame(() => renderCharts());
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

function periodPresetRange(preset) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'THIS_MONTH':
      return {
        fromDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        toDate: now.toISOString().slice(0, 10),
      };
    case 'LAST_30': {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 29);
      return { fromDate: from.toISOString().slice(0, 10), toDate: now.toISOString().slice(0, 10) };
    }
    case 'LAST_90': {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 89);
      return { fromDate: from.toISOString().slice(0, 10), toDate: now.toISOString().slice(0, 10) };
    }
    case 'YTD':
      return {
        fromDate: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
        toDate: now.toISOString().slice(0, 10),
      };
    default:
      return { fromDate: '', toDate: '' };
  }
}

function getFilteredTradesRaw() {
  const filtered = filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  return filtered.map(({ metrics, ...trade }) => trade);
}

function getFilteredTradesWithMetrics() {
  return sortTrades(
    filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE),
    state.filters.sort,
  );
}

function getRenderableTrades() {
  const filtered = filterTrades(state.trades, state.filters, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  return sortTrades(filtered, state.filters.sort);
}

function getRenderableWinners() {
  return sortWinnerEntries(filterWinnerEntries(state.winners, state.winnerFilters), state.winnerFilters.sort);
}

function activeTradeFilterLabels() {
  const labels = [];
  if (state.filters.search) labels.push(`Search: ${state.filters.search}`);
  if (state.filters.periodPreset && state.filters.periodPreset !== 'ALL' && state.filters.periodPreset !== 'CUSTOM') labels.push(state.filters.periodPreset.replace(/_/g, ' '));
  if (state.filters.status && state.filters.status !== 'ALL') labels.push(state.filters.status);
  if (state.filters.direction && state.filters.direction !== 'ALL') labels.push(state.filters.direction);
  if (state.filters.result && state.filters.result !== 'ALL') labels.push(state.filters.result === 'WIN' ? 'Winners' : 'Losers');
  if (state.filters.timeframe && state.filters.timeframe !== 'ALL') labels.push(state.filters.timeframe);
  if (state.filters.strategy && state.filters.strategy !== 'ALL') labels.push(`Strategy: ${state.filters.strategy}`);
  if (state.filters.minMbi) labels.push(`SuperMBI ≥ ${state.filters.minMbi}`);
  if (state.filters.lossWorseThan) labels.push(`Loss ≤ -${state.filters.lossWorseThan}%`);
  if (state.filters.minAbsMove) labels.push(`Abs move ≥ ${state.filters.minAbsMove}%`);
  if (state.filters.maxDipBeforeMove) labels.push(`Dip ≤ ${state.filters.maxDipBeforeMove}%`);
  if (state.filters.fromDate || state.filters.toDate) labels.push(`${state.filters.fromDate || '...'} → ${state.filters.toDate || '...'}`);
  return labels;
}

function activeWinnerFilterLabels() {
  const labels = [];
  if (state.winnerFilters.search) labels.push(`Search: ${state.winnerFilters.search}`);
  if (state.winnerFilters.sector && state.winnerFilters.sector !== 'ALL') labels.push(`Sector: ${state.winnerFilters.sector}`);
  if (state.winnerFilters.type && state.winnerFilters.type !== 'ALL') labels.push(`Type: ${state.winnerFilters.type}`);
  if (state.winnerFilters.setup && state.winnerFilters.setup !== 'ALL') labels.push(`Setup: ${state.winnerFilters.setup}`);
  if (state.winnerFilters.timeframe && state.winnerFilters.timeframe !== 'ALL') labels.push(state.winnerFilters.timeframe);
  if (state.winnerFilters.period && state.winnerFilters.period !== 'ALL') labels.push(`Period: ${state.winnerFilters.period}`);
  if (state.winnerFilters.minMove) labels.push(`Move ≥ ${state.winnerFilters.minMove}%`);
  if (state.winnerFilters.minInitialMove) labels.push(`Initial ≥ ${state.winnerFilters.minInitialMove}%`);
  if (state.winnerFilters.maxDipBeforeMove) labels.push(`Dip ≤ ${state.winnerFilters.maxDipBeforeMove}%`);
  if (state.winnerFilters.maxStage4Decline) labels.push(`Stage-4 ≤ ${state.winnerFilters.maxStage4Decline}%`);
  if (state.winnerFilters.minMbi) labels.push(`SuperMBI ≥ ${state.winnerFilters.minMbi}`);
  if (state.winnerFilters.minMoveCount) labels.push(`Moves ≥ ${state.winnerFilters.minMoveCount}`);
  if (state.winnerFilters.minExpansionCount) labels.push(`Expansions ≥ ${state.winnerFilters.minExpansionCount}`);
  if (state.winnerFilters.minBaseCount) labels.push(`Bases ≥ ${state.winnerFilters.minBaseCount}`);
  if (state.winnerFilters.minMoveDays) labels.push(`Cycle days ≥ ${state.winnerFilters.minMoveDays}`);
  if (state.winnerFilters.minAvgExpansion) labels.push(`Avg expansion ≥ ${state.winnerFilters.minAvgExpansion}%`);
  if (state.winnerFilters.minMaxExpansion) labels.push(`Best expansion ≥ ${state.winnerFilters.minMaxExpansion}%`);
  if (state.winnerFilters.minAvgExpansionLength) labels.push(`Avg expansion length ≥ ${state.winnerFilters.minAvgExpansionLength}`);
  if (state.winnerFilters.minMaxExpansionLength) labels.push(`Best expansion length ≥ ${state.winnerFilters.minMaxExpansionLength}`);
  if (state.winnerFilters.minMajorBaseLength) labels.push(`Major base ≥ ${state.winnerFilters.minMajorBaseLength}`);
  if (state.winnerFilters.maxMajorBaseDepth) labels.push(`Major base depth ≤ ${state.winnerFilters.maxMajorBaseDepth}%`);
  if (state.winnerFilters.minExpansionBaseLength) labels.push(`Expansion-base ≥ ${state.winnerFilters.minExpansionBaseLength}`);
  if (state.winnerFilters.maxExpansionBaseDepth) labels.push(`Expansion-base depth ≤ ${state.winnerFilters.maxExpansionBaseDepth}%`);
  if (state.winnerFilters.hasImage && state.winnerFilters.hasImage !== 'ALL') labels.push(state.winnerFilters.hasImage === 'YES' ? 'Has image' : 'No image');
  if (state.winnerFilters.fromDate || state.winnerFilters.toDate) labels.push(`${state.winnerFilters.fromDate || '...'} → ${state.winnerFilters.toDate || '...'}`);
  return labels;
}

function renderTradeFilterSummary() {
  const items = getRenderableTrades();
  const labels = activeTradeFilterLabels();
  const uniqueSymbols = new Set(items.map((trade) => trade.symbol).filter(Boolean)).size;
  const closedCount = items.filter((trade) => trade.metrics.status === 'CLOSED').length;
  const summaryText = `${items.length} filtered trades • ${uniqueSymbols} symbols • ${closedCount} closed`;
  const pills = labels.length
    ? `<div class="filter-pill-row">${labels.map((label) => `<span class="pill pill-muted">${escapeHtml(label)}</span>`).join('')}</div>`
    : '<div class="filter-pill-row"><span class="pill pill-muted">No extra filters</span></div>';
  if (refs.journalFilterSummary) refs.journalFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">${summaryText}</div></div>${pills}`;
  if (refs.dashboardFilterSummary) refs.dashboardFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">Dashboard scope: ${summaryText}</div></div>${pills}`;
}

function renderJournalStats() {
  if (!refs.journalStatsCards) return;
  if (!requireCloudAuth()) {
    refs.journalStatsCards.innerHTML = '<div class="empty-state">Sign in to see scoped journal stats.</div>';
    if (refs.journalStatsNote) refs.journalStatsNote.textContent = 'Journal stats respect the active period and filter scope.';
    return;
  }

  const scopedTrades = getFilteredTradesRaw();
  const summary = summarizeJournal(scopedTrades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const noClosedTrades = Number(summary.closedTradeCount || 0) === 0;
  const cards = [
    makeMetricPreviewCard('Win %', noClosedTrades ? '—' : formatPercent(summary.winRate, 1), summary.winRate >= 50 ? 'positive' : ''),
    makeMetricPreviewCard('Loss %', noClosedTrades ? '—' : formatPercent(summary.lossRate, 1), summary.lossRate > 50 ? 'negative' : ''),
    makeMetricPreviewCard('Win size', Number(summary.winCount || 0) ? formatCurrency(summary.grossProfit, getCurrency()) : '—', 'positive'),
    makeMetricPreviewCard('Loss size', Number(summary.lossCount || 0) ? formatCurrency(Math.abs(summary.grossLossAbs || 0), getCurrency()) : '—', 'negative'),
    makeMetricPreviewCard('Avg win size', Number(summary.winCount || 0) ? formatCurrency(summary.avgWin, getCurrency()) : '—', 'positive'),
    makeMetricPreviewCard('Avg loss size', Number(summary.lossCount || 0) ? formatCurrency(Math.abs(summary.avgLossAbs || 0), getCurrency()) : '—', 'negative'),
    makeMetricPreviewCard('Avg win hold', Number(summary.winCount || 0) ? formatDurationMinutes(summary.avgWinHoldMinutes) : '—'),
    makeMetricPreviewCard('Avg loss hold', Number(summary.lossCount || 0) ? formatDurationMinutes(summary.avgLossHoldMinutes) : '—', summary.avgLossHoldMinutes > summary.avgWinHoldMinutes ? 'negative' : ''),
    makeMetricPreviewCard('Avg dip before move', summary.avgDipBeforeMove != null ? formatPercent(summary.avgDipBeforeMove, 2) : '—'),
    makeMetricPreviewCard('Avg winner dip', summary.avgWinDipBeforeMove != null ? formatPercent(summary.avgWinDipBeforeMove, 2) : '—', 'positive'),
    makeMetricPreviewCard('Avg loser dip', summary.avgLossDipBeforeMove != null ? formatPercent(summary.avgLossDipBeforeMove, 2) : '—', summary.avgLossDipBeforeMove != null && summary.avgWinDipBeforeMove != null && summary.avgLossDipBeforeMove > summary.avgWinDipBeforeMove ? 'negative' : ''),
    makeMetricPreviewCard('Winner dip 80% (SL guide)', summary.winnerDipP80 != null ? formatPercent(summary.winnerDipP80, 2) : '—', summary.winnerDipP80 != null ? 'warning' : ''),
    makeMetricPreviewCard('Open risk now', summary.currentOpenRisk > 0 ? formatCurrency(summary.currentOpenRisk, getCurrency()) : '—', summary.currentOpenRisk > 0 ? 'warning' : ''),
    makeMetricPreviewCard('Peak open risk', summary.peakOpenRisk > 0 ? formatCurrency(summary.peakOpenRisk, getCurrency()) : '—', summary.peakOpenRisk > 0 ? 'warning' : ''),
  ];
  refs.journalStatsCards.innerHTML = cards.join('');

  if (refs.journalStatsNote) {
    const dipNote = summary.dipSampleCount > 0
      ? `${summary.dipSampleCount} closed trade(s) in this scope include dip-before-move data.`
      : 'Dip-before-move is optional, so add it on trades you want to use for stop analysis.';
    if (summary.trackedRiskTradeCount > 0) {
      refs.journalStatsNote.textContent = `Open risk uses Planned risk first, then planned stop distance when a stop exists. ${summary.trackedRiskTradeCount} trade(s) in this scope include enough risk data. ${dipNote}`;
    } else {
      refs.journalStatsNote.textContent = `Open risk cards need Planned risk or Planned stop on the trade to be measurable. ${dipNote}`;
    }
  }
}

function renderSummaryCards() {
  if (!requireCloudAuth()) {
    refs.summaryCards.innerHTML = '<div class="empty-state">Sign in to see dashboard stats.</div>';
    if (refs.dashboardInsightCards) refs.dashboardInsightCards.innerHTML = '';
    if (refs.dashboardInsights) refs.dashboardInsights.innerHTML = '';
    return;
  }
  const scopedTrades = getFilteredTradesRaw();
  const summary = summarizeJournal(scopedTrades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
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

  const items = getRenderableTrades();
  const closed = items.filter((trade) => trade.metrics.status === 'CLOSED');
  const avgWinnerHold = Number(summary.avgWinHoldMinutes || 0);
  const avgLoserHold = Number(summary.avgLossHoldMinutes || 0);
  const bestTimeframe = groupPnlByField(scopedTrades, 'timeframe', state.settings.pnlMethod || PNL_METHODS.AVERAGE)[0];
  const symbolBuckets = groupPnlByField(scopedTrades, 'symbol', state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const bestSymbol = symbolBuckets[0];
  const worstSymbol = [...symbolBuckets].sort((a, b) => a.value - b.value)[0];
  const coachReport = buildAiCoachReport(scopedTrades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const bestMbiBucket = coachReport.series?.mbiBuckets?.[0];

  if (refs.dashboardInsightCards) {
    refs.dashboardInsightCards.innerHTML = [
      makeMetricPreviewCard('Best timeframe', bestTimeframe?.label || '—', bestTimeframe?.value >= 0 ? 'positive' : ''),
      makeMetricPreviewCard('Best symbol', bestSymbol ? `${bestSymbol.label}` : '—', bestSymbol?.value >= 0 ? 'positive' : ''),
      makeMetricPreviewCard('Weak symbol', worstSymbol ? `${worstSymbol.label}` : '—', worstSymbol?.value < 0 ? 'negative' : ''),
      makeMetricPreviewCard('Winner hold', avgWinnerHold ? formatDurationMinutes(avgWinnerHold) : '—'),
      makeMetricPreviewCard('Loser hold', avgLoserHold ? formatDurationMinutes(avgLoserHold) : '—', avgLoserHold > avgWinnerHold ? 'negative' : ''),
      makeMetricPreviewCard('Avg winner dip', summary.avgWinDipBeforeMove != null ? formatPercent(summary.avgWinDipBeforeMove, 2) : '—'),
      makeMetricPreviewCard('SL guide (winner dip 80%)', summary.winnerDipP80 != null ? formatPercent(summary.winnerDipP80, 2) : '—', summary.winnerDipP80 != null ? 'warning' : ''),
      makeMetricPreviewCard('Open risk now', summary.currentOpenRisk > 0 ? formatCurrency(summary.currentOpenRisk, getCurrency()) : '—', summary.currentOpenRisk > 0 ? 'warning' : ''),
      makeMetricPreviewCard('Peak open risk', summary.peakOpenRisk > 0 ? formatCurrency(summary.peakOpenRisk, getCurrency()) : '—', summary.peakOpenRisk > 0 ? 'warning' : ''),
      makeMetricPreviewCard('Best SuperMBI', bestMbiBucket?.label || '—', bestMbiBucket?.pnl > 0 ? 'positive' : ''),
    ].join('');
  }

  if (refs.dashboardInsights) {
    const insights = [];
    if (closed.length === 0) {
      refs.dashboardInsights.innerHTML = '<div class="coach-item neutral">No closed trades match the current filter scope yet.</div>';
      return;
    }
    if (avgLoserHold && avgWinnerHold && avgLoserHold > avgWinnerHold) {
      insights.push(`Losers are held longer than winners (${formatDurationMinutes(avgLoserHold)} vs ${formatDurationMinutes(avgWinnerHold)}). Cutting weak trades earlier should improve reward-to-risk.`);
    }
    if (bestTimeframe?.label) {
      insights.push(`${bestTimeframe.label} is the best-performing timeframe in the current scope. That is the bucket where bigger size is justified first.`);
    }
    if (worstSymbol?.value < 0) {
      insights.push(`${worstSymbol.label} is the biggest drag in this filtered sample. Review those losses before re-allocating size there.`);
    }
    if (bestMbiBucket?.label) {
      insights.push(`${bestMbiBucket.label} SuperMBI conditions are producing the best filtered P&L. When the market gives that regime, you can size more aggressively.`);
    }
    if (summary.peakOpenRisk > 0) {
      const nowLabel = summary.currentOpenRisk > 0 ? formatCurrency(summary.currentOpenRisk, getCurrency()) : '₹0';
      insights.push(`Current open risk is ${nowLabel}, and the peak concurrent open risk in this filtered sample reached ${formatCurrency(summary.peakOpenRisk, getCurrency())}. Use that number as a ceiling when sizing new adds.`);
    }
    if (summary.winnerDipP80 != null) {
      insights.push(`80% of your winners with dip data only moved ${formatPercent(summary.winnerDipP80, 2)} against you before working. That is a much better stop reference than guessing from memory.`);
    }
    if (summary.avgWinDipBeforeMove != null && summary.avgLossDipBeforeMove != null) {
      if (summary.avgLossDipBeforeMove > summary.avgWinDipBeforeMove) {
        insights.push(`Losers usually go deeper against you before failing (${formatPercent(summary.avgLossDipBeforeMove, 2)} vs winner dip ${formatPercent(summary.avgWinDipBeforeMove, 2)}). A stop tighter than the loser profile but wider than the winner profile is the sweet spot to test.`);
      } else {
        insights.push(`Winners are also shaking you out by about ${formatPercent(summary.avgWinDipBeforeMove, 2)} on average before working. If your stop is tighter than that, you may be cutting good trades too early.`);
      }
    }
    if (!insights.length) insights.push('This filter scope is relatively balanced. Keep tightening entries and exits to turn decent trades into size-worthy trades.');
    refs.dashboardInsights.innerHTML = insights.map((item) => `<div class="coach-item warning">${escapeHtml(item)}</div>`).join('');
  }
}

function renderRecentTrades() {
  if (!requireCloudAuth()) {
    refs.recentTrades.innerHTML = '<div class="empty-state">Sign in to view your trades.</div>';
    return;
  }
  const items = getRenderableTrades().slice(0, 5);
  if (!items.length) {
    refs.recentTrades.innerHTML = '<div class="empty-state">No trades match the active filters yet.</div>';
    return;
  }
  refs.recentTrades.innerHTML = items.map(renderTradeCard).join('');
}

function toneClass(tone) {
  if (tone === 'positive') return 'positive';
  if (tone === 'negative') return 'negative';
  if (tone === 'warning') return 'warning';
  return 'neutral';
}

function renderCoachList(items = [], fallback, tone = 'neutral') {
  if (!items.length) return `<div class="coach-item neutral">${escapeHtml(fallback)}</div>`;
  return items.map((item) => `<div class="coach-item ${toneClass(tone)}">${escapeHtml(item)}</div>`).join('');
}

function renderCoach() {
  if (!refs.coachVerdict) return;
  if (!requireCloudAuth()) {
    refs.coachVerdict.textContent = 'Sign in needed';
    refs.coachSummary.textContent = 'Sign in to sync trades and unlock coach analysis.';
    refs.coachScorePill.className = 'pill pill-muted';
    refs.coachScorePill.textContent = '0 / 100';
    refs.coachMetaCards.innerHTML = '<div class="empty-state">Sign in to analyse your cloud journal.</div>';
    refs.coachStrengths.innerHTML = renderCoachList([], 'No analysis yet.', 'neutral');
    refs.coachLeaks.innerHTML = renderCoachList([], 'No analysis yet.', 'neutral');
    refs.coachActions.innerHTML = renderCoachList(['Sign in first, then import trades or add them manually.'], '', 'warning');
    refs.coachPatternCards.innerHTML = '';
    state.ui.lastCoachPrompt = '';
    return;
  }

  const scopedTrades = getFilteredTradesRaw();
  const report = buildAiCoachReport(scopedTrades, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  state.ui.lastCoachPrompt = report.promptText || '';
  refs.coachVerdict.textContent = report.verdict;
  refs.coachVerdict.className = cn('coach-verdict', report.score >= 70 && 'positive', report.score < 45 && 'negative', report.score >= 45 && report.score < 70 && 'warning');
  refs.coachSummary.textContent = report.summaryText;
  refs.coachScorePill.className = cn('pill', report.score >= 70 ? 'pill-green' : report.score >= 45 ? 'pill-amber' : 'pill-red');
  refs.coachScorePill.textContent = `${report.score} / 100`;

  const avgLossAbs = Math.abs(report.summary.avgLoss || 0);
  const rewardRisk = avgLossAbs > 0 ? (Math.abs(report.summary.avgWin || 0) / avgLossAbs) : 0;
  refs.coachMetaCards.innerHTML = [
    makeMetricPreviewCard('Coach score', `${report.score}/100`, report.score >= 70 ? 'positive' : report.score < 45 ? 'negative' : 'warning'),
    makeMetricPreviewCard('Profit factor', report.summary.profitFactor ? round(report.summary.profitFactor, 2).toFixed(2) : '—', (report.summary.profitFactor || 0) >= 1.5 ? 'positive' : (report.summary.profitFactor || 0) > 0 && (report.summary.profitFactor || 0) < 1 ? 'negative' : ''),
    makeMetricPreviewCard('Reward / risk', rewardRisk ? round(rewardRisk, 2).toFixed(2) : '—', rewardRisk >= 1.3 ? 'positive' : rewardRisk > 0 && rewardRisk < 1 ? 'negative' : ''),
    makeMetricPreviewCard('Loss streak', String(report.summary.bestLossStreak || 0), (report.summary.bestLossStreak || 0) >= 3 ? 'negative' : ''),
    makeMetricPreviewCard('Closed trades', String(report.summary.closedTradeCount || 0)),
    makeMetricPreviewCard('Expectancy', formatCurrency(report.summary.expectancy || 0, getCurrency()), (report.summary.expectancy || 0) >= 0 ? 'positive' : 'negative'),
  ].join('');

  refs.coachStrengths.innerHTML = renderCoachList(report.strengths, 'Add more clean closed trades to surface durable strengths.', 'positive');
  refs.coachLeaks.innerHTML = renderCoachList(report.leaks, 'No dominant leak identified yet.', 'negative');
  refs.coachActions.innerHTML = report.actions.length
    ? report.actions.map((item) => `<div class="coach-item warning">${escapeHtml(item)}</div>`).join('')
    : renderCoachList([], 'No immediate action plan yet.', 'warning');
  refs.coachPatternCards.innerHTML = report.patternCards.length
    ? report.patternCards.map((item) => `
        <div class="panel metric-card">
          <div class="metric-label">${escapeHtml(item.label)}</div>
          <div class="metric-value ${toneClass(item.tone)}">${escapeHtml(item.value)}</div>
          <div class="pattern-card-note">${escapeHtml(item.note || '')}</div>
        </div>
      `).join('')
    : '<div class="empty-state">Start tagging strategies and SuperMBI snapshots to unlock more pattern cards.</div>';
}

function renderTradeCard(trade) {
  const metrics = trade.metrics || computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const statusPill = metrics.status === 'OPEN' ? '<span class="pill pill-blue">Open</span>' : '<span class="pill pill-green">Closed</span>';
  const directionPill = trade.direction === 'SHORT' ? '<span class="pill pill-red">Short</span>' : '<span class="pill pill-green">Long</span>';
  const timeframePill = `<span class="pill pill-muted">${escapeHtml(metrics.timeframe || inferTradeTimeframe(trade, metrics))}</span>`;
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
            ${timeframePill}
            ${trade.strategy ? `<span class="pill pill-muted">${escapeHtml(trade.strategy)}</span>` : ''}
          </div>
          ${tags ? `<div class="trade-tags">${tags}</div>` : ''}
        </div>
        <div>
          <div class="metric-value ${pnlClass}">${formatCurrency(metrics.realizedNetPnl, getCurrency())}</div>
          <div class="metric-sub ${metrics.realizedPct >= 0 ? 'positive' : 'negative'}">${metrics.realizedPct != null ? formatPercent(metrics.realizedPct, 2) : '—'}</div>
        </div>
      </div>
      <div class="trade-meta">
        <div>Opened: ${formatDateTime(metrics.entryAt || trade.createdAt)}</div>
        <div>Avg entry: ${metrics.avgEntryPrice ? formatCurrency(metrics.avgEntryPrice, getCurrency()) : '—'}</div>
        <div>Avg exit: ${metrics.avgExitPrice ? formatCurrency(metrics.avgExitPrice, getCurrency()) : '—'}</div>
        <div>Hold: ${formatDurationMinutes(metrics.holdMinutes)}</div>
        <div>SuperMBI: ${trade.mbiScore ?? '—'}</div>
      </div>
      <div class="trade-stats">
        <div class="stat-chip"><div class="label">Entry qty</div><div class="value">${metrics.totalEntryQty}</div></div>
        <div class="stat-chip"><div class="label">Exit qty</div><div class="value">${metrics.totalExitQty}</div></div>
        <div class="stat-chip"><div class="label">Abs move %</div><div class="value">${metrics.absMovePct != null ? formatPercent(metrics.absMovePct, 2) : '—'}</div></div>
        <div class="stat-chip"><div class="label">Dip before move</div><div class="value">${trade.dipBeforeMove != null ? formatPercent(trade.dipBeforeMove, 2) : '—'}</div></div>
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

function renderWinnerFilterOptions() {
  if (!refs.winnerSectorFilter) return;
  const sectors = [...new Set(state.winners.map((entry) => entry.sector || 'Unspecified').filter(Boolean))].sort();
  const types = [...new Set(state.winners.map((entry) => entry.type || 'Unspecified').filter(Boolean))].sort();
  const setups = [...new Set(state.winners.map((entry) => entry.setup || 'Unspecified').filter(Boolean))].sort();
  const periods = [...new Set(state.winners.map((entry) => entry.period || 'Unspecified').filter(Boolean))].sort();
  refs.winnerSectorFilter.innerHTML = '<option value="ALL">All</option>' + sectors.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  refs.winnerTypeFilter.innerHTML = '<option value="ALL">All</option>' + types.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  refs.winnerSetupFilter.innerHTML = '<option value="ALL">All</option>' + setups.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  refs.winnerPeriodFilter.innerHTML = '<option value="ALL">All</option>' + periods.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  refs.winnerSectorFilter.value = state.winnerFilters.sector;
  refs.winnerTypeFilter.value = state.winnerFilters.type;
  refs.winnerSetupFilter.value = state.winnerFilters.setup;
  refs.winnerPeriodFilter.value = state.winnerFilters.period;
}


function collectWinnerPatternTags(entry = {}) {
  const nested = (entry.moves || []).flatMap((move) => [
    ...(move.tags || []),
    ...(move.preMoveBase?.tags || []),
    ...(move.expansions || []).flatMap((expansion) => [
      ...(expansion.tags || []),
      ...(expansion.base?.tags || []),
    ]),
  ]);
  return [...(entry.tags || []), ...nested].map((tag) => String(tag || '').trim()).filter(Boolean);
}

function rankWinnerGroups(entries = [], selector) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const key = String(selector(entry) || '').trim();
    const move = entry.effectiveMove;
    if (!key || move == null) return;
    if (!grouped.has(key)) grouped.set(key, { key, count: 0, moveSum: 0, daySum: 0, dayCount: 0 });
    const bucket = grouped.get(key);
    bucket.count += 1;
    bucket.moveSum += Number(move);
    const days = entry.pattern?.totalMoveDaysAuto;
    if (days != null) {
      bucket.daySum += Number(days);
      bucket.dayCount += 1;
    }
  });
  return [...grouped.values()]
    .map((bucket) => ({
      key: bucket.key,
      count: bucket.count,
      avgMove: round(bucket.moveSum / bucket.count, 2),
      avgDays: bucket.dayCount ? round(bucket.daySum / bucket.dayCount, 2) : null,
    }))
    .sort((a, b) => b.avgMove - a.avgMove || b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 4);
}

function rankWinnerTags(entries = []) {
  const counts = new Map();
  entries.forEach((entry) => {
    collectWinnerPatternTags(entry).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 8);
}

function bulletListHtml(items = [], emptyText = 'No strong pattern yet.') {
  if (!items.length) return `<div class="panel-note compact-top">${escapeHtml(emptyText)}</div>`;
  return `<ul class="deploy-list compact-top">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function buildWinnerPatternAnalysisHtml(entries = [], summary = {}) {
  if (!entries.length) {
    return '<div class="panel empty-state">No winner records match the current filters.</div>';
  }

  const strengths = [];
  const cautions = [];
  const actions = [];

  if (summary.avgMove != null && summary.avgMoveDays != null) {
    strengths.push(`Filtered winners average ${formatPercent(summary.avgMove, 1)} over ${summary.avgMoveDays.toFixed(1)} cycle-days.`);
  } else if (summary.avgMove != null) {
    strengths.push(`Filtered winners average ${formatPercent(summary.avgMove, 1)} total move.`);
  }

  if (summary.avgExpansion != null) {
    const lengthPart = summary.avgExpansionLength != null ? ` over ${summary.avgExpansionLength.toFixed(1)} bars/days` : '';
    strengths.push(`Expansion legs average ${formatPercent(summary.avgExpansion, 1)}${lengthPart}, while best legs average ${formatPercent(summary.avgMaxExpansion, 1)}.`);
  }

  if (summary.avgMajorBaseLength != null || summary.avgExpansionBaseLength != null) {
    strengths.push(`Major bases average ${summary.avgMajorBaseLength != null ? `${summary.avgMajorBaseLength.toFixed(1)} bars` : '—'} and expansion bases average ${summary.avgExpansionBaseLength != null ? `${summary.avgExpansionBaseLength.toFixed(1)} bars` : '—'}.`);
  }

  if (summary.avgMoveToDip != null) {
    if (summary.avgMoveToDip >= 4) {
      strengths.push(`Move-to-dip ratio is ${summary.avgMoveToDip.toFixed(2)}x, so leaders usually pay several times the pain they inflict.`);
    } else {
      cautions.push(`Move-to-dip ratio is only ${summary.avgMoveToDip.toFixed(2)}x, so weak entry timing can compress reward quickly.`);
    }
  }

  if (summary.majorBaseDepthP80 != null) {
    actions.push(`Primary breakout base depth 80% is around ${formatPercent(summary.majorBaseDepthP80, 1)}. Stops tighter than this will cut many valid fresh breakouts.`);
  }
  if (summary.expansionBaseDepthP80 != null) {
    actions.push(`Continuation base depth 80% is around ${formatPercent(summary.expansionBaseDepthP80, 1)}. Use this as a guide for add-on SL placement during expansions.`);
  }
  if (summary.expansionLengthP80 != null) {
    actions.push(`Most expansion legs finish within about ${summary.expansionLengthP80.toFixed(1)} bars/days. If a leg stalls longer, tighten management faster.`);
  }
  if (summary.moveDaysP80 != null) {
    actions.push(`Most complete cycles finish within about ${summary.moveDaysP80.toFixed(1)} cycle-days. Late-cycle drifts beyond that deserve reduced size and quicker exits.`);
  }
  if (summary.avgStage4Decline != null && summary.avgStage4Decline > 25) {
    cautions.push(`Average stage-4 decline is ${formatPercent(summary.avgStage4Decline, 1)}. Your leaders can unravel violently once the cycle cracks.`);
  }
  if (summary.avgDeepestBase != null && summary.avgDeepestBase > 18) {
    cautions.push(`Deepest bases average ${formatPercent(summary.avgDeepestBase, 1)}. Tight breakout stops will be punished unless you only trade the tightest names.`);
  }

  const topSetups = rankWinnerGroups(entries, (entry) => entry.setup || 'Unspecified');
  const topSectors = rankWinnerGroups(entries, (entry) => entry.sector || 'Unspecified');
  const topTags = rankWinnerTags(entries);

  const leaders = [];
  if (topSetups[0]) leaders.push(`Best setup bucket right now: ${topSetups[0].key} averaging ${formatPercent(topSetups[0].avgMove, 1)} across ${topSetups[0].count} records.`);
  if (topSectors[0]) leaders.push(`Best sector bucket right now: ${topSectors[0].key} averaging ${formatPercent(topSectors[0].avgMove, 1)} across ${topSectors[0].count} records.`);
  if (topTags.length) leaders.push(`Most common pattern tags: ${topTags.slice(0, 4).map((item) => `${item.tag} (${item.count})`).join(', ')}.`);

  return `
    <div class="analytics-grid compact-top">
      <div class="panel">
        <div class="panel-title">Pattern coach</div>
        ${bulletListHtml(strengths, 'Add a few more complete winners with moves, expansions, and bases to generate stronger pattern insights.')}
      </div>
      <div class="panel">
        <div class="panel-title">SL / management ideas</div>
        ${bulletListHtml(actions, 'Add expansion-base lengths and depths to turn this into a stop-loss guide.')}
      </div>
      <div class="panel">
        <div class="panel-title">Cautions</div>
        ${bulletListHtml(cautions, 'No major weakness stands out in the current filtered sample.')}
      </div>
      <div class="panel">
        <div class="panel-title">Leaders in this filter</div>
        ${bulletListHtml(leaders, 'Add tags, setups, and sectors to highlight what your best bull cycles have in common.')}
      </div>
    </div>
  `;
}

function renderWinnerSummary() {
  if (!requireCloudAuth()) {
    refs.winnerSummaryCards.innerHTML = '<div class="empty-state">Sign in to build the winner database.</div>';
    refs.winnerTable.innerHTML = '';
    if (refs.winnerPatternAnalysis) refs.winnerPatternAnalysis.innerHTML = '';
    return;
  }
  const items = getRenderableWinners();
  const summary = summarizeWinnerEntries(items);
  const labels = activeWinnerFilterLabels();
  const pills = labels.length
    ? `<div class="filter-pill-row">${labels.map((label) => `<span class="pill pill-muted">${escapeHtml(label)}</span>`).join('')}</div>`
    : '<div class="filter-pill-row"><span class="pill pill-muted">No extra filters</span></div>';
  refs.winnerFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">${summary.count} records • ${summary.uniqueStocks} stocks • ${summary.patternCoverageCount || 0} cycle maps • ${summary.majorBaseSampleCount || 0} major-base samples • ${summary.expansionBaseSampleCount || 0} expansion-base samples • ${summary.withImages} images</div></div>${pills}`;
  refs.winnerSummaryCards.innerHTML = [
    makeMetricPreviewCard('Records after filter', String(summary.count)),
    makeMetricPreviewCard('Stocks after filter', String(summary.uniqueStocks)),
    makeMetricPreviewCard('Cycle maps', String(summary.patternCoverageCount || 0), summary.patternCoverageCount ? 'positive' : ''),
    makeMetricPreviewCard('Avg total move %', summary.avgMove != null ? formatPercent(summary.avgMove, 1) : '—', summary.avgMove != null && summary.avgMove >= 20 ? 'positive' : ''),
    makeMetricPreviewCard('Avg cycle days', summary.avgMoveDays != null ? summary.avgMoveDays.toFixed(1) : '—'),
    makeMetricPreviewCard('Avg initial move %', summary.avgInitialMove != null ? formatPercent(summary.avgInitialMove, 1) : '—'),
    makeMetricPreviewCard('Avg moves / stock', summary.avgMoveCount != null ? summary.avgMoveCount.toFixed(1) : '—'),
    makeMetricPreviewCard('Avg expansions / stock', summary.avgExpansionCount != null ? summary.avgExpansionCount.toFixed(1) : '—'),
    makeMetricPreviewCard('Avg bases / stock', summary.avgBaseCount != null ? summary.avgBaseCount.toFixed(1) : '—'),
    makeMetricPreviewCard('Avg expansion %', summary.avgExpansion != null ? formatPercent(summary.avgExpansion, 1) : '—'),
    makeMetricPreviewCard('Avg best expansion %', summary.avgMaxExpansion != null ? formatPercent(summary.avgMaxExpansion, 1) : '—', summary.avgMaxExpansion != null && summary.avgMaxExpansion >= 10 ? 'positive' : ''),
    makeMetricPreviewCard('Avg exp length', summary.avgExpansionLength != null ? summary.avgExpansionLength.toFixed(1) : '—'),
    makeMetricPreviewCard('Best exp length', summary.avgMaxExpansionLength != null ? summary.avgMaxExpansionLength.toFixed(1) : '—'),
    makeMetricPreviewCard('Avg major base', summary.avgMajorBaseLength != null ? `${summary.avgMajorBaseLength.toFixed(1)} bars` : '—'),
    makeMetricPreviewCard('Major base 80%', summary.majorBaseDepthP80 != null ? formatPercent(summary.majorBaseDepthP80, 1) : '—', summary.majorBaseDepthP80 != null ? 'warning' : ''),
    makeMetricPreviewCard('Avg expansion base', summary.avgExpansionBaseLength != null ? `${summary.avgExpansionBaseLength.toFixed(1)} bars` : '—'),
    makeMetricPreviewCard('Exp-base 80%', summary.expansionBaseDepthP80 != null ? formatPercent(summary.expansionBaseDepthP80, 1) : '—', summary.expansionBaseDepthP80 != null ? 'warning' : ''),
    makeMetricPreviewCard('Avg dip before move', summary.avgDipBeforeMove != null ? formatPercent(summary.avgDipBeforeMove, 1) : '—'),
    makeMetricPreviewCard('Winner dip 80%', summary.dipP80 != null ? formatPercent(summary.dipP80, 1) : '—', summary.dipP80 != null ? 'warning' : ''),
    makeMetricPreviewCard('Move : dip', summary.avgMoveToDip != null ? `${summary.avgMoveToDip.toFixed(2)}x` : '—', summary.avgMoveToDip != null && summary.avgMoveToDip >= 4 ? 'positive' : ''),
    makeMetricPreviewCard('Avg stage-4 decline', summary.avgStage4Decline != null ? formatPercent(summary.avgStage4Decline, 1) : '—', summary.avgStage4Decline != null && summary.avgStage4Decline <= 25 ? 'positive' : ''),
    makeMetricPreviewCard('Avg circuits', summary.avgCircuits != null ? String(summary.avgCircuits) : '—'),
  ].join('');

  if (refs.winnerPatternAnalysis) refs.winnerPatternAnalysis.innerHTML = buildWinnerPatternAnalysisHtml(items, summary);

  if (!items.length) {
    refs.winnerTable.innerHTML = '<div class="panel empty-state">No winner database records match the current filters.</div>';
    return;
  }

  refs.winnerTable.innerHTML = `
    <div class="table-card table-wrap">
      <table class="database-table">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Sector</th>
            <th>Setup</th>
            <th>TF</th>
            <th>Moves</th>
            <th>Exp</th>
            <th>Bases</th>
            <th>Avg exp</th>
            <th>Exp len</th>
            <th>Major base</th>
            <th>Exp-base depth</th>
            <th>Total move</th>
            <th>Cycle days</th>
            <th>Dip</th>
            <th>Stage-4</th>
            <th>SuperMBI</th>
            <th>Image</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((entry) => {
            const meta = [];
            if (entry.breakoutDate) meta.push(formatDate(entry.breakoutDate));
            if (entry.effectiveInitialMove != null) meta.push(`Initial ${formatPercent(entry.effectiveInitialMove, 1)}`);
            if (entry.period) meta.push(entry.period);
            const patternLine = createWinnerPatternLine(entry);
            const details = [patternLine, entry.notes].filter(Boolean).join(' • ');
            return `
            <tr>
              <td>
                <div class="winner-stock">${escapeHtml(entry.stockName || '—')}</div>
                <div class="small-copy">${escapeHtml(meta.join(' • ') || 'No breakout date')}</div>
              </td>
              <td>${escapeHtml(entry.sector || '—')}</td>
              <td>${escapeHtml(entry.setup || '—')}</td>
              <td>${escapeHtml(entry.timeframe || '—')}</td>
              <td>${entry.pattern?.moveCount || '—'}</td>
              <td>${entry.pattern?.totalExpansions || '—'}</td>
              <td>${entry.pattern?.totalBases || '—'}</td>
              <td>${entry.pattern?.avgExpansion == null ? '—' : formatPercent(entry.pattern.avgExpansion, 1)}</td>
              <td>${entry.pattern?.avgExpansionLength == null ? '—' : entry.pattern.avgExpansionLength.toFixed(1)}</td>
              <td>${entry.pattern?.maxMajorBaseLength == null ? '—' : `${entry.pattern.maxMajorBaseLength} bars`}</td>
              <td>${entry.pattern?.maxExpansionBaseDepth == null ? '—' : formatPercent(entry.pattern.maxExpansionBaseDepth, 1)}</td>
              <td class="${entry.effectiveMove != null && entry.effectiveMove >= 20 ? 'positive' : ''}">${entry.effectiveMove == null ? '—' : formatPercent(entry.effectiveMove, 1)}</td>
              <td>${entry.pattern?.totalMoveDaysAuto == null ? '—' : entry.pattern.totalMoveDaysAuto.toFixed(1)}</td>
              <td>${entry.dipBeforeMove == null ? '—' : formatPercent(entry.dipBeforeMove, 1)}</td>
              <td>${entry.stage4Decline == null ? '—' : formatPercent(entry.stage4Decline, 1)}</td>
              <td>${entry.mbiScore ?? '—'}</td>
              <td>${entry.imageUrl ? (looksLikeViewableImageUrl(entry.imageUrl)
                ? `<a href="${escapeHtml(entry.imageUrl)}" target="_blank" rel="noreferrer"><img class="table-thumb" src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.stockName || 'Winner image')}" /></a>`
                : '<span class="small-copy">Saved link</span>') : '<span class="small-copy">No image</span>'}</td>
              <td><button class="btn btn-ghost" data-winner-action="edit" data-winner-id="${escapeHtml(entry.id)}">Edit</button></td>
            </tr>
            ${details ? `<tr><td colspan="18" class="small-copy">${escapeHtml(details)}</td></tr>` : ''}`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCharts() {
  chartManager.clearAll();
  if (!requireCloudAuth() || !state.trades.length) {
    return;
  }
  const method = state.settings.pnlMethod || PNL_METHODS.AVERAGE;
  const scopedTrades = getFilteredTradesRaw();

  if (state.ui.activeTab === 'dashboard') {
    const equity = buildEquityCurve(scopedTrades, method);
    const monthly = groupMonthlyPnl(scopedTrades, method);
    const strategies = groupPnlByField(scopedTrades, 'strategy', method).slice(0, 8);
    const weekdays = weekdayBreakdown(scopedTrades, method);
    const timeframes = groupPnlByField(scopedTrades, 'timeframe', method);
    const report = buildAiCoachReport(scopedTrades, method);

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

    chartManager.renderBar(
      'timeframe',
      $('#timeframeChart'),
      timeframes.map((item) => item.label || 'Unspecified'),
      timeframes.map((item) => item.value),
      'Timeframe P&L',
    );

    chartManager.renderBar(
      'dashboardMbi',
      $('#dashboardMbiChart'),
      report.series.mbiBuckets.map((item) => item.label),
      report.series.mbiBuckets.map((item) => item.pnl),
      'SuperMBI bucket P&L',
    );
    return;
  }

  if (state.ui.activeTab === 'coach') {
    const report = buildAiCoachReport(scopedTrades, method);
    chartManager.renderBar(
      'mbiBucket',
      $('#mbiBucketChart'),
      report.series.mbiBuckets.map((item) => item.label),
      report.series.mbiBuckets.map((item) => item.pnl),
      'SuperMBI bucket P&L',
    );
    chartManager.renderBar(
      'holdBucket',
      $('#holdBucketChart'),
      report.series.holdBuckets.map((item) => item.label),
      report.series.holdBuckets.map((item) => item.pnl),
      'Hold bucket P&L',
    );
    return;
  }

  if (state.ui.activeTab === 'mbi') {
    renderMbiHistoryVisuals();
  }
}

function renderAll() {
  updateUserSummary();
  renderTradeFilterSummary();
  renderJournalStats();
  renderStrategyFilter();
  renderWinnerFilterOptions();
  renderSummaryCards();
  renderRecentTrades();
  renderJournalTable();
  renderImportSummary();
  renderWinnerSummary();
  renderCoach();
  renderCharts();
  renderSettingsForm();
  refreshAssistants();
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
  $('#tradeTimeframe').value = TRADE_TIMEFRAMES.AUTO;
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
    $('#tradeTimeframe').value = trade.timeframe || TRADE_TIMEFRAMES.AUTO;
    $('#tradeStrategy').value = trade.strategy || '';
    $('#tradePlannedRisk').value = trade.plannedRisk || '';
    $('#tradePlannedStop').value = trade.plannedStop || '';
    $('#tradeMbiScore').value = trade.mbiScore ?? '';
    $('#tradeDipBeforeMove').value = trade.dipBeforeMove ?? '';
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
    timeframe: $('#tradeTimeframe').value,
    strategy: $('#tradeStrategy').value,
    plannedRisk: $('#tradePlannedRisk').value,
    plannedStop: $('#tradePlannedStop').value,
    dipBeforeMove: $('#tradeDipBeforeMove').value,
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
      makeMetricPreviewCard('Timeframe', metrics.timeframe),
      makeMetricPreviewCard('Avg entry', metrics.avgEntryPrice ? formatCurrency(metrics.avgEntryPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Avg exit', metrics.avgExitPrice ? formatCurrency(metrics.avgExitPrice, getCurrency()) : '—'),
      makeMetricPreviewCard('Open qty', String(metrics.openQty)),
      makeMetricPreviewCard('Move %', metrics.realizedPct != null ? formatPercent(metrics.realizedPct, 2) : '—', metrics.realizedPct >= 0 ? 'positive' : 'negative'),
      makeMetricPreviewCard('Dip before move', trade.dipBeforeMove != null ? formatPercent(trade.dipBeforeMove, 2) : '—'),
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
    timeframe: existing.timeframe || importedTrade.timeframe || TRADE_TIMEFRAMES.AUTO,
    dipBeforeMove: existing.dipBeforeMove ?? importedTrade.dipBeforeMove,
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
  const rows = toCsvRows(getFilteredTradesRaw(), state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadTextFile(`trademaster-journal-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

function exportJson() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    trades: state.trades,
    winners: state.winners,
  };
  downloadTextFile(`trademaster-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
}

function rowsToCsvText(rows = []) {
  if (!rows.length) return '';
  if (Array.isArray(rows[0])) {
    return rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
  const headers = Object.keys(rows[0] || {});
  const lines = [headers];
  rows.forEach((row) => {
    lines.push(headers.map((header) => row[header] ?? ''));
  });
  return lines
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function downloadCsvFromRows(fileName, rows = []) {
  downloadTextFile(fileName, rowsToCsvText(rows), 'text/csv');
}

function ensureXlsxLoaded() {
  if (!window.XLSX) {
    throw new Error('Excel export library did not load. Refresh the page and try again.');
  }
  return window.XLSX;
}

function buildTradeFillExportRows(trades = []) {
  const rows = [];
  trades.forEach((trade) => {
    (trade.fills || []).forEach((fill, index) => {
      rows.push({
        'Trade ID': trade.id,
        Symbol: trade.symbol,
        Direction: trade.direction,
        Timeframe: trade.timeframe,
        Strategy: trade.strategy || '',
        'Fill #': index + 1,
        'Executed At': fill.executedAt || '',
        Side: fill.side,
        Qty: fill.qty,
        Price: fill.price,
        Fees: fill.fees || 0,
        Note: fill.note || '',
      });
    });
  });
  return rows;
}

function exportJournalExcel() {
  const XLSX = ensureXlsxLoaded();
  const method = state.settings.pnlMethod || PNL_METHODS.AVERAGE;
  const items = getFilteredTradesWithMetrics();
  const raw = items.map(({ metrics, ...trade }) => trade);
  const summary = summarizeJournal(raw, method);
  const workbook = XLSX.utils.book_new();
  const summarySheetRows = [
    ['Metric', 'Value'],
    ['Trade Count', summary.tradeCount],
    ['Closed Trades', summary.closedTradeCount],
    ['Open Trades', summary.openTradeCount],
    ['Win %', round(summary.winRate, 2)],
    ['Loss %', round(summary.lossRate, 2)],
    ['Win Size', round(summary.grossProfit || 0)],
    ['Loss Size', round(Math.abs(summary.grossLossAbs || 0))],
    ['Avg Win Size', round(summary.avgWin || 0)],
    ['Avg Loss Size', round(Math.abs(summary.avgLossAbs || 0))],
    ['Avg Win Holding Minutes', round(summary.avgWinHoldMinutes || 0, 2)],
    ['Avg Loss Holding Minutes', round(summary.avgLossHoldMinutes || 0, 2)],
    ['Avg Dip Before Move %', summary.avgDipBeforeMove ?? ''],
    ['Avg Winner Dip %', summary.avgWinDipBeforeMove ?? ''],
    ['Avg Loser Dip %', summary.avgLossDipBeforeMove ?? ''],
    ['Winner Dip 80 %', summary.winnerDipP80 ?? ''],
    ['Open Risk Now', round(summary.currentOpenRisk || 0)],
    ['Peak Open Risk', round(summary.peakOpenRisk || 0)],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summarySheetRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(toCsvRows(raw, method)), 'Trades');
  const fillRows = buildTradeFillExportRows(raw);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fillRows.length ? fillRows : [{ Info: 'No fills in current filtered journal scope.' }]), 'Fills');
  XLSX.writeFile(workbook, `trademaster-journal-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportWinnerCsv() {
  const exportData = buildWinnerExportData(getRenderableWinners());
  downloadCsvFromRows(`trademaster-winners-${new Date().toISOString().slice(0, 10)}.csv`, exportData.winners);
}

function exportWinnerExcel() {
  const XLSX = ensureXlsxLoaded();
  const items = getRenderableWinners();
  const summary = summarizeWinnerEntries(items);
  const exportData = buildWinnerExportData(items);
  const workbook = XLSX.utils.book_new();
  const summaryRows = [
    ['Metric', 'Value'],
    ['Records', summary.count],
    ['Unique Stocks', summary.uniqueStocks],
    ['Avg Total Move %', summary.avgMove ?? ''],
    ['Avg Initial Move %', summary.avgInitialMove ?? ''],
    ['Avg Dip Before Move %', summary.avgDipBeforeMove ?? ''],
    ['Winner Dip 80 %', summary.dipP80 ?? ''],
    ['Avg Cycle Days', summary.avgMoveDays ?? ''],
    ['Avg Moves / Stock', summary.avgMoveCount ?? ''],
    ['Avg Expansions / Stock', summary.avgExpansionCount ?? ''],
    ['Avg Bases / Stock', summary.avgBaseCount ?? ''],
    ['Avg Expansion %', summary.avgExpansion ?? ''],
    ['Avg Best Expansion %', summary.avgMaxExpansion ?? ''],
    ['Avg Expansion Length', summary.avgExpansionLength ?? ''],
    ['Avg Major Base Length', summary.avgMajorBaseLength ?? ''],
    ['Major Base Depth 80 %', summary.majorBaseDepthP80 ?? ''],
    ['Avg Expansion Base Length', summary.avgExpansionBaseLength ?? ''],
    ['Expansion Base Depth 80 %', summary.expansionBaseDepthP80 ?? ''],
    ['Avg Stage 4 Decline %', summary.avgStage4Decline ?? ''],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData.winners.length ? exportData.winners : [{ Info: 'No filtered winner records.' }]), 'Winners');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData.moves.length ? exportData.moves : [{ Info: 'No move rows in current filter.' }]), 'Moves');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData.expansions.length ? exportData.expansions : [{ Info: 'No expansion rows in current filter.' }]), 'Expansions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData.bases.length ? exportData.bases : [{ Info: 'No base rows in current filter.' }]), 'Bases');
  XLSX.writeFile(workbook, `trademaster-winner-db-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function renderAssistantResult(target, result) {
  if (!target) return;
  if (!result) {
    target.textContent = 'No assistant answer yet.';
    return;
  }
  if (!result.ok) {
    target.innerHTML = `
      <div class="text-strong">${escapeHtml(result.title || 'Could not answer')}</div>
      ${(result.details || []).length ? `<ul class="deploy-list compact-top">${result.details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    `;
    return;
  }
  target.innerHTML = `
    <div class="text-strong">${escapeHtml(result.title || 'Answer')}</div>
    <div class="metric-value ${result.tone === 'positive' ? 'positive' : result.tone === 'negative' ? 'negative' : ''}">${escapeHtml(result.answer || '—')}</div>
    ${(result.details || []).length ? `<ul class="deploy-list compact-top">${result.details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  `;
}

function runJournalAssistant() {
  if (!refs.journalAssistantAnswer) return;
  const question = refs.journalAssistantInput?.value?.trim() || '';
  if (!question) {
    refs.journalAssistantAnswer.textContent = 'Uses the current filtered journal scope.';
    return;
  }
  const items = getFilteredTradesWithMetrics();
  const raw = items.map(({ metrics, ...trade }) => trade);
  const summary = summarizeJournal(raw, state.settings.pnlMethod || PNL_METHODS.AVERAGE);
  const result = answerJournalQuestion(question, items, summary, { currency: getCurrency() });
  renderAssistantResult(refs.journalAssistantAnswer, result);
}

function runWinnerAssistant() {
  if (!refs.winnerAssistantAnswer) return;
  const question = refs.winnerAssistantInput?.value?.trim() || '';
  if (!question) {
    refs.winnerAssistantAnswer.textContent = 'Uses the current filtered Winner DB scope.';
    return;
  }
  const items = getRenderableWinners();
  const summary = summarizeWinnerEntries(items);
  const flat = flattenWinnerObservations(items);
  const result = answerWinnerQuestion(question, items, summary, flat, { currency: getCurrency() });
  renderAssistantResult(refs.winnerAssistantAnswer, result);
}

function refreshAssistants() {
  runJournalAssistant();
  runWinnerAssistant();
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

const WINNER_DEFAULT_EXPANSIONS = 1;

function emptyWinnerBaseForm() {
  return {
    length: '',
    depth: '',
    tags: '',
    notes: '',
  };
}

function cloneWinnerBaseForForm(base = {}) {
  return {
    length: base?.length ?? '',
    depth: base?.depth ?? '',
    tags: stringifyTags(base?.tags || []),
    notes: base?.notes || '',
  };
}

function emptyWinnerExpansionForm() {
  return {
    id: uid('exp'),
    pct: '',
    length: '',
    tags: '',
    notes: '',
    base: emptyWinnerBaseForm(),
  };
}

function cloneWinnerExpansionForForm(expansion = {}) {
  return {
    id: expansion?.id || uid('exp'),
    pct: expansion?.pct ?? '',
    length: expansion?.length ?? '',
    tags: stringifyTags(expansion?.tags || []),
    notes: expansion?.notes || '',
    base: cloneWinnerBaseForForm(expansion?.base || {}),
  };
}

function emptyWinnerMoveForm() {
  return {
    id: uid('move'),
    movePct: '',
    moveDays: '',
    tags: '',
    notes: '',
    preMoveBase: emptyWinnerBaseForm(),
    expansions: Array.from({ length: WINNER_DEFAULT_EXPANSIONS }, () => emptyWinnerExpansionForm()),
  };
}

function cloneWinnerMoveForForm(rawMove = {}) {
  const source = normalizeWinnerMoves([rawMove])[0] || rawMove || {};
  const expansions = (source.expansions || []).map(cloneWinnerExpansionForForm);
  return {
    id: source.id || uid('move'),
    movePct: source.movePct ?? '',
    moveDays: source.moveDays ?? '',
    tags: stringifyTags(source.tags || []),
    notes: source.notes || '',
    preMoveBase: cloneWinnerBaseForForm(source.preMoveBase || {}),
    expansions: expansions.length ? expansions : Array.from({ length: WINNER_DEFAULT_EXPANSIONS }, () => emptyWinnerExpansionForm()),
  };
}

function readWinnerExpansionCard(card) {
  return {
    id: card?.dataset.expansionId || uid('exp'),
    pct: card?.querySelector('[data-expansion-field="pct"]')?.value ?? '',
    length: card?.querySelector('[data-expansion-field="length"]')?.value ?? '',
    tags: card?.querySelector('[data-expansion-field="tags"]')?.value ?? '',
    notes: card?.querySelector('[data-expansion-field="notes"]')?.value ?? '',
    base: {
      length: card?.querySelector('[data-expansion-base-field="length"]')?.value ?? '',
      depth: card?.querySelector('[data-expansion-base-field="depth"]')?.value ?? '',
      tags: card?.querySelector('[data-expansion-base-field="tags"]')?.value ?? '',
      notes: card?.querySelector('[data-expansion-base-field="notes"]')?.value ?? '',
    },
  };
}

function readWinnerMoveCard(card) {
  if (!card) return emptyWinnerMoveForm();
  return {
    id: card.dataset.moveId || uid('move'),
    movePct: card.querySelector('[data-move-field="movePct"]')?.value ?? '',
    moveDays: card.querySelector('[data-move-field="moveDays"]')?.value ?? '',
    tags: card.querySelector('[data-move-field="tags"]')?.value ?? '',
    notes: card.querySelector('[data-move-field="notes"]')?.value ?? '',
    preMoveBase: {
      length: card.querySelector('[data-prebase-field="length"]')?.value ?? '',
      depth: card.querySelector('[data-prebase-field="depth"]')?.value ?? '',
      tags: card.querySelector('[data-prebase-field="tags"]')?.value ?? '',
      notes: card.querySelector('[data-prebase-field="notes"]')?.value ?? '',
    },
    expansions: [...card.querySelectorAll('[data-expansion-card]')].map(readWinnerExpansionCard),
  };
}

function readWinnerMovesBuilderRaw() {
  if (!refs.winnerMovesBuilder) return [];
  return [...refs.winnerMovesBuilder.querySelectorAll('[data-move-card]')].map(readWinnerMoveCard);
}

function readWinnerMovesBuilder() {
  return normalizeWinnerMoves(readWinnerMovesBuilderRaw());
}

function winnerMajorBaseLabel(moveIndex) {
  return moveIndex === 0 ? 'Base before move' : `B${moveIndex}`;
}

function winnerExpansionBaseLabel(moveIndex, expansionIndex) {
  return moveIndex === 0 ? `E${expansionIndex + 1}B` : `E${expansionIndex + 1}B${moveIndex}`;
}

function winnerMoveSummaryText(summary = {}) {
  if (!summary.moveCount) return 'Move is empty. Add any move %, days, expansion %, base depth, tags, or notes if you want this pattern included in analysis.';
  const parts = [];
  if (summary.totalMovePctAuto != null) parts.push(`auto move ${formatPercent(summary.totalMovePctAuto, 1)}`);
  if (summary.totalMoveDaysAuto != null) parts.push(`auto days ${summary.totalMoveDaysAuto.toFixed(1)}`);
  if (summary.totalExpansions) parts.push(`${summary.totalExpansions} expansion${summary.totalExpansions === 1 ? '' : 's'}`);
  if (summary.totalMajorBases) parts.push(`${summary.totalMajorBases} major base`);
  if (summary.totalExpansionBases) parts.push(`${summary.totalExpansionBases} expansion-base${summary.totalExpansionBases === 1 ? '' : 's'}`);
  if (summary.avgExpansion != null) parts.push(`avg exp ${formatPercent(summary.avgExpansion, 1)}`);
  if (summary.maxExpansion != null) parts.push(`best exp ${formatPercent(summary.maxExpansion, 1)}`);
  if (summary.avgExpansionLength != null) parts.push(`avg exp len ${summary.avgExpansionLength.toFixed(1)}`);
  if (summary.maxMajorBaseLength != null) parts.push(`major base ${summary.maxMajorBaseLength} bars`);
  if (summary.maxExpansionBaseDepth != null) parts.push(`deepest exp-base ${formatPercent(summary.maxExpansionBaseDepth, 1)}`);
  return parts.join(' • ');
}

function winnerExpansionCardHtml(rawExpansion, expansionIndex, moveIndex) {
  const expansion = cloneWinnerExpansionForForm(rawExpansion);
  const baseLabel = winnerExpansionBaseLabel(moveIndex, expansionIndex);
  return `
    <div class="panel compact-top" data-expansion-card data-expansion-id="${escapeHtml(expansion.id)}">
      <div class="section-row">
        <div>
          <div class="panel-title">E${expansionIndex + 1}</div>
          <div class="small-copy">Track this expansion leg inside Move ${moveIndex + 1}, then map the base that formed after it.</div>
        </div>
        <button type="button" class="btn btn-ghost" data-move-builder-action="remove-expansion" data-expansion-id="${escapeHtml(expansion.id)}">Remove</button>
      </div>
      <div class="form-grid form-grid-4 compact-top">
        <label class="field"><span>E${expansionIndex + 1} %</span><input data-expansion-field="pct" type="number" step="0.1" placeholder="8" value="${escapeHtml(String(expansion.pct ?? ''))}" /></label>
        <label class="field"><span>E${expansionIndex + 1} length</span><input data-expansion-field="length" type="number" step="0.1" placeholder="6" value="${escapeHtml(String(expansion.length ?? ''))}" /></label>
        <label class="field"><span>E${expansionIndex + 1} tags</span><input data-expansion-field="tags" type="text" placeholder="ignition, volume" value="${escapeHtml(expansion.tags || '')}" /></label>
        <label class="field"><span>E${expansionIndex + 1} notes</span><input data-expansion-field="notes" type="text" placeholder="Gap, climax, clean trend" value="${escapeHtml(expansion.notes || '')}" /></label>
      </div>
      <div class="panel compact-top">
        <div class="panel-title">${baseLabel}</div>
        <div class="small-copy">Optional base after this expansion. Use it to study pullback depth, length, tags, and context before the next leg.</div>
        <div class="form-grid form-grid-4 compact-top">
          <label class="field"><span>${baseLabel} length</span><input data-expansion-base-field="length" type="number" step="0.1" placeholder="10" value="${escapeHtml(String(expansion.base.length ?? ''))}" /></label>
          <label class="field"><span>${baseLabel} depth %</span><input data-expansion-base-field="depth" type="number" step="0.1" placeholder="9" value="${escapeHtml(String(expansion.base.depth ?? ''))}" /></label>
          <label class="field"><span>${baseLabel} tags</span><input data-expansion-base-field="tags" type="text" placeholder="tight, shallow, low-volume" value="${escapeHtml(expansion.base.tags || '')}" /></label>
          <label class="field"><span>${baseLabel} notes</span><input data-expansion-base-field="notes" type="text" placeholder="Undercut, wedge, handle" value="${escapeHtml(expansion.base.notes || '')}" /></label>
        </div>
      </div>
    </div>
  `;
}

function winnerMoveCardHtml(rawMove, moveIndex) {
  const move = cloneWinnerMoveForForm(rawMove);
  const summary = summarizeWinnerPattern([move]);
  const majorBaseLabel = winnerMajorBaseLabel(moveIndex);
  return `
    <div class="panel compact-top" data-move-card data-move-id="${escapeHtml(move.id)}">
      <div class="section-row">
        <div>
          <div class="panel-title">Move ${moveIndex + 1}</div>
          <div class="small-copy">Every move can have multiple expansions, each expansion can have its own base, and Move ${moveIndex + 1} can also reference the major base that launched it.</div>
        </div>
        <button type="button" class="btn btn-ghost" data-move-builder-action="remove-move" data-move-id="${escapeHtml(move.id)}">Remove</button>
      </div>
      <div class="form-grid form-grid-4 compact-top">
        <label class="field"><span>Move ${moveIndex + 1} %</span><input data-move-field="movePct" type="number" step="0.1" placeholder="Auto if blank" value="${escapeHtml(String(move.movePct ?? ''))}" /></label>
        <label class="field"><span>Move ${moveIndex + 1} days</span><input data-move-field="moveDays" type="number" step="0.1" placeholder="Auto if blank" value="${escapeHtml(String(move.moveDays ?? ''))}" /></label>
        <label class="field"><span>Move ${moveIndex + 1} tags</span><input data-move-field="tags" type="text" placeholder="climactic, persistent, high RS" value="${escapeHtml(move.tags || '')}" /></label>
        <label class="field"><span>Move ${moveIndex + 1} notes</span><input data-move-field="notes" type="text" placeholder="What defined this leg?" value="${escapeHtml(move.notes || '')}" /></label>
      </div>
      <div class="panel compact-top">
        <div class="panel-title">${majorBaseLabel}</div>
        <div class="small-copy">Major base that existed before this move. For Move 2 this becomes B1, for Move 3 it becomes B2, and so on.</div>
        <div class="form-grid form-grid-4 compact-top">
          <label class="field"><span>${majorBaseLabel} length</span><input data-prebase-field="length" type="number" step="0.1" placeholder="20" value="${escapeHtml(String(move.preMoveBase.length ?? ''))}" /></label>
          <label class="field"><span>${majorBaseLabel} depth %</span><input data-prebase-field="depth" type="number" step="0.1" placeholder="14" value="${escapeHtml(String(move.preMoveBase.depth ?? ''))}" /></label>
          <label class="field"><span>${majorBaseLabel} tags</span><input data-prebase-field="tags" type="text" placeholder="stage-2, tight, dry-up" value="${escapeHtml(move.preMoveBase.tags || '')}" /></label>
          <label class="field"><span>${majorBaseLabel} notes</span><input data-prebase-field="notes" type="text" placeholder="Cup-with-handle, IPO base, re-tighten" value="${escapeHtml(move.preMoveBase.notes || '')}" /></label>
        </div>
      </div>
      <div class="section-row compact-top">
        <div>
          <div class="panel-title">Expansions inside Move ${moveIndex + 1}</div>
          <div class="small-copy">Add E1, E2, E3 and beyond. Every expansion can have its own post-expansion base like ${winnerExpansionBaseLabel(moveIndex, 0)}.</div>
        </div>
        <button type="button" class="btn btn-ghost" data-move-builder-action="add-expansion" data-move-id="${escapeHtml(move.id)}">+ Add expansion</button>
      </div>
      <div class="compact-top">
        ${move.expansions.length ? move.expansions.map((expansion, expansionIndex) => winnerExpansionCardHtml(expansion, expansionIndex, moveIndex)).join('') : '<div class="panel-note compact-top">No expansions added yet for this move.</div>'}
      </div>
      <div class="panel-note compact-top">${escapeHtml(winnerMoveSummaryText(summary))}</div>
    </div>
  `;
}

function renderWinnerMovesSummary() {
  if (!refs.winnerMovesSummary) return;
  const summary = summarizeWinnerPattern(readWinnerMovesBuilderRaw());
  if (!summary.moveCount) {
    refs.winnerMovesSummary.innerHTML = 'No cycle map yet. Add Move 1, then as many expansions and post-expansion bases as you want. Every field is optional.';
    return;
  }
  const parts = [
    `${summary.moveCount} move${summary.moveCount === 1 ? '' : 's'}`,
    `${summary.totalExpansions} expansion${summary.totalExpansions === 1 ? '' : 's'}`,
    `${summary.totalBases} base${summary.totalBases === 1 ? '' : 's'}`,
  ];
  if (summary.totalMovePctAuto != null) parts.push(`auto total move ${formatPercent(summary.totalMovePctAuto, 1)}`);
  if (summary.totalMoveDaysAuto != null) parts.push(`auto cycle days ${summary.totalMoveDaysAuto.toFixed(1)}`);
  if (summary.avgExpansion != null) parts.push(`avg expansion ${formatPercent(summary.avgExpansion, 1)}`);
  if (summary.avgExpansionLength != null) parts.push(`avg expansion length ${summary.avgExpansionLength.toFixed(1)}`);
  if (summary.maxMajorBaseLength != null) parts.push(`biggest major base ${summary.maxMajorBaseLength} bars`);
  if (summary.maxExpansionBaseDepth != null) parts.push(`deepest exp-base ${formatPercent(summary.maxExpansionBaseDepth, 1)}`);
  refs.winnerMovesSummary.innerHTML = `<div class="text-strong">Cycle map auto-summary</div><div>${escapeHtml(parts.join(' • '))}</div>`;
}

function renderWinnerMovesBuilder(moves = []) {
  if (!refs.winnerMovesBuilder) return;
  const items = (Array.isArray(moves) ? moves : []).map(cloneWinnerMoveForForm);
  refs.winnerMovesBuilder.innerHTML = items.length
    ? items.map((move, index) => winnerMoveCardHtml(move, index)).join('')
    : '<div class="panel-note compact-top">No move legs added yet. Use <strong>Add move</strong> to map the full bull cycle: moves, expansions, major bases, and expansion bases. Every field is optional.</div>';
  renderWinnerMovesSummary();
}

function handleWinnerMovesBuilderClick(event) {
  const button = event.target.closest('[data-move-builder-action]');
  if (!button) return;
  const action = button.dataset.moveBuilderAction;
  const moveId = button.dataset.moveId;
  const expansionId = button.dataset.expansionId;
  const items = readWinnerMovesBuilderRaw();

  if (action === 'remove-move') {
    renderWinnerMovesBuilder(items.filter((move) => move.id !== moveId));
    return;
  }

  if (action === 'add-expansion') {
    const updated = items.map((move) => (move.id === moveId
      ? { ...move, expansions: [...(move.expansions || []), emptyWinnerExpansionForm()] }
      : move));
    renderWinnerMovesBuilder(updated);
    return;
  }

  if (action === 'remove-expansion') {
    const updated = items.map((move) => ({
      ...move,
      expansions: (move.expansions || []).filter((expansion) => expansion.id !== expansionId),
    }));
    renderWinnerMovesBuilder(updated);
  }
}

function createWinnerPatternLine(entry = {}) {
  if (!(entry.pattern?.moveCount > 0)) return '';
  const parts = [];
  parts.push(`${entry.pattern.moveCount} move${entry.pattern.moveCount === 1 ? '' : 's'}`);
  if (entry.pattern.totalExpansions) parts.push(`${entry.pattern.totalExpansions} expansions`);
  if (entry.pattern.totalMajorBases) parts.push(`${entry.pattern.totalMajorBases} major bases`);
  if (entry.pattern.totalExpansionBases) parts.push(`${entry.pattern.totalExpansionBases} expansion-bases`);
  if (entry.pattern.avgExpansion != null) parts.push(`avg expansion ${formatPercent(entry.pattern.avgExpansion, 1)}`);
  if (entry.pattern.avgExpansionLength != null) parts.push(`avg exp length ${entry.pattern.avgExpansionLength.toFixed(1)}`);
  if (entry.pattern.maxMajorBaseLength != null) parts.push(`biggest major base ${entry.pattern.maxMajorBaseLength} bars`);
  if (entry.pattern.maxExpansionBaseDepth != null) parts.push(`deepest exp-base ${formatPercent(entry.pattern.maxExpansionBaseDepth, 1)}`);
  if (entry.pattern.totalMovePctAuto != null) parts.push(`auto move ${formatPercent(entry.pattern.totalMovePctAuto, 1)}`);
  if (entry.pattern.totalMoveDaysAuto != null) parts.push(`auto cycle days ${entry.pattern.totalMoveDaysAuto.toFixed(1)}`);
  return parts.join(' • ');
}

function clearWinnerForm() {
  refs.winnerForm.reset();
  $('#winnerId').value = '';
  $('#winnerImageStoragePath').value = '';
  if ($('#winnerTimeframe')) $('#winnerTimeframe').value = 'SWING';
  refs.deleteWinnerBtn.classList.add('hidden');
  refs.winnerModalTitle.textContent = 'New winner';
  clearWinnerImageDraft();
  refs.winnerImagePreview.innerHTML = winnerImageEmptyState();
  renderWinnerMovesBuilder([]);
}

function syncWinnerImagePreview() {
  const draft = state.ui.winnerImageDraft?.prepared;
  const url = $('#winnerImageUrl')?.value?.trim();
  const storagePath = $('#winnerImageStoragePath')?.value?.trim();

  if (draft) {
    refs.winnerImagePreview.innerHTML = `
      <div class="preview-wrap">
        <img class="modal-thumb" src="${escapeHtml(draft.previewUrl)}" alt="Winner screenshot preview" />
        <div class="preview-meta small-copy">
          <div class="text-strong">Selected screenshot • uploads when you save</div>
          <div>${escapeHtml(formatBytes(draft.sizeBytes))} • ${escapeHtml(String(draft.width))}×${escapeHtml(String(draft.height))} • ${escapeHtml(draft.contentType)}</div>
          <div>Compressed from ${escapeHtml(formatBytes(draft.originalSizeBytes))} to keep storage usage low.</div>
        </div>
      </div>
    `;
    return;
  }

  if (!url) {
    refs.winnerImagePreview.innerHTML = winnerImageEmptyState();
    return;
  }

  if (!looksLikeViewableImageUrl(url)) {
    refs.winnerImagePreview.innerHTML = `
      <div class="preview-meta small-copy">
        <div class="text-strong">Saved image reference</div>
        <div>The value will be saved, but it is not a direct browser-viewable image URL.</div>
      </div>
    `;
    return;
  }

  refs.winnerImagePreview.innerHTML = `
    <div class="preview-wrap">
      <img class="modal-thumb" src="${escapeHtml(url)}" alt="Winner preview" />
      <div class="preview-meta small-copy">
        <div class="text-strong">${storagePath ? 'Stored screenshot' : 'External image URL'}</div>
        <div>${storagePath ? 'This image is stored in Firebase Storage for this winner record.' : 'This image is being referenced from the URL you pasted.'}</div>
      </div>
    </div>
  `;
}

async function handleWinnerImageFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!canUploadWinnerImages()) {
    event.target.value = '';
    showToast('Screenshot uploads need cloud mode, Google sign-in, and Firebase Storage configured.', 'error');
    return;
  }
  try {
    clearWinnerImageDraft();
    showToast('Compressing screenshot…');
    const prepared = await prepareImageForUpload(file, { maxDimension: 1600, quality: 0.82 });
    state.ui.winnerImageDraft = { prepared };
    syncWinnerImagePreview();
    showToast(`Screenshot ready • ${formatBytes(prepared.sizeBytes)}`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not prepare the screenshot.', 'error');
    clearWinnerImageDraft();
    syncWinnerImagePreview();
  }
}

function clearWinnerImageSelection() {
  clearWinnerImageDraft();
  $('#winnerImageUrl').value = '';
  $('#winnerImageStoragePath').value = '';
  syncWinnerImagePreview();
}

function openWinnerModal(entry = null) {
  clearWinnerForm();
  if (entry) {
    $('#winnerId').value = entry.id || '';
    $('#winnerStockName').value = entry.stockName || '';
    $('#winnerSector').value = entry.sector || '';
    $('#winnerType').value = entry.type || '';
    $('#winnerSetup').value = entry.setup || '';
    $('#winnerTimeframe').value = entry.timeframe || 'SWING';
    $('#winnerBreakoutDate').value = entry.breakoutDate || '';
    $('#winnerCircuits').value = entry.circuits ?? '';
    $('#winnerPeriod').value = entry.period || '';
    $('#winnerMbiScore').value = entry.mbiScore ?? '';
    $('#winnerInitialMove').value = entry.initialMove ?? '';
    $('#winnerBaseLength').value = entry.baseLength ?? '';
    $('#winnerMove').value = entry.move ?? '';
    $('#winnerDipBeforeMove').value = entry.dipBeforeMove ?? '';
    $('#winnerStage4Decline').value = entry.stage4Decline ?? '';
    $('#winnerImageUrl').value = entry.imageUrl || '';
    $('#winnerImageStoragePath').value = entry.imageStoragePath || '';
    $('#winnerTags').value = stringifyTags(entry.tags || []);
    $('#winnerNotes').value = entry.notes || '';
    refs.winnerModalTitle.textContent = `Edit ${entry.stockName || 'winner'}`;
    refs.deleteWinnerBtn.classList.remove('hidden');
    renderWinnerMovesBuilder(entry.moves || []);
    syncWinnerImagePreview();
  } else {
    renderWinnerMovesBuilder([]);
  }
  refs.winnerModal.classList.remove('hidden');
  refs.winnerModal.setAttribute('aria-hidden', 'false');
}

function closeWinnerModal() {
  clearWinnerImageDraft();
  refs.winnerModal.classList.add('hidden');
  refs.winnerModal.setAttribute('aria-hidden', 'true');
}

function readWinnerForm() {
  const existing = state.winners.find((item) => item.id === ($('#winnerId').value || ''));
  return normalizeWinnerPayload({
    id: $('#winnerId').value || uid('winner'),
    stockName: $('#winnerStockName').value,
    sector: $('#winnerSector').value,
    type: $('#winnerType').value,
    setup: $('#winnerSetup').value,
    timeframe: $('#winnerTimeframe').value,
    breakoutDate: $('#winnerBreakoutDate').value,
    circuits: $('#winnerCircuits').value,
    period: $('#winnerPeriod').value,
    mbiScore: $('#winnerMbiScore').value,
    initialMove: $('#winnerInitialMove').value,
    baseLength: $('#winnerBaseLength').value,
    move: $('#winnerMove').value,
    dipBeforeMove: $('#winnerDipBeforeMove').value,
    stage4Decline: $('#winnerStage4Decline').value,
    imageUrl: $('#winnerImageUrl').value,
    imageStoragePath: $('#winnerImageStoragePath').value,
    imageBytes: existing?.imageBytes ?? null,
    imageContentType: existing?.imageContentType || '',
    imageWidth: existing?.imageWidth ?? null,
    imageHeight: existing?.imageHeight ?? null,
    tags: parseTags($('#winnerTags').value),
    notes: $('#winnerNotes').value,
    moves: readWinnerMovesBuilder(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function handleDeleteWinner(entryId) {
  const entry = state.winners.find((item) => item.id === entryId);
  if (!entry) return;
  const confirmed = window.confirm(`Delete winner record ${entry.stockName || 'this entry'}?`);
  if (!confirmed) return;
  try {
    if (entry.imageStoragePath) {
      await state.storage.deleteWinnerImage(entry.imageStoragePath);
    }
    await state.storage.deleteWinner(entryId);
    showToast('Winner record deleted.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not delete winner record.', 'error');
  }
}

function handleWinnerTableClick(event) {
  const button = event.target.closest('[data-winner-action]');
  if (!button) return;
  const entryId = button.dataset.winnerId;
  const entry = state.winners.find((item) => item.id === entryId);
  if (!entry) return;
  if (button.dataset.winnerAction === 'edit') openWinnerModal(entry);
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

  syncRiskPresetChips();
  $('#calcQty').textContent = String(solver.qty || 0);
  $('#calcValue').textContent = formatCurrency(solver.totalValue || 0, getCurrency());
  $('#calcActualRisk').textContent = formatCurrency(solver.actualRisk || 0, getCurrency());
  $('#calcPositionPercent').textContent = formatPercent(solver.positionPercent || 0, 1);
  $('#calcRiskCapitalPercent').textContent = formatPercent(solver.riskOfCapital || 0, 2);
  $('#calcTrailLocked').textContent = formatCurrency(lockedPnl(solver.entry, $('#calcTrailPrice').value, solver.qty, solver.long), getCurrency());
  $('#calcDirectionPill').className = cn('pill', solver.entry ? (solver.long ? 'pill-green' : 'pill-red') : 'pill-muted');
  $('#calcDirectionPill').textContent = solver.entry ? (solver.long ? 'Long setup' : 'Short setup') : 'Waiting for setup';
  $('#calcHint').textContent = $('#calcLastEdited').value === 'positionSize'
    ? 'Calculator is currently solving from position size.'
    : $('#calcLastEdited').value === 'riskAmount'
      ? 'Calculator is currently solving from risk amount.'
      : 'Calculator is solving from entry + stop using account risk.';

  if (document.activeElement !== $('#calcSlPrice')) $('#calcSlPrice').value = solver.slPrice || '';
  if (document.activeElement !== $('#calcSlPercent')) $('#calcSlPercent').value = solver.slPercent || '';
  if (document.activeElement !== $('#calcPositionSize')) $('#calcPositionSize').value = solver.positionSize || '';
  if (document.activeElement !== $('#calcRiskAmount')) $('#calcRiskAmount').value = solver.riskAmount || '';

  const target = projectTarget({
    entry: solver.entry,
    slPrice: solver.slPrice,
    qty: solver.qty,
    targetR: $('#targetR').value,
    targetPercent: $('#targetPercent').value,
    exitPrice: $('#targetExitPrice').value,
  });
  if (document.activeElement !== $('#targetExitPrice')) $('#targetExitPrice').value = target.exitPrice || '';
  if (document.activeElement !== $('#targetR')) $('#targetR').value = target.targetR || '';
  if (document.activeElement !== $('#targetPercent')) $('#targetPercent').value = target.targetPercent || '';
  $('#targetPnl').textContent = formatCurrency(target.pnl || 0, getCurrency());
  $('#targetPnl').className = cn('metric-value', (target.pnl || 0) >= 0 ? 'positive' : 'negative');
  $('#targetNetPnl').textContent = formatCurrency(target.charges.net || 0, getCurrency());
  $('#targetNetPnl').className = cn('metric-value', (target.charges.net || 0) >= 0 ? 'positive' : 'negative');
  $('#chargesBrokerage').textContent = formatCurrency(target.charges.brokerage || 0, getCurrency());
  $('#chargesStt').textContent = formatCurrency(target.charges.stt || 0, getCurrency());
  $('#chargesOther').textContent = formatCurrency(target.charges.other || 0, getCurrency());
  $('#chargesTotal').textContent = formatCurrency(target.charges.total || 0, getCurrency());
}

function renderSignalCards(items, emptyText, tone = 'neutral') {
  if (!items?.length) return `<div class="signal ${tone}">${escapeHtml(emptyText)}</div>`;
  return items.map((item) => `
      <div class="signal ${escapeHtml(item.level || 'neutral')}">
        ${item.label ? `<strong>${escapeHtml(item.label)}:</strong> ` : ''}${escapeHtml(item.text || '')}
      </div>
    `).join('');
}

function formatMbiInputValue(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const rounded = round(Number(value), digits);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function fillMbiInputsFromRow(row) {
  if (!row) return;
  $('#mbiA20').value = formatMbiInputValue(row.a20);
  $('#mbiA50').value = formatMbiInputValue(row.a50);
  $('#mbiA200').value = formatMbiInputValue(row.a200);
  $('#mbiNb').value = formatMbiInputValue(row.nb);
  $('#mbiWh').value = formatMbiInputValue(row.wh);
  $('#mbiWl').value = formatMbiInputValue(row.wl);
  $('#mbiBosf').value = formatMbiInputValue(row.bosf);
  $('#mbiUhlh').value = formatMbiInputValue(row.uhlh);
  $('#mbiVol').value = formatMbiInputValue(row.vol);
  $('#mbiAdv').value = formatMbiInputValue(row.adv);
  $('#mbiNhl').value = formatMbiInputValue(row.nhl);
  $('#mbiBd').value = formatMbiInputValue(row.bd);
  $('#mbiAdv3Pts').value = formatMbiInputValue(row.adv3Pts);
  $('#mbiNewHigh3Pts').value = formatMbiInputValue(row.newHigh3Pts);
}

function renderMbiHistoryVisuals() {
  const rows = state.ui.mbiHistoryRows || [];
  if (!refs.mbiHistoryTable) return;

  if (!rows.length) {
    refs.mbiHistoryMeta.textContent = 'No Dashboard history imported yet. You can still type the fields manually below.';
    refs.mbiHistoryTable.innerHTML = 'Import Dashboard A:AG rows to see recent CurrentScore and SuperMBI history.';
    refs.mbiHistoryTable.className = 'table-wrap empty-state';
    chartManager.renderLine('mbiHistory', $('#mbiHistoryChart'), [], [], 'SuperMBI history');
    return;
  }

  const summary = state.ui.lastMbiImportSummary || {};
  refs.mbiHistoryMeta.textContent = `${summary.rowCount || rows.length} Dashboard rows parsed${summary.latestDate ? ` • latest ${summary.latestDate}` : ''}${summary.readyRowCount ? ` • ${summary.readyRowCount} rows had full SuperMBI output` : ''}. Latest imported row auto-filled the manual fields.`;

  const displayRows = rows.slice(-10).reverse();
  refs.mbiHistoryTable.className = 'table-wrap';
  refs.mbiHistoryTable.innerHTML = `
    <table class="guide-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>CurrentScore</th>
          <th>Adv3 pts</th>
          <th>NewHigh3 pts</th>
          <th>SuperMBI</th>
          <th>Zone</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.date || '—')}</td>
            <td>${row.currentScore != null ? round(row.currentScore, 0) : '—'}</td>
            <td>${row.adv3Pts != null ? round(row.adv3Pts, 2).toFixed(2) : '—'}</td>
            <td>${row.newHigh3Pts != null ? round(row.newHigh3Pts, 2).toFixed(2) : '—'}</td>
            <td>${row.superMbi != null ? round(row.superMbi, 2).toFixed(2) : '—'}</td>
            <td>${escapeHtml(row.zone || 'Need 3 rows')}</td>
            <td>${escapeHtml(row.action || 'Need 3 rows')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const chartRows = rows.filter((row) => row.superMbi != null).slice(-20);
  chartManager.renderLine(
    'mbiHistory',
    $('#mbiHistoryChart'),
    chartRows.map((row) => row.date || ''),
    chartRows.map((row) => round(row.superMbi, 2)),
    'SuperMBI history',
  );
}

function applyMbiHistoryText(text, sourceLabel = 'Pasted Dashboard history') {
  const result = calculateSuperMbiHistoryFromText(text);
  if (!result.rows.length) throw new Error('No usable Dashboard A:AG rows found. Paste the exported Dashboard CSV with A:AG columns.');
  state.ui.mbiHistoryRows = result.rows;
  state.ui.mbiHistorySource = sourceLabel;
  state.ui.lastMbiImportSummary = result.summary;
  if (result.latest) fillMbiInputsFromRow(result.latest);
  if (refs.mbiHistoryText && sourceLabel !== 'Pasted Dashboard history') {
    refs.mbiHistoryText.value = text;
  }
  renderMbi();
  if (!result.summary.readyRowCount) {
    showToast('Imported rows, but you still need at least 3 rows for Adv3 and NewHigh3.', 'error');
    return;
  }
  showToast(`SuperMBI updated from ${result.summary.rowCount} Dashboard rows.`, 'success');
}

async function handleMbiHistoryFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    applyMbiHistoryText(text, file.name || 'Dashboard CSV');
    event.target.value = '';
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Dashboard history import failed.', 'error');
  }
}

function clearMbiHistory() {
  state.ui.mbiHistoryRows = [];
  state.ui.mbiHistorySource = '';
  state.ui.lastMbiImportSummary = null;
  if (refs.mbiHistoryText) refs.mbiHistoryText.value = '';
  renderMbi();
  showToast('Imported SuperMBI history cleared.', 'success');
}

function renderMbi() {
  const latestHistoryRow = state.ui.mbiHistoryRows.length ? state.ui.mbiHistoryRows[state.ui.mbiHistoryRows.length - 1] : null;
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
    adv3Pts: $('#mbiAdv3Pts').value,
    newHigh3Pts: $('#mbiNewHigh3Pts').value,
    latestDate: latestHistoryRow?.date || '',
  });

  if (!mbi.ready) {
    $('#mbiScore').textContent = mbi.currentScore == null ? '—' : String(round(mbi.currentScore, 0));
    $('#mbiZone').textContent = mbi.currentScore == null ? 'Fill all inputs' : 'Need Adv3 + NewHigh3';
    $('#mbiZone').style.color = 'var(--amber)';
    $('#mbiScore').style.color = mbi.currentScore == null ? 'var(--text)' : 'var(--amber)';
    $('#mbiActionText').textContent = mbi.currentScore == null
      ? 'Your next-day participation rule will appear here.'
      : 'CurrentScore is ready. Add Adv3 and NewHigh3 to finish SuperMBI.';
    $('#mbiStatsText').textContent = mbi.currentScore == null
      ? 'CurrentScore, Adv3, and NewHigh3 will appear here.'
      : `CurrentScore ${round(mbi.currentScore, 0)} • enter Adv3 and NewHigh3 to complete SuperMBI.`;
    $('#mbiSignals').innerHTML = renderSignalCards([], 'Import Dashboard history or type the converted fields manually.', 'neutral');
    $('#mbiSellSignals').innerHTML = renderSignalCards([], 'Open-position overlay will appear once SuperMBI is ready.', 'neutral');
    $('#mbiSizing').innerHTML = mbi.currentScore == null
      ? '<div class="panel-note">Need the latest row values plus 3-day burst filters.</div>'
      : makeMetricPreviewCard('CurrentScore', String(round(mbi.currentScore, 0)), mbi.currentScore >= 0 ? 'positive' : 'negative');
    $('#mbiBreakdown').innerHTML = mbi.breakdown.length
      ? mbi.breakdown.map((item) => `
          <div class="breakdown-item">
            <div class="top">
              <div class="name">${escapeHtml(item.name)}</div>
              <div class="value ${item.score >= 0 ? 'positive' : 'negative'}">${item.score > 0 ? '+' : ''}${item.score}</div>
            </div>
            <div class="raw">${escapeHtml(item.raw)}</div>
          </div>
        `).join('')
      : '<div class="panel-note">The 11-pillar breakdown appears once the latest-row values are filled.</div>';
    renderMbiHistoryVisuals();
    return;
  }

  const colorMap = {
    green: 'var(--green)',
    blue: 'var(--blue)',
    amber: 'var(--amber)',
    red: 'var(--red)',
    slate: 'var(--slate)',
  };
  const color = colorMap[mbi.color] || 'var(--text)';

  $('#mbiScore').textContent = round(mbi.superMbi, 2).toFixed(2);
  $('#mbiScore').style.color = color;
  $('#mbiZone').textContent = mbi.zone;
  $('#mbiZone').style.color = color;
  $('#mbiActionText').textContent = mbi.action;
  $('#mbiStatsText').textContent = mbi.statsText;
  $('#mbiSignals').innerHTML = renderSignalCards(mbi.signals, 'No regime notes yet.', 'neutral');
  $('#mbiSellSignals').innerHTML = renderSignalCards(mbi.sellSignals, 'No open-position overlay yet.', 'neutral');
  $('#mbiSizing').innerHTML = mbi.sizingCards.map((card) => makeMetricPreviewCard(card.label, escapeHtml(card.value), card.tone === 'negative' ? 'negative' : card.tone === 'warning' ? 'warning' : 'positive')).join('');
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
  renderMbiHistoryVisuals();
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


function syncRiskPresetChips() {
  const risk = Number($('#calcRiskPercent').value || 0);
  $$('.risk-chip').forEach((chip) => {
    chip.classList.toggle('active', Number(chip.dataset.risk || 0) === risk);
  });
}

function resetCalculatorForm() {
  $('#calcEntry').value = '';
  $('#calcSlPrice').value = '';
  $('#calcSlPercent').value = '';
  $('#calcPositionSize').value = '';
  $('#calcRiskAmount').value = '';
  $('#calcTrailPrice').value = '';
  $('#targetR').value = '';
  $('#targetPercent').value = '';
  $('#targetExitPrice').value = '';
  $('#calcLastEdited').value = 'entry';
  renderCalculator();
}

function pushCalculatorToTrade() {
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

  if (!(solver.entry > 0) || !(solver.qty > 0)) {
    showToast('Enter entry and a valid stop first so the calculator can seed a trade.', 'error');
    return;
  }

  openTradeModal();
  $('#tradeDirection').value = solver.long ? 'LONG' : 'SHORT';
  $('#tradePlannedRisk').value = solver.actualRisk || $('#calcRiskAmount').value || '';
  $('#tradePlannedStop').value = solver.slPrice || '';
  const mbiScoreText = $('#mbiScore').textContent;
  if (mbiScoreText && mbiScoreText !== '—') $('#tradeMbiScore').value = mbiScoreText;
  refs.fillsContainer.innerHTML = '';
  createFillRow({
    side: solver.long ? 'BUY' : 'SELL',
    qty: solver.qty,
    price: solver.entry,
    note: 'Seeded from calculator',
  });
  syncTradePreview();
  showToast('Calculator values pushed into a new trade.', 'success');
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

async function subscribeToWinners() {
  if (state.unsubWinners) {
    state.unsubWinners();
    state.unsubWinners = null;
  }
  state.unsubWinners = state.storage.subscribeWinners(
    (entries) => {
      state.winners = (entries || []).map((entry) => normalizeWinnerPayload(entry));
      renderAll();
    },
    (error) => showToast(error.message || 'Could not load winner database entries.', 'error'),
  );
}

async function handleAuthChanged(user) {
  state.user = user;
  if (state.mode === 'cloud' && user) {
    state.settings = (await state.storage.loadSettings()) || { ...defaultSettings };
    await subscribeToTrades();
    await subscribeToWinners();
  } else if (state.mode === 'cloud' && !user) {
    if (state.unsubTrades) state.unsubTrades();
    if (state.unsubWinners) state.unsubWinners();
    state.unsubTrades = null;
    state.unsubWinners = null;
    state.trades = [];
    state.winners = [];
    state.settings = { ...defaultSettings };
  } else {
    state.settings = (await state.storage.loadSettings()) || { ...defaultSettings };
    await subscribeToTrades();
    await subscribeToWinners();
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

  refs.resetCalcBtn?.addEventListener('click', resetCalculatorForm);
  refs.pushCalcToTradeBtn?.addEventListener('click', pushCalculatorToTrade);
  $$('.risk-chip').forEach((chip) => chip.addEventListener('click', () => {
    $('#calcRiskPercent').value = chip.dataset.risk || '';
    syncRiskPresetChips();
    renderCalculator();
  }));

  $('#openTradeModalBtn').addEventListener('click', () => openTradeModal());
  $('#addTradeFromDashboard').addEventListener('click', () => openTradeModal());
  $('#closeTradeModalBtn').addEventListener('click', closeTradeModal);
  refs.tradeModal.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-modal')) closeTradeModal();
  });

  $('#openWinnerModalBtn')?.addEventListener('click', () => openWinnerModal());
  $('#closeWinnerModalBtn')?.addEventListener('click', closeWinnerModal);
  refs.winnerModal?.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-winner-modal')) closeWinnerModal();
  });
  refs.winnerTable?.addEventListener('click', handleWinnerTableClick);
  $('#winnerImageUrl')?.addEventListener('input', syncWinnerImagePreview);
  refs.pickWinnerImageBtn?.addEventListener('click', () => refs.winnerImageFile?.click());
  refs.clearWinnerImageBtn?.addEventListener('click', clearWinnerImageSelection);
  refs.winnerImageFile?.addEventListener('change', handleWinnerImageFileChange);
  refs.addWinnerMoveBtn?.addEventListener('click', () => {
    const moves = readWinnerMovesBuilderRaw();
    moves.push(emptyWinnerMoveForm());
    renderWinnerMovesBuilder(moves);
  });
  refs.winnerMovesBuilder?.addEventListener('click', handleWinnerMovesBuilderClick);
  refs.winnerMovesBuilder?.addEventListener('input', renderWinnerMovesSummary);

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

  refs.winnerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    let uploadedPath = '';
    let pathToDelete = '';
    try {
      const entry = readWinnerForm();
      const existing = state.winners.find((item) => item.id === entry.id);
      const existingPath = existing?.imageStoragePath || '';
      const existingUrl = existing?.imageUrl || '';
      const pendingImage = state.ui.winnerImageDraft?.prepared;
      if (!hasWinnerContent(entry, pendingImage)) throw new Error('Add at least one winner detail before saving.');

      if (pendingImage) {
        if (!canUploadWinnerImages()) {
          throw new Error('Screenshot uploads need cloud mode, Google sign-in, and Firebase Storage configured.');
        }
        showToast('Uploading screenshot…');
        const upload = await state.storage.uploadWinnerImage({
          winnerId: entry.id,
          blob: pendingImage.blob,
          fileName: pendingImage.fileName,
          contentType: pendingImage.contentType,
        });
        uploadedPath = upload.storagePath;
        entry.imageUrl = upload.downloadUrl;
        entry.imageStoragePath = upload.storagePath;
        entry.imageBytes = upload.sizeBytes;
        entry.imageContentType = upload.contentType;
        entry.imageWidth = pendingImage.width;
        entry.imageHeight = pendingImage.height;
        if (existingPath && existingPath !== upload.storagePath) pathToDelete = existingPath;
      } else if (!entry.imageUrl) {
        if (existingPath) pathToDelete = existingPath;
        entry.imageStoragePath = '';
        entry.imageBytes = null;
        entry.imageContentType = '';
        entry.imageWidth = null;
        entry.imageHeight = null;
      } else if (entry.imageUrl !== existingUrl && existingPath) {
        pathToDelete = existingPath;
        entry.imageStoragePath = '';
        entry.imageBytes = null;
        entry.imageContentType = '';
        entry.imageWidth = null;
        entry.imageHeight = null;
      }

      await state.storage.saveWinner(entry);
      if (pathToDelete && pathToDelete !== uploadedPath) {
        try {
          await state.storage.deleteWinnerImage(pathToDelete);
        } catch (cleanupError) {
          console.warn('Old screenshot cleanup failed', cleanupError);
        }
      }
      closeWinnerModal();
      showToast('Winner database entry saved.', 'success');
    } catch (error) {
      console.error(error);
      if (uploadedPath) {
        try {
          await state.storage.deleteWinnerImage(uploadedPath);
        } catch (cleanupError) {
          console.warn('Uploaded screenshot rollback failed', cleanupError);
        }
      }
      showToast(error.message || 'Could not save winner entry.', 'error');
    }
  });

  refs.deleteWinnerBtn?.addEventListener('click', async () => {
    const entryId = $('#winnerId').value;
    if (!entryId) return;
    await handleDeleteWinner(entryId);
    closeWinnerModal();
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
  refs.mbiImportBtn?.addEventListener('click', () => refs.mbiHistoryInput?.click());
  refs.mbiHistoryInput?.addEventListener('change', handleMbiHistoryFile);
  refs.mbiApplyTextareaBtn?.addEventListener('click', () => {
    try {
      applyMbiHistoryText(refs.mbiHistoryText?.value || '', 'Pasted Dashboard history');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not parse pasted Dashboard rows.', 'error');
    }
  });
  refs.mbiClearHistoryBtn?.addEventListener('click', clearMbiHistory);
  $('#exportCsvBtn').addEventListener('click', exportCsv);
  $('#exportExcelBtn')?.addEventListener('click', exportJournalExcel);
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#exportWinnerCsvBtn')?.addEventListener('click', exportWinnerCsv);
  $('#exportWinnerExcelBtn')?.addEventListener('click', exportWinnerExcel);
  refs.askJournalAssistantBtn?.addEventListener('click', runJournalAssistant);
  refs.askWinnerAssistantBtn?.addEventListener('click', runWinnerAssistant);
  refs.journalAssistantInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runJournalAssistant();
    }
  });
  refs.winnerAssistantInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runWinnerAssistant();
    }
  });
  $$('[data-assistant-scope="journal"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (refs.journalAssistantInput) refs.journalAssistantInput.value = button.dataset.prompt || '';
      runJournalAssistant();
    });
  });
  $$('[data-assistant-scope="winner"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (refs.winnerAssistantInput) refs.winnerAssistantInput.value = button.dataset.prompt || '';
      runWinnerAssistant();
    });
  });
  refs.copyCoachPromptBtn?.addEventListener('click', async () => {
    const prompt = state.ui.lastCoachPrompt || buildAiCoachReport(getFilteredTradesRaw(), state.settings.pnlMethod || PNL_METHODS.AVERAGE).promptText;
    if (!prompt) {
      showToast('Add some closed trades in the active filter scope first to generate a review prompt.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('Coach review prompt copied.', 'success');
    } catch (error) {
      downloadTextFile('trademaster-coach-prompt.txt', prompt);
      showToast('Clipboard blocked. Prompt downloaded as a text file.', 'success');
    }
  });

  const rerenderTradeAnalytics = () => renderAll();
  const bindFilter = (selector, key) => {
    $(selector).addEventListener('input', (event) => {
      state.filters[key] = event.target.value;
      rerenderTradeAnalytics();
    });
    $(selector).addEventListener('change', (event) => {
      state.filters[key] = event.target.value;
      rerenderTradeAnalytics();
    });
  };

  bindFilter('#searchInput', 'search');
  bindFilter('#statusFilter', 'status');
  bindFilter('#directionFilter', 'direction');
  bindFilter('#resultFilter', 'result');
  bindFilter('#timeframeFilter', 'timeframe');
  bindFilter('#strategyFilter', 'strategy');
  bindFilter('#sortSelect', 'sort');
  bindFilter('#minMbiFilter', 'minMbi');
  bindFilter('#lossThresholdFilter', 'lossWorseThan');
  bindFilter('#moveThresholdFilter', 'minAbsMove');
  bindFilter('#dipBeforeMoveFilter', 'maxDipBeforeMove');

  $('#periodPresetFilter').addEventListener('change', (event) => {
    state.filters.periodPreset = event.target.value;
    if (event.target.value === 'CUSTOM') {
      rerenderTradeAnalytics();
      return;
    }
    const range = periodPresetRange(event.target.value);
    state.filters.fromDate = range.fromDate;
    state.filters.toDate = range.toDate;
    $('#fromDateFilter').value = range.fromDate;
    $('#toDateFilter').value = range.toDate;
    rerenderTradeAnalytics();
  });

  ['#fromDateFilter', '#toDateFilter'].forEach((selector, index) => {
    $(selector).addEventListener('input', (event) => {
      state.filters[index === 0 ? 'fromDate' : 'toDate'] = event.target.value;
      state.filters.periodPreset = 'CUSTOM';
      $('#periodPresetFilter').value = 'CUSTOM';
      rerenderTradeAnalytics();
    });
    $(selector).addEventListener('change', (event) => {
      state.filters[index === 0 ? 'fromDate' : 'toDate'] = event.target.value;
      state.filters.periodPreset = 'CUSTOM';
      $('#periodPresetFilter').value = 'CUSTOM';
      rerenderTradeAnalytics();
    });
  });

  const bindWinnerFilter = (selector, key) => {
    $(selector).addEventListener('input', (event) => {
      state.winnerFilters[key] = event.target.value;
      renderWinnerSummary();
      runWinnerAssistant();
    });
    $(selector).addEventListener('change', (event) => {
      state.winnerFilters[key] = event.target.value;
      renderWinnerSummary();
      runWinnerAssistant();
    });
  };

  bindWinnerFilter('#winnerSearchInput', 'search');
  bindWinnerFilter('#winnerSectorFilter', 'sector');
  bindWinnerFilter('#winnerTypeFilter', 'type');
  bindWinnerFilter('#winnerSetupFilter', 'setup');
  bindWinnerFilter('#winnerTimeframeFilter', 'timeframe');
  bindWinnerFilter('#winnerPeriodFilter', 'period');
  bindWinnerFilter('#winnerMinMoveFilter', 'minMove');
  bindWinnerFilter('#winnerMinInitialMoveFilter', 'minInitialMove');
  bindWinnerFilter('#winnerMaxDipFilter', 'maxDipBeforeMove');
  bindWinnerFilter('#winnerMaxStage4Filter', 'maxStage4Decline');
  bindWinnerFilter('#winnerMinMbiFilter', 'minMbi');
  bindWinnerFilter('#winnerMinMoveCountFilter', 'minMoveCount');
  bindWinnerFilter('#winnerMinExpansionCountFilter', 'minExpansionCount');
  bindWinnerFilter('#winnerMinBaseCountFilter', 'minBaseCount');
  bindWinnerFilter('#winnerMinMoveDaysFilter', 'minMoveDays');
  bindWinnerFilter('#winnerMinAvgExpansionFilter', 'minAvgExpansion');
  bindWinnerFilter('#winnerMinMaxExpansionFilter', 'minMaxExpansion');
  bindWinnerFilter('#winnerMinAvgExpansionLengthFilter', 'minAvgExpansionLength');
  bindWinnerFilter('#winnerMinMaxExpansionLengthFilter', 'minMaxExpansionLength');
  bindWinnerFilter('#winnerMinMajorBaseFilter', 'minMajorBaseLength');
  bindWinnerFilter('#winnerMaxMajorBaseDepthFilter', 'maxMajorBaseDepth');
  bindWinnerFilter('#winnerMinExpansionBaseFilter', 'minExpansionBaseLength');
  bindWinnerFilter('#winnerMaxExpansionBaseDepthFilter', 'maxExpansionBaseDepth');
  bindWinnerFilter('#winnerHasImageFilter', 'hasImage');
  bindWinnerFilter('#winnerSortSelect', 'sort');

  [
    '#calcCapital', '#calcRiskPercent', '#calcLastEdited', '#calcEntry', '#calcSlPrice', '#calcSlPercent', '#calcPositionSize', '#calcRiskAmount', '#calcTrailPrice', '#targetR', '#targetPercent', '#targetExitPrice',
  ].forEach((selector) => $(selector).addEventListener('input', renderCalculator));
  [['#calcPositionSize', 'positionSize'], ['#calcRiskAmount', 'riskAmount'], ['#calcEntry', 'entry'], ['#calcSlPrice', 'entry'], ['#calcSlPercent', 'entry']].forEach(([selector, mode]) => {
    $(selector).addEventListener('input', () => {
      $('#calcLastEdited').value = mode;
      renderCalculator();
    });
  });
  [
    '#mbiA20', '#mbiA50', '#mbiA200', '#mbiNb', '#mbiWh', '#mbiWl', '#mbiBosf', '#mbiUhlh', '#mbiVol', '#mbiAdv', '#mbiNhl', '#mbiBd', '#mbiAdv3Pts', '#mbiNewHigh3Pts',
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
      const payload = { version: 2, exportedAt: new Date().toISOString(), settings: state.settings, trades: state.trades, winners: state.winners };
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
      await state.storage.replaceAllData({ ...payload, winners: payload.winners || [] });
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
      const data = Array.isArray(payload) ? { trades: payload, winners: [], settings: state.settings } : payload;
      if (!Array.isArray(data.trades)) throw new Error('JSON must contain a trades array.');
      await state.storage.replaceAllData({ ...data, winners: data.winners || [] });
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
  clearWinnerForm();

  const config = window.TRADEMASTER_CONFIG?.firebase || {};
  state.storage = await createStorageLayer(config);
  state.mode = state.storage.mode;
  const initial = await state.storage.init();
  state.user = initial.user;
  state.settings = initial.settings || { ...defaultSettings };
  state.trades = (initial.trades || []).map((trade) => ({ ...trade, metrics: computeTradeMetrics(trade, state.settings.pnlMethod || PNL_METHODS.AVERAGE) }));
  state.winners = (initial.winners || []).map((entry) => normalizeWinnerPayload(entry));

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
