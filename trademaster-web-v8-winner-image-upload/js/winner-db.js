import { parseTags, round } from './utils.js';

function toNumber(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeWinnerPayload(payload = {}) {
  return {
    id: payload.id || '',
    stockName: String(payload.stockName || '').trim().toUpperCase(),
    sector: String(payload.sector || '').trim(),
    type: String(payload.type || '').trim(),
    setup: String(payload.setup || '').trim(),
    timeframe: String(payload.timeframe || '').trim().toUpperCase(),
    circuits: toNumber(payload.circuits),
    period: String(payload.period || '').trim(),
    breakoutDate: String(payload.breakoutDate || '').trim(),
    initialMove: toNumber(payload.initialMove),
    baseLength: toNumber(payload.baseLength),
    move: toNumber(payload.move),
    stage4Decline: toNumber(payload.stage4Decline),
    mbiScore: payload.mbiScore === '' || payload.mbiScore == null ? null : toNumber(payload.mbiScore),
    imageUrl: String(payload.imageUrl || '').trim(),
    imageStoragePath: String(payload.imageStoragePath || '').trim(),
    imageBytes: payload.imageBytes === '' || payload.imageBytes == null ? null : toNumber(payload.imageBytes),
    imageContentType: String(payload.imageContentType || '').trim(),
    imageWidth: payload.imageWidth === '' || payload.imageWidth == null ? null : toNumber(payload.imageWidth),
    imageHeight: payload.imageHeight === '' || payload.imageHeight == null ? null : toNumber(payload.imageHeight),
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
    entry.notes,
    ...(entry.tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(text);
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
    if (minMove > 0 && !(Number(entry.move || 0) >= minMove)) return false;
    if (minInitialMove > 0 && !(Number(entry.initialMove || 0) >= minInitialMove)) return false;
    if (maxStage4Decline > 0 && !(Number(entry.stage4Decline || 0) <= maxStage4Decline)) return false;
    if (minMbi > 0 && !((entry.mbiScore ?? -Infinity) >= minMbi)) return false;

    if (filters.fromDate || filters.toDate) {
      const dateValue = entry.breakoutDate || entry.createdAt;
      const stamp = new Date(dateValue).getTime();
      if (Number.isNaN(stamp)) return false;
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
        return Number(a.move || 0) - Number(b.move || 0);
      case 'MOVE_DESC':
        return Number(b.move || 0) - Number(a.move || 0);
      case 'INITIAL_DESC':
        return Number(b.initialMove || 0) - Number(a.initialMove || 0);
      case 'BASE_DESC':
        return Number(b.baseLength || 0) - Number(a.baseLength || 0);
      case 'STAGE4_ASC':
        return Number(a.stage4Decline || 0) - Number(b.stage4Decline || 0);
      case 'CIRCUIT_DESC':
        return Number(b.circuits || 0) - Number(a.circuits || 0);
      case 'MBI_DESC':
        return Number(b.mbiScore || -Infinity) - Number(a.mbiScore || -Infinity);
      case 'NAME_ASC':
        return String(a.stockName || '').localeCompare(String(b.stockName || ''));
      case 'DATE_ASC':
        return new Date(a.breakoutDate || a.createdAt || 0).getTime() - new Date(b.breakoutDate || b.createdAt || 0).getTime();
      case 'DATE_DESC':
      default:
        return new Date(b.breakoutDate || b.createdAt || 0).getTime() - new Date(a.breakoutDate || a.createdAt || 0).getTime();
    }
  });
  return items;
}

export function summarizeWinnerEntries(entries = []) {
  const count = entries.length;
  const average = (field) => (count ? round(entries.reduce((sum, entry) => sum + Number(entry[field] || 0), 0) / count, 2) : 0);
  const uniqueStocks = new Set(entries.map((entry) => entry.stockName).filter(Boolean)).size;
  const withImages = entries.filter((entry) => entry.imageUrl).length;
  return {
    count,
    uniqueStocks,
    avgMove: average('move'),
    avgInitialMove: average('initialMove'),
    avgBaseLength: average('baseLength'),
    avgStage4Decline: average('stage4Decline'),
    avgCircuits: average('circuits'),
    withImages,
  };
}
