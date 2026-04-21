function n(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRound(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function solvePositionCalculator(input = {}) {
  const capital = n(input.capital);
  const riskPercent = n(input.riskPercent);
  const entry = n(input.entry);
  let slPrice = n(input.slPrice);
  let slPercent = n(input.slPercent);
  let positionSize = n(input.positionSize);
  let riskAmount = n(input.riskAmount);
  const riskFromConfig = capital * riskPercent / 100;
  const mode = input.lastEdited || 'entry';

  if (entry && slPercent && !slPrice) {
    slPrice = safeRound(entry - (entry * slPercent / 100));
  }

  if (entry && slPrice) {
    slPercent = safeRound(Math.abs((entry - slPrice) / entry) * 100, 2);
  }

  const gap = entry && slPrice ? Math.abs(entry - slPrice) : 0;

  let qty = 0;
  if (mode === 'positionSize' && entry > 0) {
    qty = Math.floor(positionSize / entry);
    riskAmount = safeRound(qty * gap, 0);
  } else if (mode === 'riskAmount' && gap > 0) {
    qty = Math.floor(riskAmount / gap);
    positionSize = safeRound(qty * entry, 0);
  } else if (gap > 0) {
    riskAmount = safeRound(riskFromConfig, 0);
    qty = Math.floor(riskAmount / gap);
    positionSize = safeRound(qty * entry, 0);
  } else if (positionSize > 0 && entry > 0) {
    qty = Math.floor(positionSize / entry);
  }

  const totalValue = safeRound(qty * entry, 0);
  const actualRisk = safeRound(qty * gap, 0);
  const positionPercent = capital > 0 ? safeRound((totalValue / capital) * 100, 1) : 0;
  const riskOfCapital = capital > 0 ? safeRound((actualRisk / capital) * 100, 2) : 0;
  const long = !slPrice || entry >= slPrice;

  return {
    capital,
    riskPercent,
    entry,
    slPrice: slPrice || '',
    slPercent: slPercent || '',
    positionSize: positionSize || '',
    riskAmount: riskAmount || '',
    qty,
    totalValue,
    actualRisk,
    positionPercent,
    riskOfCapital,
    long,
    gap,
  };
}

function estimateCharges(entry, exitPrice, qty) {
  if (!(entry > 0) || !(exitPrice > 0) || !(qty > 0)) {
    return { brokerage: 0, stt: 0, other: 0, total: 0, net: 0 };
  }
  const buyValue = entry * qty;
  const sellValue = exitPrice * qty;
  const brokerage = 40;
  const stt = sellValue * 0.00025;
  const exchange = (buyValue + sellValue) * 0.0000345;
  const sebi = (buyValue + sellValue) * 0.000001;
  const stamp = buyValue * 0.00015;
  const gst = (brokerage + exchange + sebi) * 0.18;
  const other = exchange + sebi + stamp + gst;
  const total = brokerage + stt + other;
  return {
    brokerage: safeRound(brokerage, 0),
    stt: safeRound(stt, 0),
    other: safeRound(other, 0),
    total: safeRound(total, 0),
    net: 0,
  };
}

export function projectTarget(input = {}) {
  const entry = n(input.entry);
  const slPrice = n(input.slPrice);
  const qty = n(input.qty);
  const targetR = input.targetR === '' || input.targetR == null ? '' : n(input.targetR);
  const targetPercent = input.targetPercent === '' || input.targetPercent == null ? '' : n(input.targetPercent);
  const exitPriceInput = input.exitPrice === '' || input.exitPrice == null ? '' : n(input.exitPrice);
  const mode = input.mode || 'R';
  const gap = entry && slPrice ? Math.abs(entry - slPrice) : 0;
  const long = !slPrice || entry >= slPrice;

  let exitPrice = exitPriceInput;
  let rMultiple = targetR;
  let percent = targetPercent;

  if (!(entry > 0) || !(gap > 0) || !(qty > 0)) {
    return {
      exitPrice: '',
      targetR: '',
      targetPercent: '',
      pnl: 0,
      charges: { brokerage: 0, stt: 0, other: 0, total: 0, net: 0 },
    };
  }

  if (mode === 'EXIT' && exitPrice > 0) {
    percent = safeRound(Math.abs((exitPrice - entry) / entry) * 100, 2);
    rMultiple = safeRound(Math.abs(exitPrice - entry) / gap, 2);
  } else if (mode === 'PCT' && percent > 0) {
    const move = entry * percent / 100;
    exitPrice = safeRound(long ? entry + move : entry - move, 2);
    rMultiple = safeRound(Math.abs(move) / gap, 2);
  } else if (rMultiple > 0) {
    exitPrice = safeRound(long ? entry + (gap * rMultiple) : entry - (gap * rMultiple), 2);
    percent = safeRound(Math.abs((exitPrice - entry) / entry) * 100, 2);
  }

  const pnl = exitPrice > 0 ? safeRound((long ? (exitPrice - entry) : (entry - exitPrice)) * qty, 0) : 0;
  const charges = estimateCharges(entry, exitPrice, qty);
  charges.net = safeRound(pnl - charges.total, 0);

  return {
    exitPrice: exitPrice || '',
    targetR: rMultiple || '',
    targetPercent: percent || '',
    pnl,
    charges,
  };
}

export function lockedPnl(entry, trailPrice, qty, long = true) {
  const e = n(entry);
  const t = n(trailPrice);
  const q = n(qty);
  if (!(e > 0) || !(t > 0) || !(q > 0)) return 0;
  return safeRound((long ? (t - e) : (e - t)) * q, 0);
}
