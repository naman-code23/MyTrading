import { parseTags, round } from './utils.js';

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

function normalizeTags(value) {
  return parseTags(value || []);
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
  const items = values
    .map(toNullableNumber)
    .filter((value) => value != null)
    .sort((a, b) => a - b);
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

function normalizeWinnerBase(rawBase = {}) {
  return {
    length: toNullableNumber(rawBase.length ?? rawBase.baseLength),
    depth: toNullableNumber(rawBase.depth ?? rawBase.baseDepth),
    tags: normalizeTags(rawBase.tags || rawBase.baseTags),
    notes: String(rawBase.notes || rawBase.baseNotes || '').trim(),
  };
}

function baseHasAnyContent(base = {}) {
  return base.length != null
    || base.depth != null
    || (base.tags || []).length > 0
    || Boolean(String(base.notes || '').trim());
}

function normalizeWinnerExpansion(rawExpansion = {}, moveIndex = 0, expansionIndex = 0) {
  const source = rawExpansion != null && typeof rawExpansion === 'object' && !Array.isArray(rawExpansion)
    ? rawExpansion
    : { pct: rawExpansion };
  const baseSource = source.base || {
    length: source.baseLength,
    depth: source.baseDepth,
    tags: source.baseTags,
    notes: source.baseNotes,
  };
  const base = normalizeWinnerBase(baseSource);
  return {
    id: String(source.id || `move_${moveIndex + 1}_exp_${expansionIndex + 1}`).trim(),
    index: expansionIndex + 1,
    label: String(source.label || `E${expansionIndex + 1}`).trim() || `E${expansionIndex + 1}`,
    pct: toNullableNumber(source.pct ?? source.expansionPct ?? source.value ?? source.expansion),
    length: toNullableNumber(source.length ?? source.days ?? source.expansionLength),
    tags: normalizeTags(source.tags),
    notes: String(source.notes || '').trim(),
    base,
  };
}

function expansionHasAnyContent(expansion = {}) {
  return expansion.pct != null
    || expansion.length != null
    || (expansion.tags || []).length > 0
    || Boolean(String(expansion.notes || '').trim())
    || baseHasAnyContent(expansion.base || {});
}

function buildLegacyMoveExpansions(rawMove = {}) {
  const expansions = [];
  const breakoutExpansions = Array.isArray(rawMove.breakoutExpansions)
    ? rawMove.breakoutExpansions
    : [rawMove.e1b, rawMove.e2b, rawMove.e3b];
  breakoutExpansions.forEach((value, index) => {
    const pct = toNullableNumber(value);
    if (pct != null) expansions.push({ pct, label: `E${index + 1}` });
  });

  const legacyBases = Array.isArray(rawMove.bases) ? rawMove.bases : [];
  legacyBases.forEach((legacyBase = {}, baseIndex) => {
    const normalizedBase = normalizeWinnerBase(legacyBase);
    const postBaseExpansions = Array.isArray(legacyBase.expansions)
      ? legacyBase.expansions.map((value) => toNullableNumber(value)).filter((value) => value != null)
      : [];

    if (!postBaseExpansions.length && baseHasAnyContent(normalizedBase)) {
      expansions.push({
        pct: null,
        length: null,
        label: `E${expansions.length + 1}`,
        base: normalizedBase,
      });
      return;
    }

    postBaseExpansions.forEach((pct, expansionIndex) => {
      expansions.push({
        pct,
        label: `E${expansions.length + 1}`,
        base: expansionIndex === 0 ? normalizedBase : undefined,
      });
    });

    if (!postBaseExpansions.length && (legacyBase.length != null || legacyBase.depth != null)) {
      expansions.push({
        pct: null,
        label: `E${baseIndex + 1}`,
        base: normalizedBase,
      });
    }
  });

  return expansions;
}

export function normalizeWinnerMove(rawMove = {}, moveIndex = 0) {
  const needsLegacyConversion = !Array.isArray(rawMove.expansions)
    && (
      Array.isArray(rawMove.breakoutExpansions)
      || Array.isArray(rawMove.bases)
      || rawMove.e1b != null
      || rawMove.e2b != null
      || rawMove.e3b != null
    );

  const source = needsLegacyConversion
    ? { ...rawMove, expansions: buildLegacyMoveExpansions(rawMove) }
    : rawMove;

  const preMoveBase = normalizeWinnerBase(source.preMoveBase || source.majorBase || source.anchorBase || {});
  const expansions = (Array.isArray(source.expansions) ? source.expansions : [])
    .map((expansion, index) => normalizeWinnerExpansion(expansion, moveIndex, index))
    .filter(expansionHasAnyContent);

  const expansionPcts = expansions.map((expansion) => expansion.pct).filter((value) => value != null);
  const expansionLengths = expansions.map((expansion) => expansion.length).filter((value) => value != null);
  const expansionBases = expansions.map((expansion) => expansion.base).filter(baseHasAnyContent);
  const expansionBaseLengths = expansionBases.map((base) => base.length).filter((value) => value != null);
  const expansionBaseDepths = expansionBases.map((base) => base.depth).filter((value) => value != null);

  const explicitMovePct = toNullableNumber(source.movePct ?? source.move ?? source.totalMovePct);
  const explicitMoveDays = toNullableNumber(source.moveDays ?? source.days ?? source.totalMoveDays);

  return {
    id: String(source.id || `move_${moveIndex + 1}`).trim(),
    index: moveIndex + 1,
    label: String(source.label || `Move ${moveIndex + 1}`).trim() || `Move ${moveIndex + 1}`,
    movePct: explicitMovePct,
    moveDays: explicitMoveDays,
    tags: normalizeTags(source.tags),
    notes: String(source.notes || '').trim(),
    preMoveBase,
    expansions,
    autoMovePct: explicitMovePct != null ? explicitMovePct : sumNullableNumbers(expansionPcts),
    autoMoveDays: explicitMoveDays != null ? explicitMoveDays : sumNullableNumbers(expansionLengths),
    expansionCount: expansions.length,
    avgExpansion: averageNullableNumbers(expansionPcts),
    maxExpansion: maxNullableNumbers(expansionPcts),
    avgExpansionLength: averageNullableNumbers(expansionLengths),
    maxExpansionLength: maxNullableNumbers(expansionLengths),
    expansionBaseCount: expansionBases.length,
    avgExpansionBaseLength: averageNullableNumbers(expansionBaseLengths),
    maxExpansionBaseLength: maxNullableNumbers(expansionBaseLengths),
    avgExpansionBaseDepth: averageNullableNumbers(expansionBaseDepths),
    maxExpansionBaseDepth: maxNullableNumbers(expansionBaseDepths),
  };
}

function moveHasAnyContent(move = {}) {
  return move.movePct != null
    || move.moveDays != null
    || (move.tags || []).length > 0
    || Boolean(String(move.notes || '').trim())
    || baseHasAnyContent(move.preMoveBase || {})
    || (move.expansions || []).some(expansionHasAnyContent);
}

export function normalizeWinnerMoves(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((rawMove, index) => normalizeWinnerMove(rawMove, index))
    .filter(moveHasAnyContent);
}

export function summarizeWinnerPattern(moves = []) {
  const normalizedMoves = normalizeWinnerMoves(moves);
  const expansions = normalizedMoves.flatMap((move) => move.expansions || []);
  const expansionPcts = expansions.map((expansion) => expansion.pct).filter((value) => value != null);
  const expansionLengths = expansions.map((expansion) => expansion.length).filter((value) => value != null);
  const preMoveBases = normalizedMoves.map((move) => move.preMoveBase).filter(baseHasAnyContent);
  const expansionBases = expansions.map((expansion) => expansion.base).filter(baseHasAnyContent);
  const allBases = [...preMoveBases, ...expansionBases];
  const allBaseLengths = allBases.map((base) => base.length).filter((value) => value != null);
  const allBaseDepths = allBases.map((base) => base.depth).filter((value) => value != null);
  const preMoveBaseLengths = preMoveBases.map((base) => base.length).filter((value) => value != null);
  const preMoveBaseDepths = preMoveBases.map((base) => base.depth).filter((value) => value != null);
  const expansionBaseLengths = expansionBases.map((base) => base.length).filter((value) => value != null);
  const expansionBaseDepths = expansionBases.map((base) => base.depth).filter((value) => value != null);
  const moveTotals = normalizedMoves.map((move) => move.autoMovePct).filter((value) => value != null);
  const moveDays = normalizedMoves.map((move) => move.autoMoveDays).filter((value) => value != null);
  const firstMoveExpansionPcts = normalizedMoves[0]?.expansions?.map((expansion) => expansion.pct).filter((value) => value != null) || [];

  return {
    moves: normalizedMoves,
    moveCount: normalizedMoves.length,
    totalExpansions: expansions.length,
    totalMajorBases: preMoveBases.length,
    totalExpansionBases: expansionBases.length,
    totalBases: allBases.length,
    totalMovePctAuto: sumNullableNumbers(moveTotals),
    avgMovePctAuto: averageNullableNumbers(moveTotals),
    maxMovePctAuto: maxNullableNumbers(moveTotals),
    totalMoveDaysAuto: sumNullableNumbers(moveDays),
    avgMoveDaysAuto: averageNullableNumbers(moveDays),
    maxMoveDaysAuto: maxNullableNumbers(moveDays),
    avgExpansion: averageNullableNumbers(expansionPcts),
    maxExpansion: maxNullableNumbers(expansionPcts),
    expansionP80: percentileNullableNumbers(expansionPcts, 0.8),
    avgExpansionLength: averageNullableNumbers(expansionLengths),
    maxExpansionLength: maxNullableNumbers(expansionLengths),
    expansionLengthP80: percentileNullableNumbers(expansionLengths, 0.8),
    avgMajorBaseLength: averageNullableNumbers(preMoveBaseLengths),
    maxMajorBaseLength: maxNullableNumbers(preMoveBaseLengths),
    avgMajorBaseDepth: averageNullableNumbers(preMoveBaseDepths),
    maxMajorBaseDepth: maxNullableNumbers(preMoveBaseDepths),
    majorBaseDepthP80: percentileNullableNumbers(preMoveBaseDepths, 0.8),
    avgExpansionBaseLength: averageNullableNumbers(expansionBaseLengths),
    maxExpansionBaseLength: maxNullableNumbers(expansionBaseLengths),
    avgExpansionBaseDepth: averageNullableNumbers(expansionBaseDepths),
    maxExpansionBaseDepth: maxNullableNumbers(expansionBaseDepths),
    expansionBaseDepthP80: percentileNullableNumbers(expansionBaseDepths, 0.8),
    avgBaseLength: averageNullableNumbers(allBaseLengths),
    maxBaseLength: maxNullableNumbers(allBaseLengths),
    avgBaseDepth: averageNullableNumbers(allBaseDepths),
    maxBaseDepth: maxNullableNumbers(allBaseDepths),
    baseDepthP80: percentileNullableNumbers(allBaseDepths, 0.8),
    initialExpansionTotal: sumNullableNumbers(firstMoveExpansionPcts),
  };
}

function effectiveMetric(entry, metric) {
  switch (metric) {
    case 'move':
      return entry.move != null ? entry.move : entry.pattern?.totalMovePctAuto ?? null;
    case 'moveDays':
      return entry.pattern?.totalMoveDaysAuto ?? null;
    case 'initialMove':
      return entry.initialMove != null ? entry.initialMove : entry.pattern?.initialExpansionTotal ?? null;
    case 'baseLength':
      return entry.baseLength != null ? entry.baseLength : entry.pattern?.maxMajorBaseLength ?? entry.pattern?.avgBaseLength ?? null;
    case 'moveCount':
      return entry.pattern?.moveCount ?? 0;
    case 'expansionCount':
      return entry.pattern?.totalExpansions ?? 0;
    case 'baseCount':
      return entry.pattern?.totalBases ?? 0;
    case 'majorBaseCount':
      return entry.pattern?.totalMajorBases ?? 0;
    case 'expansionBaseCount':
      return entry.pattern?.totalExpansionBases ?? 0;
    case 'avgExpansion':
      return entry.pattern?.avgExpansion ?? null;
    case 'maxExpansion':
      return entry.pattern?.maxExpansion ?? null;
    case 'avgExpansionLength':
      return entry.pattern?.avgExpansionLength ?? null;
    case 'maxExpansionLength':
      return entry.pattern?.maxExpansionLength ?? null;
    case 'biggestBase':
      return entry.pattern?.maxBaseLength ?? null;
    case 'deepestBase':
      return entry.pattern?.maxBaseDepth ?? null;
    case 'majorBaseLength':
      return entry.pattern?.maxMajorBaseLength ?? null;
    case 'majorBaseDepth':
      return entry.pattern?.maxMajorBaseDepth ?? null;
    case 'expansionBaseLength':
      return entry.pattern?.maxExpansionBaseLength ?? null;
    case 'expansionBaseDepth':
      return entry.pattern?.maxExpansionBaseDepth ?? null;
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
    tags: normalizeTags(payload.tags),
    moves,
    pattern,
    effectiveInitialMove: toNullableNumber(payload.initialMove) ?? pattern.initialExpansionTotal ?? null,
    effectiveBaseLength: toNullableNumber(payload.baseLength) ?? pattern.maxMajorBaseLength ?? pattern.avgBaseLength ?? null,
    effectiveMove: toNullableNumber(payload.move) ?? pattern.totalMovePctAuto ?? null,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

function collectWinnerSearchText(entry = {}) {
  const nested = (entry.moves || []).flatMap((move) => [
    move.label,
    move.notes,
    ...(move.tags || []),
    move.preMoveBase?.notes,
    ...(move.preMoveBase?.tags || []),
    ...(move.expansions || []).flatMap((expansion) => [
      expansion.label,
      expansion.notes,
      ...(expansion.tags || []),
      expansion.base?.notes,
      ...(expansion.base?.tags || []),
    ]),
  ]);

  return [
    entry.stockName,
    entry.sector,
    entry.type,
    entry.setup,
    entry.period,
    entry.timeframe,
    entry.breakoutDate,
    entry.notes,
    ...(entry.tags || []),
    ...nested,
  ].join(' ').toLowerCase();
}

function includesText(entry, text) {
  if (!text) return true;
  return collectWinnerSearchText(entry).includes(text);
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
  const minExpansionCount = Number(filters.minExpansionCount || 0);
  const minBaseCount = Number(filters.minBaseCount || 0);
  const minMoveDays = Number(filters.minMoveDays || 0);
  const minAvgExpansion = Number(filters.minAvgExpansion || 0);
  const minMaxExpansion = Number(filters.minMaxExpansion || 0);
  const minAvgExpansionLength = Number(filters.minAvgExpansionLength || 0);
  const minMaxExpansionLength = Number(filters.minMaxExpansionLength || 0);
  const minMajorBaseLength = Number(filters.minMajorBaseLength || 0);
  const maxMajorBaseDepth = Number(filters.maxMajorBaseDepth || 0);
  const minExpansionBaseLength = Number(filters.minExpansionBaseLength || 0);
  const maxExpansionBaseDepth = Number(filters.maxExpansionBaseDepth || 0);

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
    if (minExpansionCount > 0 && !hasAtLeast(entry, 'expansionCount', minExpansionCount)) return false;
    if (minBaseCount > 0 && !hasAtLeast(entry, 'baseCount', minBaseCount)) return false;
    if (minMoveDays > 0 && !hasAtLeast(entry, 'moveDays', minMoveDays)) return false;
    if (minAvgExpansion > 0 && !hasAtLeast(entry, 'avgExpansion', minAvgExpansion)) return false;
    if (minMaxExpansion > 0 && !hasAtLeast(entry, 'maxExpansion', minMaxExpansion)) return false;
    if (minAvgExpansionLength > 0 && !hasAtLeast(entry, 'avgExpansionLength', minAvgExpansionLength)) return false;
    if (minMaxExpansionLength > 0 && !hasAtLeast(entry, 'maxExpansionLength', minMaxExpansionLength)) return false;
    if (minMajorBaseLength > 0 && !hasAtLeast(entry, 'majorBaseLength', minMajorBaseLength)) return false;
    if (maxMajorBaseDepth > 0 && !hasAtMost(entry, 'majorBaseDepth', maxMajorBaseDepth)) return false;
    if (minExpansionBaseLength > 0 && !hasAtLeast(entry, 'expansionBaseLength', minExpansionBaseLength)) return false;
    if (maxExpansionBaseDepth > 0 && !hasAtMost(entry, 'expansionBaseDepth', maxExpansionBaseDepth)) return false;

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
      case 'MOVEDAYS_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'moveDays'), effectiveMetric(b, 'moveDays'), 'DESC');
      case 'MOVECOUNT_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'moveCount'), effectiveMetric(b, 'moveCount'), 'DESC');
      case 'EXPCOUNT_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'expansionCount'), effectiveMetric(b, 'expansionCount'), 'DESC');
      case 'BASECOUNT_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'baseCount'), effectiveMetric(b, 'baseCount'), 'DESC');
      case 'AVGEXP_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'avgExpansion'), effectiveMetric(b, 'avgExpansion'), 'DESC');
      case 'MAXEXP_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'maxExpansion'), effectiveMetric(b, 'maxExpansion'), 'DESC');
      case 'AVGEXPLEN_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'avgExpansionLength'), effectiveMetric(b, 'avgExpansionLength'), 'DESC');
      case 'MAXEXPLEN_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'maxExpansionLength'), effectiveMetric(b, 'maxExpansionLength'), 'DESC');
      case 'MAJORBASE_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'majorBaseLength'), effectiveMetric(b, 'majorBaseLength'), 'DESC');
      case 'MAJORDEPTH_ASC':
        return compareNullableNumbers(effectiveMetric(a, 'majorBaseDepth'), effectiveMetric(b, 'majorBaseDepth'), 'ASC');
      case 'EXPBASE_DESC':
        return compareNullableNumbers(effectiveMetric(a, 'expansionBaseLength'), effectiveMetric(b, 'expansionBaseLength'), 'DESC');
      case 'EXPDEPTH_ASC':
        return compareNullableNumbers(effectiveMetric(a, 'expansionBaseDepth'), effectiveMetric(b, 'expansionBaseDepth'), 'ASC');
      case 'DIP_ASC':
        return compareNullableNumbers(a.dipBeforeMove, b.dipBeforeMove, 'ASC');
      case 'DIP_DESC':
        return compareNullableNumbers(a.dipBeforeMove, b.dipBeforeMove, 'DESC');
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
  const values = entries
    .map((entry) => effectiveMetric(entry, field))
    .filter((value) => value != null && Number.isFinite(Number(value)))
    .map(Number);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function percentileNumericField(entries, field, percentile = 0.8) {
  const values = entries
    .map((entry) => effectiveMetric(entry, field))
    .filter((value) => value != null && Number.isFinite(Number(value)))
    .map(Number)
    .sort((a, b) => a - b);
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
    withImages,
    avgMove,
    avgInitialMove: averageNumericField(entries, 'initialMove'),
    avgMoveDays: averageNumericField(entries, 'moveDays'),
    moveDaysP80: percentileNumericField(entries, 'moveDays', 0.8),
    avgDipBeforeMove,
    dipP80: percentileNumericField(entries, 'dipBeforeMove', 0.8),
    avgMoveToDip: avgMove != null && avgDipBeforeMove != null && avgDipBeforeMove > 0 ? round(avgMove / avgDipBeforeMove, 2) : null,
    avgBaseLength: averageNumericField(entries, 'baseLength'),
    avgStage4Decline: averageNumericField(entries, 'stage4Decline'),
    avgCircuits: averageNumericField(entries, 'circuits'),
    avgMoveCount: averageNumericField(entries, 'moveCount'),
    avgExpansionCount: averageNumericField(entries, 'expansionCount'),
    avgBaseCount: averageNumericField(entries, 'baseCount'),
    avgExpansion: averageNumericField(entries, 'avgExpansion'),
    avgMaxExpansion: averageNumericField(entries, 'maxExpansion'),
    expansionP80: percentileNumericField(entries, 'maxExpansion', 0.8),
    avgExpansionLength: averageNumericField(entries, 'avgExpansionLength'),
    avgMaxExpansionLength: averageNumericField(entries, 'maxExpansionLength'),
    expansionLengthP80: percentileNumericField(entries, 'maxExpansionLength', 0.8),
    avgMajorBaseLength: averageNumericField(entries, 'majorBaseLength'),
    avgMajorBaseDepth: averageNumericField(entries, 'majorBaseDepth'),
    majorBaseDepthP80: percentileNumericField(entries, 'majorBaseDepth', 0.8),
    avgExpansionBaseLength: averageNumericField(entries, 'expansionBaseLength'),
    avgExpansionBaseDepth: averageNumericField(entries, 'expansionBaseDepth'),
    expansionBaseDepthP80: percentileNumericField(entries, 'expansionBaseDepth', 0.8),
    avgBiggestBase: averageNumericField(entries, 'biggestBase'),
    avgDeepestBase: averageNumericField(entries, 'deepestBase'),
    patternCoverageCount: entries.filter((entry) => (entry.pattern?.moveCount || 0) > 0).length,
    dipSampleCount: entries.filter((entry) => entry.dipBeforeMove != null && Number.isFinite(Number(entry.dipBeforeMove))).length,
    moveDaySampleCount: entries.filter((entry) => effectiveMetric(entry, 'moveDays') != null).length,
    majorBaseSampleCount: entries.filter((entry) => effectiveMetric(entry, 'majorBaseDepth') != null || effectiveMetric(entry, 'majorBaseLength') != null).length,
    expansionBaseSampleCount: entries.filter((entry) => effectiveMetric(entry, 'expansionBaseDepth') != null || effectiveMetric(entry, 'expansionBaseLength') != null).length,
    expansionLengthSampleCount: entries.filter((entry) => effectiveMetric(entry, 'avgExpansionLength') != null).length,
  };
}
