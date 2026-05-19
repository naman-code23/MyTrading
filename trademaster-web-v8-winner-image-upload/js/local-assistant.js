function normalizeQuestion(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[?]/g, ' ')
    .replace(/[%]/g, ' % ')
    .replace(/[^a-z0-9.%\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, tokens = []) {
  return tokens.some((token) => text.includes(token));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesFrom(rows = [], getter) {
  return rows
    .map((row) => getter(row))
    .map(toNumber)
    .filter((value) => value != null);
}

function sum(values = []) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values = []) {
  return values.length ? sum(values) / values.length : null;
}

function median(values = []) {
  if (!values.length) return null;
  const items = [...values].sort((a, b) => a - b);
  const middle = Math.floor(items.length / 2);
  if (items.length % 2) return items[middle];
  return (items[middle - 1] + items[middle]) / 2;
}

function percentile(values = [], percentileValue = 0.8) {
  if (!values.length) return null;
  const items = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, Number(percentileValue || 0)));
  const rank = (items.length - 1) * clamped;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return items[lower];
  const weight = rank - lower;
  return items[lower] + (items[upper] - items[lower]) * weight;
}

function min(values = []) {
  return values.length ? Math.min(...values) : null;
}

function max(values = []) {
  return values.length ? Math.max(...values) : null;
}

function round(value, digits = 2) {
  const number = toNumber(value);
  if (number == null) return null;
  const power = 10 ** digits;
  return Math.round(number * power) / power;
}

function uniqueCount(items = [], getter) {
  const set = new Set();
  items.forEach((item) => {
    const value = getter(item);
    if (value != null && String(value).trim()) set.add(String(value).trim());
  });
  return set.size;
}

function formatCurrency(value, currency = 'INR') {
  const number = toNumber(value);
  if (number == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(number);
}

function formatNumber(value, digits = 2) {
  const number = toNumber(value);
  if (number == null) return '—';
  return round(number, digits).toLocaleString('en-IN', {
    minimumFractionDigits: digits > 0 ? 0 : 0,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value, digits = 2) {
  const number = toNumber(value);
  if (number == null) return '—';
  return `${formatNumber(number, digits)}%`;
}

function formatBars(value) {
  const number = toNumber(value);
  if (number == null) return '—';
  return `${formatNumber(number, 1)} bars/days`;
}

function formatDurationMinutes(value) {
  const minutes = toNumber(value);
  if (minutes == null) return '—';
  if (minutes >= 1440) {
    return `${formatNumber(minutes / 1440, 2)} days`;
  }
  if (minutes >= 60) {
    return `${formatNumber(minutes / 60, 2)} hours`;
  }
  return `${formatNumber(minutes, 0)} minutes`;
}

function formatValueByUnit(value, unit, currency = 'INR') {
  switch (unit) {
    case 'currency':
      return formatCurrency(value, currency);
    case 'percent':
      return formatPercent(value, 2);
    case 'bars':
      return formatBars(value);
    case 'duration':
      return formatDurationMinutes(value);
    default:
      return formatNumber(value, 2);
  }
}

function detectOperation(question) {
  if (includesAny(question, ['how many', 'count', 'number of'])) return 'count';
  if (includesAny(question, ['sum', 'total', 'combined'])) return 'sum';
  if (includesAny(question, ['median'])) return 'median';
  if (includesAny(question, ['highest', 'largest', 'biggest', 'max', 'best'])) return 'max';
  if (includesAny(question, ['lowest', 'smallest', 'min', 'worst'])) return 'min';
  if (includesAny(question, ['average', 'avg', 'mean'])) return 'avg';
  return 'avg';
}

function metricAggregation(values = [], operation = 'avg') {
  switch (operation) {
    case 'count':
      return values.length;
    case 'sum':
      return sum(values);
    case 'median':
      return median(values);
    case 'min':
      return min(values);
    case 'max':
      return max(values);
    case 'avg':
    default:
      return mean(values);
  }
}

function buildResult({ title, answer, details = [], tone = 'neutral' }) {
  return { ok: true, title, answer, details, tone };
}

function buildError(title, details = []) {
  return { ok: false, title, answer: '', details, tone: 'warning' };
}

function journalSubsetFromQuestion(items = [], question = '') {
  let scoped = [...items];
  if (includesAny(question, ['winner', 'winners', 'good trade', 'good trades'])) {
    scoped = scoped.filter((trade) => trade.metrics?.status === 'CLOSED' && (trade.metrics?.realizedNetPnl || 0) > 0);
  } else if (includesAny(question, ['loser', 'losers', 'bad trade', 'bad trades'])) {
    scoped = scoped.filter((trade) => trade.metrics?.status === 'CLOSED' && (trade.metrics?.realizedNetPnl || 0) < 0);
  } else if (includesAny(question, ['open trade', 'open trades', 'open position', 'open positions'])) {
    scoped = scoped.filter((trade) => trade.metrics?.status === 'OPEN');
  } else if (includesAny(question, ['closed trade', 'closed trades', 'closed position', 'closed positions'])) {
    scoped = scoped.filter((trade) => trade.metrics?.status === 'CLOSED');
  }

  if (includesAny(question, [' swing ']) || question.startsWith('swing') || question.endsWith(' swing')) {
    scoped = scoped.filter((trade) => trade.metrics?.timeframe === 'SWING');
  }
  if (includesAny(question, [' mtf ']) || question.startsWith('mtf') || question.endsWith(' mtf')) {
    scoped = scoped.filter((trade) => trade.metrics?.timeframe === 'MTF');
  }
  if (includesAny(question, [' mis ', ' intraday ', ' day trade', ' day trades'])) {
    scoped = scoped.filter((trade) => trade.metrics?.timeframe === 'MIS');
  }
  if (includesAny(question, [' short ', ' shorts ']) || question.startsWith('short')) {
    scoped = scoped.filter((trade) => trade.direction === 'SHORT');
  } else if (includesAny(question, [' long ', ' longs ']) || question.startsWith('long')) {
    scoped = scoped.filter((trade) => trade.direction === 'LONG');
  }
  return scoped;
}

function detectJournalMetric(question = '') {
  const q = question;
  if (includesAny(q, ['open risk now', 'current open risk'])) return { special: 'currentOpenRisk' };
  if (includesAny(q, ['peak open risk', 'max open risk'])) return { special: 'peakOpenRisk' };
  if (includesAny(q, ['avg win size', 'average win size', 'mean win size'])) return { special: 'avgWin' };
  if (includesAny(q, ['avg loss size', 'average loss size', 'mean loss size'])) return { special: 'avgLossAbs' };
  if (includesAny(q, ['win size', 'gross profit'])) return { special: 'grossProfit' };
  if (includesAny(q, ['loss size', 'gross loss'])) return { special: 'grossLossAbs' };
  if (includesAny(q, ['avg win holding', 'avg win hold', 'average win holding', 'average win hold'])) return { special: 'avgWinHoldMinutes' };
  if (includesAny(q, ['avg loss holding', 'avg loss hold', 'average loss holding', 'average loss hold'])) return { special: 'avgLossHoldMinutes' };
  if (includesAny(q, ['win %', 'win rate', 'winning percentage'])) return { special: 'winRate' };
  if (includesAny(q, ['loss %', 'loss rate', 'losing percentage'])) return { special: 'lossRate' };
  if (includesAny(q, ['winner dip 80', 'winner dip p80', 'winner dip percentile'])) return { special: 'winnerDipP80' };

  if (includesAny(q, ['holding period', 'hold period', 'hold time', 'days held', 'hold duration'])) {
    return { label: 'holding period', unit: 'duration', getter: (trade) => trade.metrics?.holdMinutes };
  }
  if (includesAny(q, ['dip before move', 'dip'])) {
    return { label: 'dip before move', unit: 'percent', getter: (trade) => trade.dipBeforeMove };
  }
  if (includesAny(q, ['r multiple', 'r-multiple', ' r ', ' rr '])) {
    return { label: 'R multiple', unit: 'number', getter: (trade) => trade.metrics?.realizedR };
  }
  if (includesAny(q, ['pnl %', 'return %', 'move %', 'percentage return', 'return'])) {
    return { label: 'move %', unit: 'percent', getter: (trade) => trade.metrics?.realizedPct };
  }
  if (includesAny(q, ['pnl', 'net pnl', 'net profit', 'profit'])) {
    return { label: 'net P&L', unit: 'currency', getter: (trade) => trade.metrics?.realizedNetPnl };
  }
  if (includesAny(q, ['supermbi', 'mbi'])) {
    return { label: 'SuperMBI', unit: 'number', getter: (trade) => trade.mbiScore };
  }
  if (includesAny(q, ['planned risk', 'risk amount'])) {
    return { label: 'planned risk', unit: 'currency', getter: (trade) => trade.plannedRisk };
  }
  return null;
}

export function answerJournalQuestion(question, filteredTrades = [], summary = {}, options = {}) {
  const q = normalizeQuestion(question);
  const currency = options.currency || 'INR';
  if (!q) {
    return buildError('Ask a journal question', [
      'Examples: “What is avg win size?”, “What is avg loss holding period?”, “What is open risk now?”, “What is avg dip before move for winners?”',
      'The answer uses your current journal filter scope.',
    ]);
  }

  const special = detectJournalMetric(q);
  if (special?.special) {
    const key = special.special;
    const specialMap = {
      winRate: { title: 'Win %', value: summary.winRate, unit: 'percent', details: [`${summary.closedTradeCount || 0} closed trades in current scope.`] },
      lossRate: { title: 'Loss %', value: summary.lossRate, unit: 'percent', details: [`${summary.closedTradeCount || 0} closed trades in current scope.`] },
      grossProfit: { title: 'Win size', value: summary.grossProfit, unit: 'currency', details: [`${summary.winCount || 0} winning trades in current scope.`], tone: 'positive' },
      grossLossAbs: { title: 'Loss size', value: summary.grossLossAbs, unit: 'currency', details: [`${summary.lossCount || 0} losing trades in current scope.`], tone: 'negative' },
      avgWin: { title: 'Avg win size', value: summary.avgWin, unit: 'currency', details: [`${summary.winCount || 0} winning trades in current scope.`], tone: 'positive' },
      avgLossAbs: { title: 'Avg loss size', value: summary.avgLossAbs, unit: 'currency', details: [`${summary.lossCount || 0} losing trades in current scope.`], tone: 'negative' },
      avgWinHoldMinutes: { title: 'Avg win holding period', value: summary.avgWinHoldMinutes, unit: 'duration', details: [`${summary.winCount || 0} winning trades in current scope.`] },
      avgLossHoldMinutes: { title: 'Avg loss holding period', value: summary.avgLossHoldMinutes, unit: 'duration', details: [`${summary.lossCount || 0} losing trades in current scope.`] },
      currentOpenRisk: { title: 'Open risk now', value: summary.currentOpenRisk, unit: 'currency', details: [`${summary.trackedOpenRiskTradeCount || 0} open trade(s) currently have measurable risk.`], tone: 'warning' },
      peakOpenRisk: { title: 'Peak open risk', value: summary.peakOpenRisk, unit: 'currency', details: [`${summary.trackedRiskTradeCount || 0} trade(s) in current scope had enough risk data for the profile.`], tone: 'warning' },
      winnerDipP80: { title: 'Winner dip 80%', value: summary.winnerDipP80, unit: 'percent', details: ['Useful as a stop-loss guide for strong setups in this filtered sample.'], tone: 'warning' },
    };
    const item = specialMap[key];
    if (!item) return buildError('I could not answer that journal question.', ['Try asking about win %, loss %, avg hold, dip before move, or open risk.']);
    const extra = [];
    if (key === 'avgLossHoldMinutes' && toNumber(summary.avgWinHoldMinutes) != null && toNumber(summary.avgLossHoldMinutes) != null) {
      const diff = round((summary.avgLossHoldMinutes - summary.avgWinHoldMinutes) / 60, 2);
      extra.push(`Losing trades are held ${diff >= 0 ? 'about' : 'not'} ${Math.abs(diff).toFixed(2)} hours ${diff >= 0 ? 'longer' : 'shorter'} than winners on average.`);
    }
    if (key === 'winnerDipP80' && toNumber(summary.avgWinDipBeforeMove) != null) {
      extra.push(`Average winner dip is ${formatPercent(summary.avgWinDipBeforeMove, 2)} in the same scope.`);
    }
    return buildResult({
      title: item.title,
      answer: formatValueByUnit(item.value, item.unit, currency),
      details: [...item.details, ...extra],
      tone: item.tone || 'neutral',
    });
  }

  const scoped = journalSubsetFromQuestion(filteredTrades, q);
  const metric = detectJournalMetric(q);
  if (!metric) {
    return buildError('I could not parse that journal question.', [
      'Try: “What is avg pnl for swing winners?”, “What is avg hold time for losers?”, “What is avg dip before move?”, or “What is peak open risk?”',
    ]);
  }

  const operation = detectOperation(q);
  const values = valuesFrom(scoped, metric.getter);
  if (!values.length) {
    return buildError(`No ${metric.label} data matched that journal question.`, ['Adjust the current filters or ask about a metric that exists in the filtered trades.']);
  }

  const resultValue = metricAggregation(values, operation);
  const symbols = uniqueCount(scoped, (trade) => trade.symbol);
  const details = [`${values.length} trade sample(s) across ${symbols} symbol(s) in the current filtered journal scope.`];
  const med = median(values);
  const p80 = percentile(values, 0.8);
  if (operation !== 'median' && med != null) details.push(`Median ${metric.label}: ${formatValueByUnit(med, metric.unit, currency)}.`);
  if (metric.unit === 'percent' && p80 != null) details.push(`80th percentile ${metric.label}: ${formatValueByUnit(p80, metric.unit, currency)}.`);
  if (metric.label === 'dip before move' && toNumber(summary.winnerDipP80) != null) details.push(`Winner dip 80% in the current journal scope is ${formatPercent(summary.winnerDipP80, 2)}.`);

  const opLabelMap = {
    avg: 'Average',
    median: 'Median',
    min: 'Lowest',
    max: 'Highest',
    sum: 'Total',
    count: 'Count of',
  };

  return buildResult({
    title: `${opLabelMap[operation] || 'Average'} ${metric.label}`,
    answer: operation === 'count' ? formatNumber(resultValue, 0) : formatValueByUnit(resultValue, metric.unit, currency),
    details,
    tone: operation === 'max' ? 'positive' : operation === 'min' && metric.label === 'net P&L' ? 'negative' : 'neutral',
  });
}

function detectWinnerTarget(question = '') {
  const q = question;
  const requestedLength = includesAny(q, ['length', 'days', 'bars', 'duration']);
  const requestedDepth = includesAny(q, ['depth', 'pullback', 'drawdown']);
  const requestedPct = includesAny(q, [' %', 'percent', 'pct', 'size', 'move']);

  const expBaseMatch = q.match(/\be(\d+)b(\d*)\b/);
  if (expBaseMatch) {
    const label = (`E${expBaseMatch[1]}B${expBaseMatch[2] || ''}`).toUpperCase();
    return {
      kind: 'base',
      label,
      display: requestedLength ? `${label} length` : `${label} depth`,
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.depth,
      rows: (flat) => flat.bases.filter((row) => row.kind === 'EXPANSION' && String(row.label).toUpperCase() === label),
    };
  }

  const majorBaseMatch = q.match(/\bb(\d+)\b/);
  if (majorBaseMatch && !includesAny(q, ['base length', 'base depth', 'base count'])) {
    const label = (`B${majorBaseMatch[1]}`).toUpperCase();
    return {
      kind: 'base',
      label,
      display: requestedLength ? `${label} length` : `${label} depth`,
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.depth,
      rows: (flat) => flat.bases.filter((row) => row.kind === 'MAJOR' && String(row.label).toUpperCase() === label),
    };
  }

  const moveMatch = q.match(/\bmove\s*(\d+)\b/);
  if (moveMatch) {
    const moveNumber = Number(moveMatch[1]);
    return {
      kind: 'move',
      display: requestedLength ? `Move ${moveNumber} days` : `Move ${moveNumber} %`,
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.moveDays : (row) => row.movePct,
      rows: (flat) => flat.moves.filter((row) => row.moveNumber === moveNumber),
    };
  }

  const expansionMatch = q.match(/\be(\d+)\b/);
  if (expansionMatch) {
    const expansionNumber = Number(expansionMatch[1]);
    return {
      kind: 'expansion',
      display: requestedLength ? `E${expansionNumber} length` : `E${expansionNumber} %`,
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.pct,
      rows: (flat) => flat.expansions.filter((row) => row.expansionNumber === expansionNumber),
    };
  }

  if (includesAny(q, ['major base'])) {
    return {
      kind: 'base',
      display: requestedLength ? 'major base length' : 'major base depth',
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.depth,
      rows: (flat) => flat.bases.filter((row) => row.kind === 'MAJOR'),
    };
  }

  if (includesAny(q, ['expansion base', 'exp-base', 'post expansion base'])) {
    return {
      kind: 'base',
      display: requestedLength ? 'expansion-base length' : 'expansion-base depth',
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.depth,
      rows: (flat) => flat.bases.filter((row) => row.kind === 'EXPANSION'),
    };
  }

  if (includesAny(q, ['base length', 'base depth', 'bases'])) {
    return {
      kind: 'base',
      display: requestedLength ? 'base length' : 'base depth',
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.depth,
      rows: (flat) => flat.bases,
    };
  }

  if (includesAny(q, ['expansion length', 'expansion %', 'expansion size', 'expansion'])) {
    return {
      kind: 'expansion',
      display: requestedLength ? 'expansion length' : 'expansion %',
      unit: requestedLength ? 'bars' : 'percent',
      getter: requestedLength ? (row) => row.length : (row) => row.pct,
      rows: (flat) => flat.expansions,
    };
  }

  if (includesAny(q, ['cycle days', 'move days', 'move length'])) {
    return {
      kind: 'move',
      display: 'move days',
      unit: 'bars',
      getter: (row) => row.moveDays,
      rows: (flat) => flat.moves,
    };
  }

  if (includesAny(q, ['total move', 'move %', 'move size'])) {
    return {
      kind: 'entry',
      display: 'total move %',
      unit: 'percent',
      getter: (entry) => entry.effectiveMove,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['initial move'])) {
    return {
      kind: 'entry',
      display: 'initial move %',
      unit: 'percent',
      getter: (entry) => entry.effectiveInitialMove,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['dip before move', 'dip'])) {
    return {
      kind: 'entry',
      display: 'dip before move %',
      unit: 'percent',
      getter: (entry) => entry.dipBeforeMove,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['stage 4', 'stage-4'])) {
    return {
      kind: 'entry',
      display: 'stage-4 decline %',
      unit: 'percent',
      getter: (entry) => entry.stage4Decline,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['supermbi', 'mbi'])) {
    return {
      kind: 'entry',
      display: 'SuperMBI',
      unit: 'number',
      getter: (entry) => entry.mbiScore,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['circuit'])) {
    return {
      kind: 'entry',
      display: 'circuits',
      unit: 'number',
      getter: (entry) => entry.circuits,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['move count', 'number of moves'])) {
    return {
      kind: 'entry',
      display: 'move count',
      unit: 'number',
      getter: (entry) => entry.pattern?.moveCount,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['expansion count', 'number of expansions'])) {
    return {
      kind: 'entry',
      display: 'expansion count',
      unit: 'number',
      getter: (entry) => entry.pattern?.totalExpansions,
      rows: (flat, entries) => entries,
    };
  }

  if (includesAny(q, ['base count', 'number of bases'])) {
    return {
      kind: 'entry',
      display: 'base count',
      unit: 'number',
      getter: (entry) => entry.pattern?.totalBases,
      rows: (flat, entries) => entries,
    };
  }

  return null;
}

export function answerWinnerQuestion(question, entries = [], summary = {}, flat = {}, options = {}) {
  const q = normalizeQuestion(question);
  const currency = options.currency || 'INR';
  if (!q) {
    return buildError('Ask a winner-database question', [
      'Examples: “What is avg E1 length?”, “What is avg base length?”, “What is avg E1B depth?”, “What is avg Move 2 %?”',
      'The answer uses your current filtered Winner DB scope.',
    ]);
  }

  if (includesAny(q, ['how many stocks', 'how many names'])) {
    return buildResult({
      title: 'Stocks in current filter',
      answer: formatNumber(summary.uniqueStocks || 0, 0),
      details: [`${summary.count || 0} record(s) match the current Winner DB filters.`],
      tone: 'neutral',
    });
  }
  if (includesAny(q, ['how many records', 'how many winners', 'count of winners'])) {
    return buildResult({
      title: 'Winner records in current filter',
      answer: formatNumber(summary.count || 0, 0),
      details: [`${summary.uniqueStocks || 0} unique stock(s) in the current filtered Winner DB scope.`],
      tone: 'neutral',
    });
  }

  const target = detectWinnerTarget(q);
  if (!target) {
    return buildError('I could not parse that winner-database question.', [
      'Try: “What is avg E1 length?”, “What is avg base depth?”, “What is avg E1B length?”, “What is avg Move 2 days?”, or “What is avg total move?”',
    ]);
  }

  const rows = target.rows(flat, entries) || [];
  const operation = detectOperation(q);
  const values = valuesFrom(rows, target.getter);
  if (!values.length) {
    return buildError(`No ${target.display} data matched that question.`, ['Add more cycle-map data or relax the current Winner DB filters.']);
  }

  const resultValue = metricAggregation(values, operation);
  const sampleStocks = uniqueCount(rows, (row) => row.stockName);
  const details = [`${values.length} sample(s) across ${sampleStocks} stock(s) in the current filtered Winner DB scope.`];
  const med = median(values);
  const p80 = percentile(values, 0.8);
  if (operation !== 'median' && med != null) details.push(`Median ${target.display}: ${formatValueByUnit(med, target.unit, currency)}.`);
  if (p80 != null) {
    if (target.unit === 'percent') details.push(`80th percentile ${target.display}: ${formatValueByUnit(p80, target.unit, currency)}.`);
    if (target.unit === 'bars') details.push(`80th percentile ${target.display}: ${formatValueByUnit(p80, target.unit, currency)}.`);
  }
  if (target.display.toLowerCase().includes('base depth')) {
    details.push('Use the 80th percentile as a practical guide for how much shakeout strong leaders can tolerate before the next leg.');
  }
  if (target.display.toLowerCase().includes('length')) {
    details.push('Lengths are useful for timing expectations: much longer than the 80th percentile is less typical in your current filtered sample.');
  }

  const opLabelMap = {
    avg: 'Average',
    median: 'Median',
    min: 'Lowest',
    max: 'Highest',
    sum: 'Total',
    count: 'Count of',
  };

  return buildResult({
    title: `${opLabelMap[operation] || 'Average'} ${target.display}`,
    answer: operation === 'count' ? formatNumber(resultValue, 0) : formatValueByUnit(resultValue, target.unit, currency),
    details,
    tone: operation === 'max' ? 'positive' : target.display.toLowerCase().includes('depth') ? 'warning' : 'neutral',
  });
}
