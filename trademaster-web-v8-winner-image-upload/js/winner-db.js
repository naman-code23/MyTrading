import { parseTags, round } from './utils.js';

const EXPANSIONS_PER_SLOT = 3;
const BASES_PER_MOVE = 4;

function toNullableNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumbers(a, b, direction = 'DESC') {
  const left = a == null ? null : Number(a);
  const right = b == null ? null : Number(b);
  const leftMissing = left == null || !Number.isFinite(left);
  const rightMissing = right == null || !Number.isFinite(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return direction === 'ASC' ? left - right : right - left;
}

function averageNullableNumbers(values = []) {
  const items = values.map(toNullableNumber).filter((value) => value != null);
  if (!items.length) return null;
  return round(items.reduce((sum, value) => sum + value, 0) / items.length, 2);
}

function sumNullableNumbers(values = []) {
  const items = values.map(toNullableNumber).filter((value) => value != null);
  if (!items.length) return null;
  return round(items.reduce((sum, value) => sum + value, 0), 2);
}

function maxNullableNumbers(values = []) {
  const items = values.map(toNullableNumber).filter((value) => value != null);
  if (!items.length) return null;
  return round(Math.max(...items), 2);
}

function percentileNullableNumbers(values = [], percentile = 0.8) {
  const items = values.map(toNullableNumber).filter((value) => value != null).sort((a, b) => a - b);
  if (!items.length) return null;
  const clamped = Math.max(0, Math.min(1, Number(percentile || 0)));
  const rank = (items.length - 1) * clamped;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return round(items[lower], 2);
  const weight = rank - lower;
  return round(items[lower] + (items[upper] - items[lower]) * weight, 2);
}

function winnerDateStamp(entry = {}) {
  const raw = entry.breakoutDate || entry.createdAt || entry.updatedAt;
  const stamp = new Date(raw).getTime();
  return Number.isFinite(stamp) ? stamp : null;
}

function normalizeExpansionList(values = []) {
  const normalized = Array.from({ length: EXPANSIONS_PER_SLOT }, (_, index) => {
    const source = Array.isArray(values) ? values[index] : undefined;
    return toNullableNumber(source);
  });
  return normalized;
}

function hasExpansionContent(values = []) {
  return values.some((value) => value != null);
}

function normalizeWinnerBase(rawBase = {}, baseIndex = 0) {
  const expansionsSource = Array.isArray(rawBase.expansions)
    ? rawBase.expansions
    : [rawBase.e1, rawBase.e2, rawBase.e3];
  const expansions = normalizeExpansionList(expansionsSource);
  return {
    index: baseIndex + 1,
    label: `B${baseIndex + 1}`,
    length: toNullableNumber(rawBase.length),
    depth: toNullableNumber(rawBase.depth),
    expansions,
  };
}

function baseHasAnyContent(base = {}) {
  return base.length != null || base.depth != null || hasExpansionContent(base.expansions);
}

export function normalizeWinnerMove(rawMove = {}, moveIndex = 0) {
  const breakoutSource = Array.isArray(rawMove.breakoutExpansions)
    ? rawMove.breakoutExpansions
    : [rawMove.e1b, rawMove.e2b, rawMove.e3b];
  const breakoutExpansions = normalizeExpansionList(breakoutSource);
  const basesSource = Array.isArray(rawMove.bases) ? rawMove.bases : [];
  const bases = Array.from({ length: BASES_PER_MOVE }, (_, baseIndex) => normalizeWinnerBase(basesSource[baseIndex] || {}, baseIndex));
  const baseExpansionValues = bases.flatMap((base) => base.expansions).filter((value) => value != null);
  const breakoutValues = breakoutExpansions.filter((value) => value != null);
  const allExpansionValues = [...breakoutValues, ...baseExpansionValues];
  const meaningfulBases = bases.filter(baseHasAnyContent);
  const baseLengths = meaningfulBases.map((base) => base.length).filter((value) => value != null);
  const baseDepths = meaningfulBases.map((base) => base.depth).filter((value) => value != null);
  const explicitMovePct = toNullableNumber(rawMove.movePct ?? rawMove.move ?? rawMove.totalMovePct);
  const autoMovePct = explicitMovePct != null ? explicitMovePct : sumNullableNumbers(allExpansionValues);

  return {
    id: String(rawMove.id || `move_${moveIndex + 1}`).trim(),
    index: moveIndex + 1,
    label: String(rawMove.label || `Move ${moveIndex + 1}`).trim() || `Move ${moveIndex + 1}`,
    movePct: explicitMovePct,
    breakoutExpansions,
    bases,
    breakoutExpansionTotal: sumNullableNumbers(breakoutValues),
    expansionTotal: sumNullableNumbers(allExpansionValues),
    expansionCount: allExpansionValues.length,
    avgExpansion: averageNullableNumbers(allExpansionValues),
    maxExpansion: maxNullableNumbers(allExpansionValues),
    baseCount: meaningfulBases.length,
    avgBaseLength: averageNullableNumbers(baseLengths),
    maxBaseLength: maxNullableNumbers(baseLengths),
    avgBaseDepth: averageNullableNumbers(baseDepths),
    maxBaseDepth: maxNullableNumbers(baseDepths),
    autoMovePct,
  };
}

function moveHasAnyContent(move = {}) {
  return move.movePct != null
    || hasExpansionContent(move.breakoutExpansions)
    || (move.bases || []).some(baseHasAnyContent);
}

export function normalizeWinnerMoves(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((rawMove, index) => normalizeWinnerMove(rawMove, index))
    .filter(moveHasAnyContent);
}

export function summarizeWinnerPattern(moves = []) {
  const normalizedMoves = normalizeWinnerMoves(moves);
  const allExpansions = normalizedMoves.flatMap((move) => [
    ...(move.breakoutExpansions || []),
    ...(move.bases || []).flatMap((base) => base.expansions || []),
  ]).filter((value) => value != null);
  const allBaseLengths = normalizedMoves.flatMap((move) => (move.bases || []).map((base) => base.length)).filter((value) => value != null);
  const allBaseDepths = normalizedMoves.flatMap((move) => (move.bases || []).map((base) => base.depth)).filter((value) => value != null);
  const moveTotals = normalizedMoves.map((move) => move.autoMovePct).filter((value) => value != null);
  const firstMove = normalizedMoves[0];

  return {
    moves: normalizedMoves,
    moveCount: normalizedMoves.length,
    totalBases: normalizedMoves.reduce((sum, move) => sum + (move.baseCount || 0), 0),
    totalExpansions: allExpansions.length,
    totalExpansionPct: sumNullableNumbers(allExpansions),
    avgExpansion: averageNullableNumbers(allExpansions),
    maxExpansion: maxNullableNumbers(allExpansions),
    avgBaseLength: averageNullableNumbers(allBaseLengths),
    maxBaseLength: maxNullableNumbers(allBaseLengths),
    avgBaseDepth: averageNullableNumbers(allBaseDepths),
    maxBaseDepth: maxNullableNumbers(allBaseDepths),
    totalMovePctAuto: sumNullableNumbers(moveTotals),
    avgMovePctAuto: averageNullableNumbers(moveTotals),
    initialExpansionTotal: firstMove?.breakoutExpansionTotal ?? null,
    firstMoveMaxBaseLength: firstMove?.maxBaseLength ?? null,
  };
}

function effectiveMetric(entry, metric) {
  switch (metric) {
    case 'move':
      return entry.move != null ? entry.move : entry.pattern?.totalMovePctAuto ?? null;
    case 'initialMove':
      return entry.initialMove != null ? entry.initialMove : entry.pattern?.initialExpansionTotal ?? null;
    case 'baseLength':
      return entry.baseLength != null ? entry.baseLength : entry.pattern?.avgBaseLength ?? null;
    case 'moveCount':
      return entry.pattern?.moveCount ?? 0;
    case 'baseCount':
      return entry.pattern?.totalBases ?? 0;
    case 'avgExpansion':
      return entry.pattern?.avgExpansion ?? null;
    case 'maxExpansion':
      return entry.pattern?.maxExpansion ?? null;
    case 'biggestBase':
      return entry.pattern?.maxBaseLength ?? null;
    case 'deepestBase':
      return entry.pattern?.maxBaseDepth ?? null;
    default:
      return entry[metric] ?? null;
  }
}

export function normalizeWinnerPayload(payload = {}) {
  const moves = normalizeWinnerMoves(payload.moves || []);
  const pattern = summarizeWinnerPattern(moves);
  return {
    id: payload.id || '',
    stockName: String(payload.stockName || '').trim().toUpperCase(),
    sector: String(payload.sector || '').trim(),
    type: String(payload.type || '').trim(),
    setup: String(payload.setup || '').trim(),
    timeframe: String(payload.timeframe || '').trim().toUpperCase(),
    circuits: toNullableNumber(payload.circuits),
    period: String(payload.period || '').trim(),
    breakoutDate: String(payload.breakoutDate || '').trim(),
    initialMove: toNullableNumber(payload.initialMove),
    baseLength: toNullableNumber(payload.baseLength),
    move: toNullableNumber(payload.move),
    dipBeforeMove: toNullableNumber(payload.dipBeforeMove),
    stage4Decline: toNullableNumber(payload.stage4Decline),
    mbiScore: toNullableNumber(payload.mbiScore),
    imageUrl: String(payload.imageUrl || '').trim(),
    imageStoragePath: String(payload.imageStoragePath || '').trim(),
    imageBytes: toNullableNumber(payload.imageBytes),
    imageContentType: String(payload.imageContentType || '').trim(),
    imageWidth: toNullableNumber(payload.imageWidth),
    imageHeight: toNullableNumber(payload.imageHeight),
    notes: String(payload.notes || '').trim(),
    tags: parseTags(payload.tags || []),
    moves,
    pattern,
    effectiveInitialMove: toNullableNumber(payload.initialMove) ?? pattern.initialExpansionTotal ?? null,
    effectiveBaseLength: toNullableNumber(payload.baseLength) ?? pattern.avgBaseLength ?? null,
    effectiveMove: toNullableNumber(payload.move) ?? pattern.totalMovePctAuto ?? null,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

function includesText(entry, text) {
  if (!text) return true;
  const moveText = (entry.moves || []).map((move) => {
    const baseText = (move.bases || []).map((base) => `${base.label} ${base.length ?? ''} ${base.depth ?? ''} ${(base.expansions || []).filter((value) => value != null).join(' ')}`).join(' ');
    return `${move.label} ${move.movePct ?? ''} ${(move.breakoutExpansions || []).filter((value) => value != null).join(' ')} ${baseText}`;
  }).join(' ');
  const haystack = [
    entry.stockName,
    entry.sector,
    entry.type,
    entry.setup,
    entry.period,
    entry.timeframe,
    entry.breakoutDate,
    entry.notes,
    ...(entry.tags || []),
    moveText,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(text);
}

function hasAtLeast(entry, field, minValue) {
  const value = effectiveMetric(entry, field);
  return value != null && Number(value) >= minValue;
}

function hasAtMost(entry, field, maxValue) {
  const value = effectiveMetric(entry, field);
  return value != null && Number(value) <= maxValue;
}

export function filterWinnerEntries(entries = [], filters = {}) {
  const text = String(filters.search || '').trim().toLowerCase();
  const minMove = Number(filters.minMove || 0);
  const minInitialMove = Number(filters.minInitialMove || 0);
  const maxDipBeforeMove = Number(filters.maxDipBeforeMove || 0);
  const maxStage4Decline = Number(filters.maxStage4Decline || 0);
  const minMbi = Number(filters.minMbi || 0);
  const minMoveCount = Number(filters.minMoveCount || 0);
  const minBaseCount = Number(filters.minBaseCount || 0);
  const minAvgExpansion = Number(filters.minAvgExpansion || 0);
  const minMaxExpansion = Number(filters.minMaxExpansion || 0);
  const minBiggestBaseLength = Number(filters.minBiggestBaseLength || 0);
  const maxDeepestBase = Number(filters.maxDeepestBase || 0);

  return entries.filter((entry) => {
    if (!includesText(entry, text)) return false;
    if (filters.sector && filters.sector !== 'ALL' && (entry.sector || 'Unspecified') !== filters.sector) return false;
    if (filters.type && filters.type !== 'ALL' && (entry.type || 'Unspecified') !== filters.type) return false;
    if (filters.setup && filters.setup !== 'ALL' && (entry.setup || 'Unspecified') !== filters.setup) return false;
    if (filters.timeframe && filters.timeframe !== 'ALL' && (entry.timeframe || 'UNSPECIFIED') !== filters.timeframe) return false;
    if (filters.period && filters.period !== 'ALL' && (entry.period || 'Unspecified') !== filters.period) return false;
    if (filters.hasImage === 'YES' && !entry.imageUrl) return false;
    if (filters.hasImage === 'NO' && entry.imageUrl) return false;
    if (minMove > 0 && !hasAtLeast(entry, 'move', minMove)) return false;
    if (minInitialMove > 0 && !hasAtLeast(entry, 'initialMove', minInitialMove)) return false;
    if (maxDipBeforeMove > 0 && !hasAtMost(entry, 'dipBeforeMove', maxDipBeforeMove)) return false;
    if (maxStage4Decline > 0 && !hasAtMost(entry, 'stage4Decline', maxStage4Decline)) return false;
    if (minMbi > 0 && !hasAtLeast(entry, 'mbiScore', minMbi)) return false;
    if (minMoveCount > 0 && !hasAtLeast(entry, 'moveCount', minMoveCount)) return false;
    if (minBaseCount > 0 && !hasAtLeast(entry, 'baseCount', minBaseCount)) return false;
    if (minAvgExpansion > 0 && !hasAtLeast(entry, 'avgExpansion', minAvgExpansion)) return false;
    if (minMaxExpansion > 0 && !hasAtLeast(entry, 'maxExpansion', minMaxExpansion)) return false;
    if (minBiggestBaseLength > 0 && !hasAtLeast(entry, 'biggestBase', minBiggestBaseLength)) return false;
    if (maxDeepestBase > 0 && !hasAtMost(entry, 'deepestBase', maxDeepestBase)) return false;

    if (filters.fromDate || filters.toDate) {
      const stamp = winnerDateStamp(entry);
      if (stamp == null) return false;
      if (filters.fromDate && stamp < new Date(filters.fromDate).getTime()) return false;
      if (filters.toDate && stamp > new Date(`${filters.toDate}T23:59:59`).getTime()) return false;
    }

    return true;
  });
}

export function sortWinnerEntries(entries = [], sortKey = 'DATE_DESC') {
  const items = [...entries];
  items.sort((a, b) => {
    switch (sortKey) {
      case 'MOVE_ASC':
        return compareNullableNumbers(effectiveMetric(a, 'move'), effectiveMetric(b, 'move'), 'ASC');
      case 'MOVE_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'move'), effectiveMetric(b, 'move'), 'DESC');
      case 'INITIAL_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'initialMove'), effectiveMetric(b, 'initialMove'), 'DESC');
      case 'DIP_ASC':
        return compareNullableNumbers(a.dipBeforeMove, b.dipBeforeMove, 'ASC');
      case 'DIP_DESC':
        return compareNullableNumbers(a.dipBeforeMove, b.dipBeforeMove, 'DESC');
      case 'BASE_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'baseLength'), effectiveMetric(b, 'baseLength'), 'DESC');
      case 'MOVECOUNT_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'moveCount'), effectiveMetric(b, 'moveCount'), 'DESC');
      case 'BASECOUNT_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'baseCount'), effectiveMetric(b, 'baseCount'), 'DESC');
      case 'AVGEXP_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'avgExpansion'), effectiveMetric(b, 'avgExpansion'), 'DESC');
      case 'MAXEXP_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'maxExpansion'), effectiveMetric(b, 'maxExpansion'), 'DESC');
      case 'BIGBASE_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'biggestBase'), effectiveMetric(b, 'biggestBase'), 'DESC');
      case 'DEEPBASE_ASC':
        return compareNullableNumbers(effectiveMetric(a, 'deepestBase'), effectiveMetric(b, 'deepestBase'), 'ASC');
      case 'STAGE4_ASC':
        return compareNullableNumbers(a.stage4Decline, b.stage4Decline, 'ASC');
      case 'CIRCUIT_DESC':
        return compareNullableNumbers(a.circuits, b.circuits, 'DESC');
      case 'MBI_DESC':
        return compareNullableNumbers(a.mbiScore, b.mbiScore, 'DESC');
      case 'NAME_ASC':
        return String(a.stockName || '').localeCompare(String(b.stockName || ''), undefined, { sensitivity: 'base' });
      case 'DATE_ASC': {
        const diff = compareNullableNumbers(winnerDateStamp(a), winnerDateStamp(b), 'ASC');
        if (diff !== 0) return diff;
        return String(a.stockName || '').localeCompare(String(b.stockName || ''), undefined, { sensitivity: 'base' });
      }
      case 'DATE_DESC':
      default: {
        const diff = compareNullableNumbers(winnerDateStamp(a), winnerDateStamp(b), 'DESC');
        if (diff !== 0) return diff;
        return String(a.stockName || '').localeCompare(String(b.stockName || ''), undefined, { sensitivity: 'base' });
      }
    }
  });
  return items;
}

function averageNumericField(entries, field) {
  const values = entries.map((entry) => effectiveMetric(entry, field)).filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function percentileNumericField(entries, field, percentile = 0.8) {
  const values = entries.map((entry) => effectiveMetric(entry, field)).filter((value) => value != null && Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
  if (!values.length) return null;
  const clamped = Math.max(0, Math.min(1, Number(percentile || 0)));
  const rank = (values.length - 1) * clamped;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return round(values[lower], 2);
  const weight = rank - lower;
  return round(values[lower] + (values[upper] - values[lower]) * weight, 2);
}

export function summarizeWinnerEntries(entries = []) {
  const count = entries.length;
  const uniqueStocks = new Set(entries.map((entry) => String(entry.stockName || '').trim()).filter(Boolean)).size;
  const withImages = entries.filter((entry) => entry.imageUrl).length;
  const avgMove = averageNumericField(entries, 'move');
  const avgDipBeforeMove = averageNumericField(entries, 'dipBeforeMove');
  return {
    count,
    uniqueStocks,
    avgMove,
    avgInitialMove: averageNumericField(entries, 'initialMove'),
    avgDipBeforeMove,
    dipP80: percentileNumericField(entries, 'dipBeforeMove', 0.8),
    avgMoveToDip: avgMove != null && avgDipBeforeMove != null && avgDipBeforeMove > 0 ? round(avgMove / avgDipBeforeMove, 2) : null,
    avgBaseLength: averageNumericField(entries, 'baseLength'),
    avgStage4Decline: averageNumericField(entries, 'stage4Decline'),
    avgCircuits: averageNumericField(entries, 'circuits'),
    avgMoveCount: averageNumericField(entries, 'moveCount'),
    avgBaseCount: averageNumericField(entries, 'baseCount'),
    avgExpansion: averageNumericField(entries, 'avgExpansion'),
    avgMaxExpansion: averageNumericField(entries, 'maxExpansion'),
    avgBiggestBase: averageNumericField(entries, 'biggestBase'),
    avgDeepestBase: averageNumericField(entries, 'deepestBase'),
    patternCoverageCount: entries.filter((entry) => (entry.pattern?.moveCount || 0) > 0).length,
    dipSampleCount: entries.filter((entry) => entry.dipBeforeMove != null && Number.isFinite(Number(entry.dipBeforeMove))).length,
    withImages,
  };
}
