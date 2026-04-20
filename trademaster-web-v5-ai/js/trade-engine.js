import { monthKey, labelFromMonthKey, round, weekdayLabel } from './utils.js';

export const PNL_METHODS = {
  AVERAGE: 'AVERAGE',
  FIFO: 'FIFO',
};

function sortFills(fills = []) {
  return [...fills].sort((a, b) => {
    const diff = new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
    if (diff !== 0) return diff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function isOpeningFill(direction, side) {
  return (direction === 'LONG' && side === 'BUY') || (direction === 'SHORT' && side === 'SELL');
}

function isClosingFill(direction, side) {
  return (direction === 'LONG' && side === 'SELL') || (direction === 'SHORT' && side === 'BUY');
}

function openingUnitBasis(direction, fill) {
  const feePerUnit = (fill.fees || 0) / fill.qty;
  return direction === 'LONG' ? fill.price + feePerUnit : fill.price - feePerUnit;
}

function closingUnitValue(direction, fill) {
  const feePerUnit = (fill.fees || 0) / fill.qty;
  return direction === 'LONG' ? fill.price - feePerUnit : fill.price + feePerUnit;
}

function pnlFromMatch(direction, openUnit, closeUnit, qty) {
  return direction === 'LONG'
    ? qty * (closeUnit - openUnit)
    : qty * (openUnit - closeUnit);
}

export function computeTradeMetrics(trade, method = PNL_METHODS.AVERAGE) {
  const fills = sortFills(trade.fills || []);
  if (!fills.length) {
    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      direction: trade.direction || 'LONG',
      strategy: trade.strategy || '',
      status: 'OPEN',
      method,
      feesTotal: 0,
      totalEntryQty: 0,
      totalExitQty: 0,
      avgEntryPrice: undefined,
      avgExitPrice: undefined,
      openQty: 0,
      avgOpenPrice: undefined,
      realizedNetPnl: 0,
      realizedGrossPnl: 0,
      realizedR: undefined,
      holdMinutes: 0,
      fillCount: 0,
      win: false,
    };
  }

  let feesTotal = 0;
  let totalEntryQty = 0;
  let totalExitQty = 0;
  let totalEntryNotional = 0;
  let totalExitNotional = 0;
  let realizedNetPnl = 0;
  let openQty = 0;
  let avgOpenUnit = 0;
  const openLots = [];
  let entryAt;
  let exitAt;

  for (const fill of fills) {
    if (!(fill.qty > 0) || !(fill.price > 0)) {
      throw new Error(`Invalid fill ${fill.id || 'unknown'}: qty and price must be positive.`);
    }

    feesTotal += Number(fill.fees || 0);

    if (isOpeningFill(trade.direction, fill.side)) {
      const unitBasis = openingUnitBasis(trade.direction, fill);
      totalEntryQty += fill.qty;
      totalEntryNotional += fill.qty * fill.price;
      openQty += fill.qty;
      entryAt = entryAt || fill.executedAt;

      if (method === PNL_METHODS.AVERAGE) {
        avgOpenUnit = ((avgOpenUnit * (openQty - fill.qty)) + unitBasis * fill.qty) / openQty;
      } else {
        openLots.push({ qty: fill.qty, unitBasis });
      }
      continue;
    }

    if (isClosingFill(trade.direction, fill.side)) {
      if (openQty <= 0) {
        throw new Error(`Trade ${trade.id} has a closing fill before an open position exists.`);
      }
      if (fill.qty > openQty) {
        throw new Error(`Trade ${trade.id} over-closes the position.`);
      }

      const closeUnit = closingUnitValue(trade.direction, fill);
      totalExitQty += fill.qty;
      totalExitNotional += fill.qty * fill.price;
      exitAt = fill.executedAt;

      if (method === PNL_METHODS.AVERAGE) {
        realizedNetPnl += pnlFromMatch(trade.direction, avgOpenUnit, closeUnit, fill.qty);
      } else {
        let remaining = fill.qty;
        while (remaining > 0) {
          const lot = openLots[0];
          if (!lot) throw new Error(`Trade ${trade.id} has no open lots for FIFO.`);
          const matched = Math.min(remaining, lot.qty);
          realizedNetPnl += pnlFromMatch(trade.direction, lot.unitBasis, closeUnit, matched);
          lot.qty -= matched;
          remaining -= matched;
          if (lot.qty === 0) openLots.shift();
        }
      }

      openQty -= fill.qty;
      if (method === PNL_METHODS.AVERAGE && openQty === 0) avgOpenUnit = 0;
      continue;
    }

    throw new Error(`Unexpected fill side ${fill.side} for ${trade.direction} trade.`);
  }

  let avgOpenPrice;
  if (openQty > 0) {
    if (method === PNL_METHODS.AVERAGE) {
      avgOpenPrice = avgOpenUnit;
    } else if (openLots.length > 0) {
      const totalBasis = openLots.reduce((sum, lot) => sum + (lot.qty * lot.unitBasis), 0);
      const totalQty = openLots.reduce((sum, lot) => sum + lot.qty, 0);
      avgOpenPrice = totalQty ? totalBasis / totalQty : undefined;
    }
  }

  const avgEntryPrice = totalEntryQty ? totalEntryNotional / totalEntryQty : undefined;
  const avgExitPrice = totalExitQty ? totalExitNotional / totalExitQty : undefined;
  const status = openQty > 0 ? 'OPEN' : 'CLOSED';
  const holdMinutes = entryAt
    ? Math.max(
        0,
        Math.round(
          ((new Date(status === 'CLOSED' ? exitAt : fills[fills.length - 1].executedAt).getTime()) - new Date(entryAt).getTime()) / 60000,
        ),
      )
    : 0;
  const realizedR = trade.plannedRisk ? realizedNetPnl / Number(trade.plannedRisk) : undefined;

  return {
    tradeId: trade.id,
    symbol: trade.symbol,
    direction: trade.direction || 'LONG',
    strategy: trade.strategy || '',
    tags: trade.tags || [],
    status,
    method,
    entryAt,
    exitAt,
    totalEntryQty,
    totalExitQty,
    avgEntryPrice,
    avgExitPrice,
    openQty,
    avgOpenPrice,
    feesTotal,
    realizedGrossPnl: realizedNetPnl + feesTotal,
    realizedNetPnl,
    realizedR,
    holdMinutes,
    fillCount: fills.length,
    win: realizedNetPnl > 0,
  };
}

export function attachMetrics(trades, method = PNL_METHODS.AVERAGE) {
  return trades.map((trade) => {
    const metrics = computeTradeMetrics(trade, method);
    return { ...trade, metrics };
  });
}

export function summarizeJournal(trades, method = PNL_METHODS.AVERAGE) {
  const items = attachMetrics(trades, method);
  const closed = items.filter((trade) => trade.metrics.status === 'CLOSED');
  const open = items.filter((trade) => trade.metrics.status === 'OPEN');
  const wins = closed.filter((trade) => trade.metrics.realizedNetPnl > 0);
  const losses = closed.filter((trade) => trade.metrics.realizedNetPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.metrics.realizedNetPnl, 0);
  const grossLossAbs = losses.reduce((sum, trade) => sum + Math.abs(trade.metrics.realizedNetPnl), 0);
  const netPnl = closed.reduce((sum, trade) => sum + trade.metrics.realizedNetPnl, 0);
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? -grossLossAbs / losses.length : 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const streakSource = [...closed].sort(
    (a, b) => new Date(a.metrics.exitAt || a.updatedAt || a.createdAt).getTime() - new Date(b.metrics.exitAt || b.updatedAt || b.createdAt).getTime(),
  );
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let bestWinStreak = 0;
  let bestLossStreak = 0;

  for (const trade of streakSource) {
    cumulative += trade.metrics.realizedNetPnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);

    if (trade.metrics.realizedNetPnl > 0) {
      currentWinStreak += 1;
      currentLossStreak = 0;
    } else if (trade.metrics.realizedNetPnl < 0) {
      currentLossStreak += 1;
      currentWinStreak = 0;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }

    bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
    bestLossStreak = Math.max(bestLossStreak, currentLossStreak);
  }

  const bestTrade = closed.reduce((best, trade) => {
    if (!best || trade.metrics.realizedNetPnl > best.metrics.realizedNetPnl) return trade;
    return best;
  }, null);

  const worstTrade = closed.reduce((worst, trade) => {
    if (!worst || trade.metrics.realizedNetPnl < worst.metrics.realizedNetPnl) return trade;
    return worst;
  }, null);

  return {
    tradeCount: items.length,
    openTradeCount: open.length,
    closedTradeCount: closed.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    grossProfit,
    grossLoss: -grossLossAbs,
    netPnl,
    avgWin,
    avgLoss,
    avgTrade: closed.length ? netPnl / closed.length : 0,
    profitFactor: grossLossAbs > 0 ? grossProfit / grossLossAbs : undefined,
    expectancy: closed.length ? netPnl / closed.length : 0,
    maxDrawdown,
    bestWinStreak,
    bestLossStreak,
    bestTrade,
    worstTrade,
    items,
  };
}

export function buildEquityCurve(trades, method = PNL_METHODS.AVERAGE) {
  const closed = attachMetrics(trades, method)
    .filter((trade) => trade.metrics.status === 'CLOSED')
    .sort((a, b) => new Date(a.metrics.exitAt || a.updatedAt || a.createdAt).getTime() - new Date(b.metrics.exitAt || b.updatedAt || b.createdAt).getTime());

  let runningPnl = 0;
  return closed.map((trade) => {
    runningPnl += trade.metrics.realizedNetPnl;
    return {
      label: trade.symbol,
      date: trade.metrics.exitAt || trade.updatedAt || trade.createdAt,
      value: round(runningPnl),
    };
  });
}

export function groupMonthlyPnl(trades, method = PNL_METHODS.AVERAGE) {
  const bucket = new Map();
  const closed = attachMetrics(trades, method).filter((trade) => trade.metrics.status === 'CLOSED');
  for (const trade of closed) {
    const key = monthKey(trade.metrics.exitAt || trade.updatedAt || trade.createdAt);
    bucket.set(key, round((bucket.get(key) || 0) + trade.metrics.realizedNetPnl));
  }

  return [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ key, label: labelFromMonthKey(key), value }));
}

export function groupPnlByField(trades, field, method = PNL_METHODS.AVERAGE) {
  const bucket = new Map();
  const closed = attachMetrics(trades, method).filter((trade) => trade.metrics.status === 'CLOSED');
  for (const trade of closed) {
    const rawValue = Array.isArray(trade[field]) ? trade[field].join(', ') : trade[field];
    const key = rawValue || 'Unspecified';
    bucket.set(key, round((bucket.get(key) || 0) + trade.metrics.realizedNetPnl));
  }
  return [...bucket.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export function weekdayBreakdown(trades, method = PNL_METHODS.AVERAGE) {
  const closed = attachMetrics(trades, method).filter((trade) => trade.metrics.status === 'CLOSED');
  const bucket = new Map();
  for (const trade of closed) {
    const label = weekdayLabel(trade.metrics.exitAt || trade.updatedAt || trade.createdAt);
    const current = bucket.get(label) || { label, pnl: 0, trades: 0, wins: 0 };
    current.pnl += trade.metrics.realizedNetPnl;
    current.trades += 1;
    if (trade.metrics.realizedNetPnl > 0) current.wins += 1;
    bucket.set(label, current);
  }
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return order
    .map((label) => bucket.get(label) || { label, pnl: 0, trades: 0, wins: 0 })
    .map((item) => ({
      ...item,
      pnl: round(item.pnl),
      winRate: item.trades ? round((item.wins / item.trades) * 100, 1) : 0,
    }));
}

export function normalizeTradePayload(payload) {
  return {
    ...payload,
    symbol: String(payload.symbol || '').trim().toUpperCase(),
    direction: payload.direction === 'SHORT' ? 'SHORT' : 'LONG',
    strategy: String(payload.strategy || '').trim(),
    tags: [...new Set((payload.tags || []).map((tag) => String(tag).trim()).filter(Boolean))],
    notes: String(payload.notes || '').trim(),
    plannedRisk: Number(payload.plannedRisk || 0),
    plannedStop: Number(payload.plannedStop || 0),
    mbiScore: payload.mbiScore === '' || payload.mbiScore == null ? null : Number(payload.mbiScore),
    fills: sortFills(
      (payload.fills || []).map((fill) => ({
        ...fill,
        qty: Number(fill.qty || 0),
        price: Number(fill.price || 0),
        fees: Number(fill.fees || 0),
        side: fill.side === 'SELL' ? 'SELL' : 'BUY',
      })),
    ),
  };
}

export function filterTrades(trades, filters, method = PNL_METHODS.AVERAGE) {
  const items = attachMetrics(trades, method);
  return items.filter((trade) => {
    const text = (filters.search || '').trim().toLowerCase();
    if (text) {
      const haystack = [
        trade.symbol,
        trade.strategy,
        trade.notes,
        ...(trade.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }

    if (filters.status && filters.status !== 'ALL' && trade.metrics.status !== filters.status) return false;
    if (filters.direction && filters.direction !== 'ALL' && trade.direction !== filters.direction) return false;
    if (filters.strategy && filters.strategy !== 'ALL' && (trade.strategy || 'Unspecified') !== filters.strategy) return false;
    if (filters.result && filters.result !== 'ALL') {
      if (filters.result === 'WIN' && !(trade.metrics.realizedNetPnl > 0)) return false;
      if (filters.result === 'LOSS' && !(trade.metrics.realizedNetPnl < 0)) return false;
    }

    if (filters.fromDate || filters.toDate) {
      const tradeDate = new Date(trade.metrics.entryAt || trade.createdAt).getTime();
      if (filters.fromDate && tradeDate < new Date(filters.fromDate).getTime()) return false;
      if (filters.toDate && tradeDate > new Date(`${filters.toDate}T23:59:59`).getTime()) return false;
    }

    return true;
  });
}

export function sortTrades(tradesWithMetrics, sortKey) {
  const items = [...tradesWithMetrics];
  items.sort((a, b) => {
    switch (sortKey) {
      case 'DATE_ASC':
        return new Date(a.metrics.entryAt || a.createdAt).getTime() - new Date(b.metrics.entryAt || b.createdAt).getTime();
      case 'PNL_ASC':
        return a.metrics.realizedNetPnl - b.metrics.realizedNetPnl;
      case 'PNL_DESC':
        return b.metrics.realizedNetPnl - a.metrics.realizedNetPnl;
      case 'R_DESC':
        return (b.metrics.realizedR || -Infinity) - (a.metrics.realizedR || -Infinity);
      case 'SYMBOL_ASC':
        return a.symbol.localeCompare(b.symbol);
      case 'HOLD_DESC':
        return b.metrics.holdMinutes - a.metrics.holdMinutes;
      case 'DATE_DESC':
      default:
        return new Date(b.metrics.entryAt || b.createdAt).getTime() - new Date(a.metrics.entryAt || a.createdAt).getTime();
    }
  });
  return items;
}

export function toCsvRows(trades, method = PNL_METHODS.AVERAGE) {
  const items = attachMetrics(trades, method);
  const header = [
    'Date',
    'Symbol',
    'Direction',
    'Strategy',
    'Status',
    'Entry Qty',
    'Exit Qty',
    'Avg Entry',
    'Avg Exit',
    'Open Qty',
    'Net PnL',
    'R Multiple',
    'Hold Minutes',
    'Tags',
    'Notes',
  ];
  const rows = items.map((trade) => [
    trade.metrics.entryAt || trade.createdAt || '',
    trade.symbol,
    trade.direction,
    trade.strategy || '',
    trade.metrics.status,
    trade.metrics.totalEntryQty,
    trade.metrics.totalExitQty,
    trade.metrics.avgEntryPrice ?? '',
    trade.metrics.avgExitPrice ?? '',
    trade.metrics.openQty,
    round(trade.metrics.realizedNetPnl),
    trade.metrics.realizedR != null ? round(trade.metrics.realizedR, 2) : '',
    trade.metrics.holdMinutes,
    (trade.tags || []).join('|'),
    trade.notes || '',
  ]);
  return [header, ...rows];
}
