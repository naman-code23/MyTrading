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
    maxStage4Decline: '',
    minMbi: '',
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
    || isPresent(entry.stage4Decline)
    || isPresent(entry.mbiScore)
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
  if (state.winnerFilters.maxStage4Decline) labels.push(`Stage-4 ≤ ${state.winnerFilters.maxStage4Decline}%`);
  if (state.winnerFilters.minMbi) labels.push(`SuperMBI ≥ ${state.winnerFilters.minMbi}`);
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
  const avgWinnerHold = closed.filter((trade) => trade.metrics.realizedNetPnl > 0).reduce((sum, trade, _, arr) => sum + trade.metrics.holdMinutes / (arr.length || 1), 0);
  const avgLoserHold = closed.filter((trade) => trade.metrics.realizedNetPnl < 0).reduce((sum, trade, _, arr) => sum + trade.metrics.holdMinutes / (arr.length || 1), 0);
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

function renderWinnerSummary() {
  if (!requireCloudAuth()) {
    refs.winnerSummaryCards.innerHTML = '<div class="empty-state">Sign in to build the winner database.</div>';
    refs.winnerTable.innerHTML = '';
    return;
  }
  const items = getRenderableWinners();
  const summary = summarizeWinnerEntries(items);
  const labels = activeWinnerFilterLabels();
  const pills = labels.length
    ? `<div class="filter-pill-row">${labels.map((label) => `<span class="pill pill-muted">${escapeHtml(label)}</span>`).join('')}</div>`
    : '<div class="filter-pill-row"><span class="pill pill-muted">No extra filters</span></div>';
  refs.winnerFilterSummary.innerHTML = `<div class="filter-summary-line"><div class="text-strong">${summary.count} records • ${summary.uniqueStocks} stocks • ${summary.withImages} images</div></div>${pills}`;
  refs.winnerSummaryCards.innerHTML = [
    makeMetricPreviewCard('Records after filter', String(summary.count)),
    makeMetricPreviewCard('Stocks after filter', String(summary.uniqueStocks)),
    makeMetricPreviewCard('Avg move %', summary.avgMove != null ? formatPercent(summary.avgMove, 1) : '—', summary.avgMove != null && summary.avgMove >= 20 ? 'positive' : ''),
    makeMetricPreviewCard('Avg initial move %', summary.avgInitialMove != null ? formatPercent(summary.avgInitialMove, 1) : '—'),
    makeMetricPreviewCard('Avg base length', summary.avgBaseLength != null ? `${summary.avgBaseLength} bars` : '—'),
    makeMetricPreviewCard('Avg stage-4 decline', summary.avgStage4Decline != null ? formatPercent(summary.avgStage4Decline, 1) : '—', summary.avgStage4Decline != null && summary.avgStage4Decline <= 25 ? 'positive' : ''),
    makeMetricPreviewCard('Avg circuits', summary.avgCircuits != null ? String(summary.avgCircuits) : '—'),
  ].join('');

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
            <th>Type</th>
            <th>Setup</th>
            <th>TF</th>
            <th>Period</th>
            <th># Circuit</th>
            <th>Initial move</th>
            <th>Base length</th>
            <th>Total move</th>
            <th>Stage-4 decline</th>
            <th>SuperMBI</th>
            <th>Image</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((entry) => `
            <tr>
              <td>
                <div class="winner-stock">${escapeHtml(entry.stockName || '—')}</div>
                <div class="small-copy">${entry.breakoutDate ? escapeHtml(formatDate(entry.breakoutDate)) : 'No breakout date'}</div>
              </td>
              <td>${escapeHtml(entry.sector || '—')}</td>
              <td>${escapeHtml(entry.type || '—')}</td>
              <td>${escapeHtml(entry.setup || '—')}</td>
              <td>${escapeHtml(entry.timeframe || '—')}</td>
              <td>${escapeHtml(entry.period || '—')}</td>
              <td>${entry.circuits ?? '—'}</td>
              <td>${entry.initialMove == null ? '—' : formatPercent(entry.initialMove, 1)}</td>
              <td>${entry.baseLength ?? '—'}</td>
              <td class="${entry.move != null && entry.move >= 20 ? 'positive' : ''}">${entry.move == null ? '—' : formatPercent(entry.move, 1)}</td>
              <td>${entry.stage4Decline == null ? '—' : formatPercent(entry.stage4Decline, 1)}</td>
              <td>${entry.mbiScore ?? '—'}</td>
              <td>${entry.imageUrl ? (looksLikeViewableImageUrl(entry.imageUrl)
                ? `<a href="${escapeHtml(entry.imageUrl)}" target="_blank" rel="noreferrer"><img class="table-thumb" src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.stockName || 'Winner image')}" /></a>`
                : '<span class="small-copy">Saved link</span>') : '<span class="small-copy">No image</span>'}</td>
              <td><button class="btn btn-ghost" data-winner-action="edit" data-winner-id="${escapeHtml(entry.id)}">Edit</button></td>
            </tr>
            ${entry.notes ? `<tr><td colspan="14" class="small-copy">${escapeHtml(entry.notes)}</td></tr>` : ''}
          `).join('')}
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

function clearWinnerForm() {
  refs.winnerForm.reset();
  $('#winnerId').value = '';
  $('#winnerImageStoragePath').value = '';
  if ($('#winnerTimeframe')) $('#winnerTimeframe').value = 'SWING';
  refs.deleteWinnerBtn.classList.add('hidden');
  refs.winnerModalTitle.textContent = 'New winner';
  clearWinnerImageDraft();
  refs.winnerImagePreview.innerHTML = winnerImageEmptyState();
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
    $('#winnerStage4Decline').value = entry.stage4Decline ?? '';
    $('#winnerImageUrl').value = entry.imageUrl || '';
    $('#winnerImageStoragePath').value = entry.imageStoragePath || '';
    $('#winnerTags').value = stringifyTags(entry.tags || []);
    $('#winnerNotes').value = entry.notes || '';
    refs.winnerModalTitle.textContent = `Edit ${entry.stockName || 'winner'}`;
    refs.deleteWinnerBtn.classList.remove('hidden');
    syncWinnerImagePreview();
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
    stage4Decline: $('#winnerStage4Decline').value,
    imageUrl: $('#winnerImageUrl').value,
    imageStoragePath: $('#winnerImageStoragePath').value,
    imageBytes: existing?.imageBytes ?? null,
    imageContentType: existing?.imageContentType || '',
    imageWidth: existing?.imageWidth ?? null,
    imageHeight: existing?.imageHeight ?? null,
    tags: parseTags($('#winnerTags').value),
    notes: $('#winnerNotes').value,
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
  $('#exportJsonBtn').addEventListener('click', exportJson);
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
    });
    $(selector).addEventListener('change', (event) => {
      state.winnerFilters[key] = event.target.value;
      renderWinnerSummary();
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
  bindWinnerFilter('#winnerMaxStage4Filter', 'maxStage4Decline');
  bindWinnerFilter('#winnerMinMbiFilter', 'minMbi');
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
