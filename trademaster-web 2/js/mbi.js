function n(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function scoreComponent(name, raw, score) {
  return { name, raw, score };
}

export function calculateMbi(input = {}) {
  const values = {
    a20: n(input.a20),
    a50: n(input.a50),
    a200: n(input.a200),
    nb: n(input.nb),
    wh: n(input.wh),
    wl: n(input.wl),
    bosf: n(input.bosf),
    uhlh: n(input.uhlh),
    vol: n(input.vol),
    adv: n(input.adv),
    nhl: n(input.nhl),
    bd: n(input.bd),
  };

  if (Object.values(values).some((value) => value == null)) {
    return { ready: false, score: 0, zone: '', color: 'slate', swingAction: '', intradayAction: '', signals: [], breakdown: [], sizing: {} };
  }

  let score = 0;
  const breakdown = [];
  let s = 0;

  s = values.a20 >= 60 ? 9 : values.a20 >= 45 ? 6 : values.a20 >= 35 ? 3 : values.a20 >= 25 ? 0 : values.a20 >= 15 ? -3 : -9;
  score += s;
  breakdown.push(scoreComponent('Above 20MA', `${values.a20.toFixed(1)}%`, s));

  s = values.a50 >= 55 ? 6 : values.a50 >= 40 ? 4 : values.a50 >= 30 ? 2 : values.a50 >= 20 ? 0 : -4;
  score += s;
  breakdown.push(scoreComponent('Above 50MA', `${values.a50.toFixed(1)}%`, s));

  s = values.nb > 40 ? 8 : values.nb > 25 ? 6 : values.nb > 15 ? 4 : values.nb > 5 ? 2 : values.nb > -5 ? 0 : values.nb > -15 ? -2 : values.nb > -30 ? -4 : -6;
  score += s;
  breakdown.push(scoreComponent('Net breadth', `${values.nb.toFixed(1)}`, s));

  if (values.wh > 3 && values.wl < 2) s = 6;
  else if (values.wh > 1.5 && values.wl < 2) s = 4;
  else if (values.wh > 0.8 && values.wl < 3) s = 2;
  else if (values.wl > 10) s = -6;
  else if (values.wl > 5) s = -4;
  else if (values.wl > 2) s = -2;
  else s = 0;
  score += s;
  breakdown.push(scoreComponent('52W Hi/Lo', `H ${values.wh.toFixed(1)} • L ${values.wl.toFixed(1)}`, s));

  s = values.bosf > 2 ? 6 : values.bosf > 1.5 ? 4 : values.bosf > 1 ? 2 : values.bosf > 0.7 ? 0 : values.bosf > 0.4 ? -2 : -4;
  score += s;
  breakdown.push(scoreComponent('BO S/F', values.bosf.toFixed(2), s));

  s = values.uhlh > 30 ? 3 : values.uhlh > 10 ? 2 : values.uhlh > 0 ? 1 : values.uhlh > -15 ? 0 : values.uhlh > -30 ? -1 : -2;
  score += s;
  breakdown.push(scoreComponent('UH/LH', values.uhlh.toFixed(1), s));

  s = values.a200 > 55 ? 2 : values.a200 > 40 ? 1 : values.a200 > 30 ? 0 : values.a200 > 20 ? -1 : -2;
  score += s;
  breakdown.push(scoreComponent('Above 200MA', `${values.a200.toFixed(1)}%`, s));

  s = values.vol > 1.5 ? 2 : values.vol > 0.8 ? 1 : values.vol > 0.4 ? 0 : -1;
  score += s;
  breakdown.push(scoreComponent('Volume', `${values.vol.toFixed(2)}x`, s));

  s = values.adv > 15 ? 3 : values.adv > 10 ? 2 : values.adv > 7 ? 1 : values.adv > 4 ? 0 : -1;
  score += s;
  breakdown.push(scoreComponent('4% advance', `${values.adv.toFixed(1)}%`, s));

  s = values.nhl > 20 ? 2 : values.nhl > 5 ? 1 : values.nhl > -5 ? 0 : values.nhl > -20 ? -1 : -2;
  score += s;
  breakdown.push(scoreComponent('Net 15% H-L', `${values.nhl.toFixed(1)}`, s));

  s = values.bd > 20 ? -3 : values.bd > 12 ? -2 : values.bd > 7 ? -1 : values.bd > 3 ? 0 : 1;
  score += s;
  breakdown.push(scoreComponent('Breakdowns', `${values.bd.toFixed(1)}%`, s));

  let zone = 'Neutral';
  let color = 'slate';
  let swingAction = 'No new swing positions.';
  let intradayAction = 'No intraday setups.';
  let sizing = { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false };

  if (score >= 25) {
    zone = 'Strong Buy';
    color = 'green';
    swingAction = 'Full deployment. 3 high-quality swing positions are allowed.';
    intradayAction = 'Intraday gap-up / AVWAP setups are allowed with conviction.';
    sizing = { maxTradeValue: 200000, maxPositions: 3, maxHoldDays: 15, intradayAllowed: true };
  } else if (score >= 15) {
    zone = 'Buy';
    color = 'green';
    swingAction = 'Two quality swing positions. Focus on best breakouts only.';
    intradayAction = 'Selective intraday only when BO S/F and breadth confirm.';
    sizing = { maxTradeValue: 100000, maxPositions: 2, maxHoldDays: 12, intradayAllowed: true };
  } else if (score >= 5) {
    zone = 'Cautious';
    color = 'amber';
    swingAction = 'One smaller swing position with a tight stop.';
    intradayAction = 'Only cherry-picked intraday setups. Avoid overtrading.';
    sizing = { maxTradeValue: 50000, maxPositions: 1, maxHoldDays: 7, intradayAllowed: false };
  } else if (score >= -5) {
    zone = 'Neutral';
    color = 'slate';
    swingAction = 'No new positions unless the setup is exceptional.';
    intradayAction = 'Generally skip fresh intraday trades.';
    sizing = { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false };
  } else if (score >= -15) {
    zone = 'Avoid';
    color = 'red';
    swingAction = 'Reduce exposure and move to cash.';
    intradayAction = 'Do not take new intraday trades.';
    sizing = { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false };
  } else {
    zone = 'Strong Avoid';
    color = 'red';
    swingAction = 'Exit weak positions and stay defensive.';
    intradayAction = 'No intraday trades. Protect capital.';
    sizing = { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false };
  }

  const signals = [];
  if (values.nb > 30) signals.push({ level: 'positive', text: 'Net breadth above 30: breadth thrust supports aggressive follow-through.' });
  if (values.wl > 5) signals.push({ level: 'negative', text: '52W lows above 5%: exit weak longs and avoid new buys.' });
  else if (values.wl > 2) signals.push({ level: 'warning', text: '52W lows above 2%: be selective and tighten risk.' });
  if (values.a20 < 15) signals.push({ level: 'negative', text: 'Above 20MA below 15%: market is in a deep correction.' });
  if (values.bosf < 0.7) signals.push({ level: 'warning', text: 'BO S/F below 0.7: breakout quality is poor.' });
  if (!signals.length) signals.push({ level: 'neutral', text: 'No major overrides. Base zone rules apply.' });

  return {
    ready: true,
    score,
    zone,
    color,
    swingAction,
    intradayAction,
    signals,
    breakdown,
    sizing,
  };
}

export function quickSellCalculator(input = {}) {
  const buyPrice = Number(input.buyPrice || 0);
  const currentPrice = Number(input.currentPrice || 0);
  const qty = Number(input.qty || 0);
  const daysHeld = Number(input.daysHeld || 0);

  const pnl = buyPrice > 0 && qty > 0 ? (currentPrice - buyPrice) * qty : 0;
  const pnlPercent = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;

  let advice = 'Enter values to see advice.';
  if (!(buyPrice > 0) || !(currentPrice > 0) || !(qty > 0)) {
    advice = 'Enter buy price, current price, and quantity to calculate the sell decision.';
  } else if (pnlPercent <= -2) {
    advice = 'Hard stop hit. Sell now and protect your risk rules.';
  } else if (pnlPercent < 0 && daysHeld > 5) {
    advice = `Still red after ${daysHeld} days. Consider cutting the trade.`;
  } else if (pnlPercent >= 5) {
    advice = 'At +5% or better. Consider selling partial size and trailing the rest.';
  } else if (pnlPercent >= 2) {
    advice = 'Move stop to breakeven and let the trade work.';
  } else if (pnlPercent >= 0) {
    advice = 'Small profit. Hold only if the market context still supports the setup.';
  } else {
    advice = 'Small loss. Let market context decide: strong breadth can earn patience, weak breadth should not.';
  }

  return {
    pnl: round(pnl, 2),
    pnlPercent: round(pnlPercent, 2),
    advice,
  };
}

export function buildSellChecklist(input = {}) {
  const pnlPercent = Number(input.pnlPercent || 0);
  const daysHeld = Number(input.daysHeld || 0);
  const mbiScore = Number(input.mbiScore || 0);
  const prevScore = Number(input.prevScore || 0);
  const lows52wPercent = Number(input.lows52wPercent || 0);
  const above20maPercent = Number(input.above20maPercent || 0);

  return [
    {
      order: 1,
      level: pnlPercent <= -2 ? 'negative' : 'neutral',
      question: 'Is the trade at -2% or worse?',
      action: pnlPercent <= -2 ? 'Exit. Hard stop is already hit.' : 'If yes, exit immediately.',
    },
    {
      order: 2,
      level: lows52wPercent > 5 ? 'negative' : 'neutral',
      question: 'Are 52W lows above 5%?',
      action: lows52wPercent > 5 ? 'Exit weak longs and stay defensive.' : 'If yes, avoid fresh longs and reduce exposure.',
    },
    {
      order: 3,
      level: mbiScore < -15 ? 'negative' : mbiScore < -5 ? 'warning' : 'neutral',
      question: 'Is the MBI in Avoid / Strong Avoid?',
      action: mbiScore < -15 ? 'Strong Avoid: exit at the first clean opportunity.' : mbiScore < -5 ? 'Avoid: cut weak positions and avoid new buys.' : 'Healthy enough to hold if the individual setup still works.',
    },
    {
      order: 4,
      level: (prevScore - mbiScore) > 15 ? 'negative' : 'neutral',
      question: 'Did the MBI score collapse overnight?',
      action: (prevScore - mbiScore) > 15 ? `Score dropped ${Math.round(prevScore - mbiScore)} points. Consider selling at open.` : 'A sharp score drop is a serious warning.',
    },
    {
      order: 5,
      level: above20maPercent < 20 ? 'warning' : 'neutral',
      question: 'Is breadth weak (Above 20MA below 20%)?',
      action: above20maPercent < 20 ? 'Breadth is weak. Tighten stops and avoid giving back gains.' : 'Breadth is not in deep-correction territory.',
    },
    {
      order: 6,
      level: daysHeld > 15 ? 'warning' : pnlPercent >= 5 ? 'positive' : pnlPercent >= 2 ? 'positive' : 'neutral',
      question: 'Has time or target management triggered?',
      action: daysHeld > 15 ? `Held for ${daysHeld} days. Review whether the trade has overstayed.` : pnlPercent >= 5 ? 'Take partial profits and trail the remainder.' : pnlPercent >= 2 ? 'Move stop to breakeven and continue managing the position.' : 'No time/target trigger yet.',
    },
  ];
}
