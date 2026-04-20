import { normalizeTradePayload } from './trade-engine.js';

const HEADER_ALIASES = {
  symbol: ['symbol', 'tradingsymbol', 'trading_symbol', 'ticker'],
  tradeType: ['trade_type', 'tradetype', 'trade type', 'transaction_type', 'transaction type', 'side', 'action'],
  quantity: ['quantity', 'qty', 'filled_quantity', 'filled quantity'],
  price: ['price', 'trade_price', 'trade price', 'average_price', 'average price'],
  executedAt: ['order_execution_time', 'execution_time', 'execution time', 'timestamp', 'trade_time', 'trade time'],
  tradeDate: ['trade_date', 'trade date', 'date'],
  orderId: ['order_id', 'order id'],
  tradeId: ['trade_id', 'trade id'],
  exchange: ['exchange'],
  segment: ['segment'],
  series: ['series'],
  isin: ['isin'],
};

function normalizeHeaderName(name) {
  return String(name || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

function normalizeCell(value) {
  if (value == null) return '';
  return String(value).replace(/^\ufeff/, '').trim();
}

function findColumn(headers, aliases) {
  const normalized = headers.map(normalizeHeaderName);
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizeHeaderName(alias));
    if (index >= 0) return headers[index];
  }
  return null;
}

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushField();
      pushRow();
    } else if (char === '\r') {
      // ignore carriage returns
    } else {
      field += char;
    }
  }

  pushField();
  if (row.length) pushRow();

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((value) => normalizeCell(value));
  const body = rows.slice(1).filter((record) => record.some((cell) => normalizeCell(cell) !== ''));
  return {
    headers,
    rows: body.map((record) => {
      const item = {};
      headers.forEach((header, idx) => {
        item[header] = normalizeCell(record[idx]);
      });
      return item;
    }),
  };
}

function toNumber(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSide(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'SELL' || raw === 'S') return 'SELL';
  if (raw === 'BUY' || raw === 'B') return 'BUY';
  return '';
}

function normalizeDateTime(executedAt, tradeDate) {
  const stamp = String(executedAt || '').trim();
  if (stamp) {
    const clean = stamp.replace(/\.\d+$/, '');
    return clean.length === 10 ? `${clean}T09:15:00` : clean;
  }
  const day = String(tradeDate || '').trim();
  return day ? `${day}T09:15:00` : '';
}

function stableHash(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sideToDirection(side) {
  return side === 'SELL' ? 'SHORT' : 'LONG';
}

function openingSide(direction) {
  return direction === 'SHORT' ? 'SELL' : 'BUY';
}

function closingSide(direction) {
  return direction === 'SHORT' ? 'BUY' : 'SELL';
}

function buildFillId(fill, qty, splitSuffix = '') {
  return `fill_${stableHash(`${fill.symbol}|${fill.side}|${fill.executedAt}|${fill.orderId || ''}|${fill.tradeId || ''}|${qty}|${splitSuffix}`)}`;
}

function buildTradeId(symbol, direction, fills) {
  const signature = fills
    .map((fill) => `${fill.executedAt}|${fill.side}|${fill.qty}|${fill.price}|${fill.orderId || ''}|${fill.tradeId || ''}`)
    .join('~');
  const slug = symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `imp_${slug}_${direction.toLowerCase()}_${stableHash(signature)}`;
}

function mapColumns(headers) {
  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)]),
  );
}

function mergeExecutions(rows) {
  const buckets = new Map();
  for (const row of [...rows].sort((a, b) => {
    const timeDiff = new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.rowIndex - b.rowIndex;
  })) {
    const token = row.orderId || row.tradeId || `${row.price}|${row.rowIndex}`;
    const key = [
      row.symbol,
      row.side,
      row.executedAt,
      token,
      row.exchange || '',
      row.segment || '',
      row.series || '',
    ].join('|');

    const existing = buckets.get(key) || {
      symbol: row.symbol,
      side: row.side,
      executedAt: row.executedAt,
      orderId: row.orderId || '',
      tradeId: row.tradeId || '',
      exchange: row.exchange || '',
      segment: row.segment || '',
      series: row.series || '',
      isin: row.isin || '',
      qty: 0,
      weightedValue: 0,
      fragmentCount: 0,
      firstRowIndex: row.rowIndex,
      sourceRows: [],
    };

    existing.qty += row.qty;
    existing.weightedValue += row.qty * row.price;
    existing.fragmentCount += 1;
    existing.firstRowIndex = Math.min(existing.firstRowIndex, row.rowIndex);
    existing.sourceRows.push(row);
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      symbol: bucket.symbol,
      side: bucket.side,
      qty: bucket.qty,
      price: bucket.qty ? bucket.weightedValue / bucket.qty : 0,
      executedAt: bucket.executedAt,
      orderId: bucket.orderId,
      tradeId: bucket.tradeId,
      exchange: bucket.exchange,
      segment: bucket.segment,
      series: bucket.series,
      isin: bucket.isin,
      fragmentCount: bucket.fragmentCount,
      firstRowIndex: bucket.firstRowIndex,
      sourceRows: bucket.sourceRows,
    }))
    .sort((a, b) => {
      const timeDiff = new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.firstRowIndex - b.firstRowIndex;
    });
}

function startTrade(fill, cycleIndex, options) {
  return {
    symbol: fill.symbol,
    direction: sideToDirection(fill.side),
    cycleIndex,
    fills: [],
    openQty: 0,
    importMeta: {
      fileName: options.fileName || '',
      source: 'tradebook-csv',
      mergedExecutionCount: 0,
      rawExecutionCount: 0,
      exchanges: new Set(),
      segments: new Set(),
    },
  };
}

function appendPiece(trade, fill, qty, splitSuffix = '') {
  const noteParts = ['Imported from tradebook'];
  if (fill.fragmentCount > 1) noteParts.push(`merged ${fill.fragmentCount} executions`);
  if (fill.orderId) noteParts.push(`order ${fill.orderId}`);
  if (splitSuffix) noteParts.push(splitSuffix);

  trade.importMeta.mergedExecutionCount += 1;
  trade.importMeta.rawExecutionCount += fill.fragmentCount;
  if (fill.exchange) trade.importMeta.exchanges.add(fill.exchange);
  if (fill.segment) trade.importMeta.segments.add(fill.segment);

  const piece = {
    id: buildFillId(fill, qty, splitSuffix),
    executedAt: fill.executedAt,
    side: fill.side,
    qty,
    price: Number(fill.price.toFixed(6)),
    fees: 0,
    note: noteParts.join(' • '),
    orderId: fill.orderId || '',
    tradeId: fill.tradeId || '',
    sourceRows: fill.sourceRows?.map((row) => row.rowIndex) || [],
  };
  trade.fills.push(piece);
}

function finalizeTrade(trade) {
  const firstFill = trade.fills[0];
  const lastFill = trade.fills[trade.fills.length - 1];
  const exchanges = [...trade.importMeta.exchanges].filter(Boolean).sort();
  const segments = [...trade.importMeta.segments].filter(Boolean).sort();
  const importMeta = {
    fileName: trade.importMeta.fileName,
    source: trade.importMeta.source,
    cycleIndex: trade.cycleIndex,
    mergedExecutionCount: trade.importMeta.mergedExecutionCount,
    rawExecutionCount: trade.importMeta.rawExecutionCount,
    exchanges,
    segments,
    importedAt: new Date().toISOString(),
  };

  return normalizeTradePayload({
    id: buildTradeId(trade.symbol, trade.direction, trade.fills),
    symbol: trade.symbol,
    direction: trade.direction,
    strategy: '',
    plannedRisk: 0,
    plannedStop: 0,
    mbiScore: null,
    tags: ['imported', 'tradebook'],
    notes: 'Imported from tradebook CSV.',
    fills: trade.fills,
    createdAt: firstFill?.executedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    importMeta,
    importSource: {
      startedAt: firstFill?.executedAt || '',
      lastActivityAt: lastFill?.executedAt || '',
      exchangeSummary: exchanges.join(', '),
      segmentSummary: segments.join(', '),
    },
  });
}

export function importTradebookCsv(text, options = {}) {
  const parsed = parseCsv(text);
  if (!parsed.headers.length) throw new Error('The CSV file is empty or unreadable.');

  const columns = mapColumns(parsed.headers);
  const required = ['symbol', 'tradeType', 'quantity', 'price'];
  const missing = required.filter((key) => !columns[key]);
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const normalizedRows = [];
  const skippedRows = [];

  parsed.rows.forEach((row, index) => {
    const symbol = normalizeCell(row[columns.symbol]).toUpperCase();
    const side = toSide(row[columns.tradeType]);
    const qty = toNumber(row[columns.quantity]);
    const price = toNumber(row[columns.price]);
    const executedAt = normalizeDateTime(
      columns.executedAt ? row[columns.executedAt] : '',
      columns.tradeDate ? row[columns.tradeDate] : '',
    );

    if (!symbol || !side || !(qty > 0) || !(price > 0) || !executedAt) {
      skippedRows.push({
        kind: 'invalid-row',
        rowIndex: index + 2,
        symbol,
      });
      return;
    }

    normalizedRows.push({
      rowIndex: index + 2,
      symbol,
      side,
      qty,
      price,
      executedAt,
      orderId: columns.orderId ? normalizeCell(row[columns.orderId]) : '',
      tradeId: columns.tradeId ? normalizeCell(row[columns.tradeId]) : '',
      exchange: columns.exchange ? normalizeCell(row[columns.exchange]) : '',
      segment: columns.segment ? normalizeCell(row[columns.segment]) : '',
      series: columns.series ? normalizeCell(row[columns.series]) : '',
      isin: columns.isin ? normalizeCell(row[columns.isin]) : '',
    });
  });

  const mergedFills = mergeExecutions(normalizedRows);
  const activeTrades = new Map();
  const cycleCounter = new Map();
  const trades = [];
  const skippedGroups = [];

  const nextCycle = (symbol) => {
    const next = (cycleCounter.get(symbol) || 0) + 1;
    cycleCounter.set(symbol, next);
    return next;
  };

  const maybeFinalize = (symbol) => {
    const current = activeTrades.get(symbol);
    if (current && current.openQty === 0) {
      trades.push(finalizeTrade(current));
      activeTrades.delete(symbol);
    }
  };

  for (const fill of mergedFills) {
    let remainingQty = fill.qty;

    while (remainingQty > 0) {
      let current = activeTrades.get(fill.symbol);

      if (!current) {
        if (fill.side === 'SELL' && !options.allowLeadingSell) {
          skippedGroups.push({
            kind: 'orphan-close',
            symbol: fill.symbol,
            side: fill.side,
            qty: remainingQty,
            executedAt: fill.executedAt,
          });
          break;
        }
        current = startTrade(fill, nextCycle(fill.symbol), options);
        activeTrades.set(fill.symbol, current);
      }

      if (fill.side === openingSide(current.direction)) {
        appendPiece(current, fill, remainingQty);
        current.openQty += remainingQty;
        remainingQty = 0;
        continue;
      }

      if (fill.side === closingSide(current.direction)) {
        const closableQty = Math.min(remainingQty, current.openQty);
        if (!(closableQty > 0)) {
          skippedGroups.push({
            kind: 'over-close',
            symbol: fill.symbol,
            side: fill.side,
            qty: remainingQty,
            executedAt: fill.executedAt,
          });
          break;
        }

        appendPiece(current, fill, closableQty, remainingQty > closableQty ? 'split close' : '');
        current.openQty -= closableQty;
        remainingQty -= closableQty;
        maybeFinalize(fill.symbol);

        if (remainingQty > 0 && options.allowReversal === false) {
          skippedGroups.push({
            kind: 'reversal-overflow',
            symbol: fill.symbol,
            side: fill.side,
            qty: remainingQty,
            executedAt: fill.executedAt,
          });
          break;
        }
        continue;
      }

      skippedGroups.push({
        kind: 'unexpected-side',
        symbol: fill.symbol,
        side: fill.side,
        qty: remainingQty,
        executedAt: fill.executedAt,
      });
      break;
    }
  }

  activeTrades.forEach((trade) => {
    trades.push(finalizeTrade(trade));
  });

  const closedTradeCount = trades.filter((trade) => {
    const openSide = openingSide(trade.direction);
    const closeSide = closingSide(trade.direction);
    const opened = trade.fills.filter((fill) => fill.side === openSide).reduce((sum, fill) => sum + fill.qty, 0);
    const closed = trade.fills.filter((fill) => fill.side === closeSide).reduce((sum, fill) => sum + fill.qty, 0);
    return Math.abs(opened - closed) < 1e-9;
  }).length;

  const skippedSymbols = [...new Set(skippedGroups.map((item) => item.symbol).filter(Boolean))].sort();

  return {
    trades,
    summary: {
      fileName: options.fileName || '',
      rawRowCount: parsed.rows.length,
      validRowCount: normalizedRows.length,
      mergedFillCount: mergedFills.length,
      tradeCount: trades.length,
      closedTradeCount,
      openTradeCount: trades.length - closedTradeCount,
      skippedCount: skippedGroups.length,
      skippedSymbols,
      invalidRowCount: skippedRows.length,
    },
    skippedGroups,
    skippedRows,
    mergedFills,
  };
}
