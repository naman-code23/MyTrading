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

function winnerDateStamp(entry = {}) {
  const raw = entry.breakoutDate || entry.createdAt || entry.updatedAt;
  const stamp = new Date(raw).getTime();
  return Number.isFinite(stamp) ? stamp : null;
}

export function normalizeWinnerPayload(payload = {}) {
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
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

function includesText(entry, text) {
  if (!text) return true;
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
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(text);
}

function hasAtLeast(entry, field, minValue) {
  return entry[field] != null && Number(entry[field]) >= minValue;
}

function hasAtMost(entry, field, maxValue) {
  return entry[field] != null && Number(entry[field]) <= maxValue;
}

export function filterWinnerEntries(entries = [], filters = {}) {
  const text = String(filters.search || '').trim().toLowerCase();
  const minMove = Number(filters.minMove || 0);
  const minInitialMove = Number(filters.minInitialMove || 0);
  const maxStage4Decline = Number(filters.maxStage4Decline || 0);
  const minMbi = Number(filters.minMbi || 0);

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
    if (maxStage4Decline > 0 && !hasAtMost(entry, 'stage4Decline', maxStage4Decline)) return false;
    if (minMbi > 0 && !hasAtLeast(entry, 'mbiScore', minMbi)) return false;

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
        return compareNullableNumbers(a.move, b.move, 'ASC');
      case 'MOVE_DESC':
        return compareNullableNumbers(a.move, b.move, 'DESC');
      case 'INITIAL_DESC':
        return compareNullableNumbers(a.initialMove, b.initialMove, 'DESC');
      case 'BASE_DESC':
        return compareNullableNumbers(a.baseLength, b.baseLength, 'DESC');
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
  const values = entries.map((entry) => entry[field]).filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

export function summarizeWinnerEntries(entries = []) {
  const count = entries.length;
  const uniqueStocks = new Set(entries.map((entry) => String(entry.stockName || '').trim()).filter(Boolean)).size;
  const withImages = entries.filter((entry) => entry.imageUrl).length;
  return {
    count,
    uniqueStocks,
    avgMove: averageNumericField(entries, 'move'),
    avgInitialMove: averageNumericField(entries, 'initialMove'),
    avgBaseLength: averageNumericField(entries, 'baseLength'),
    avgStage4Decline: averageNumericField(entries, 'stage4Decline'),
    avgCircuits: averageNumericField(entries, 'circuits'),
    withImages,
  };
}
