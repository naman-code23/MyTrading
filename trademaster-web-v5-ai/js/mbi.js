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

function colorTone(score) {
  if (score >= 0) return 'positive';
  return 'negative';
}

export function mbiBucketLabel(score) {
  if (!Number.isFinite(Number(score))) return 'Unspecified';
  const value = Number(score);
  if (value >= 35) return '35+';
  if (value >= 25) return '25-34';
  if (value >= 15) return '15-24';
  if (value >= 5) return '5-14';
  if (value >= 0) return '0 to 4';
  if (value >= -5) return '-5 to -1';
  if (value >= -15) return '-15 to -6';
  return '< -15';
}

function scoreToZone(score) {
  if (score >= 25) {
    return {
      zone: 'STRONG BUY',
      color: 'green',
      swingAction: 'Full deployment. 3 positions at ₹1-2L. Hold 10-15 days.',
      intradayAction: 'Intraday OK — 72.7% WR backtested on 491 days. Keep size ≤₹1L.',
      stats: 'Backtested: +1.25% avg 10d, +1.65% avg 15d, 65% swing WR',
      sizing: { maxTradeValue: 200000, maxPositions: 3, maxHoldDays: 15, intradayAllowed: true },
    };
  }
  if (score >= 15) {
    return {
      zone: 'BUY',
      color: 'green',
      swingAction: '2 positions max at ₹1L each. Hold 8-12 days. Best setups only.',
      intradayAction: 'Intraday marginal — 56.6% WR. Only if Net Breadth > 15.',
      stats: 'Backtested: +1.22% avg 10d, +1.99% avg 15d, 66% swing WR',
      sizing: { maxTradeValue: 100000, maxPositions: 2, maxHoldDays: 12, intradayAllowed: false },
    };
  }
  if (score >= 5) {
    return {
      zone: 'CAUTIOUS',
      color: 'amber',
      swingAction: '1 position max at ₹50K. Hold max 7 days. Tight -2% stop.',
      intradayAction: 'NO intraday — 53% WR, no edge.',
      stats: 'Backtested: +0.26% avg 10d, 53% swing WR — marginal',
      sizing: { maxTradeValue: 50000, maxPositions: 1, maxHoldDays: 7, intradayAllowed: false },
    };
  }
  if (score >= -5) {
    return {
      zone: 'NEUTRAL',
      color: 'slate',
      swingAction: 'NO new trades. Hold existing only if in >3% profit.',
      intradayAction: 'NO intraday — 38.7% WR, guaranteed loss.',
      stats: 'Backtested: +0.82% avg 10d but inconsistent, 39% intraday WR',
      sizing: { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false },
    };
  }
  if (score >= -15) {
    return {
      zone: 'AVOID',
      color: 'red',
      swingAction: 'Close all swing positions. 100% cash.',
      intradayAction: 'ABSOLUTELY NO intraday — 27.2% WR.',
      stats: 'Backtested: -0.06% avg 10d, 50% swing WR — coin flip',
      sizing: { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false },
    };
  }
  return {
    zone: 'STRONG AVOID',
    color: 'red',
    swingAction: 'EXIT everything at open. Do not trade.',
    intradayAction: 'ZERO intraday — 20.5% WR. 4 out of 5 trades lose.',
    stats: 'Backtested: -1.96% avg 10d, -1.24% avg intraday, 51% swing WR',
    sizing: { maxTradeValue: 0, maxPositions: 0, maxHoldDays: 0, intradayAllowed: false },
  };
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

  const context = {
    prevScore: n(input.prevScore),
    entryScore: n(input.entryScore),
    daysHeld: n(input.daysHeld),
    currentPnl: n(input.currentPnl),
  };

  if (Object.values(values).some((value) => value == null)) {
    return {
      ready: false,
      score: 0,
      zone: '',
      color: 'slate',
      swingAction: '',
      intradayAction: '',
      stats: '',
      signals: [],
      sellSignals: [],
      breakdown: [],
      sizing: {},
      bucket: 'Unspecified',
    };
  }

  let score = 0;
  const breakdown = [];
  let s = 0;

  // Ported from the detailed MBI V2 scorer in the original TradeMasterPro.html.
  s = values.a20 >= 60 ? 3 : values.a20 >= 45 ? 2 : values.a20 >= 35 ? 1 : values.a20 >= 25 ? 0 : values.a20 >= 15 ? -1 : -3;
  breakdown.push(scoreComponent('Above 20MA', `${values.a20.toFixed(1)}%`, s * 3));
  score += s * 3;

  s = values.a50 >= 55 ? 3 : values.a50 >= 40 ? 2 : values.a50 >= 30 ? 1 : values.a50 >= 20 ? 0 : -2;
  breakdown.push(scoreComponent('Above 50MA', `${values.a50.toFixed(1)}%`, s * 2));
  score += s * 2;

  s = values.nb > 40 ? 4 : values.nb > 25 ? 3 : values.nb > 15 ? 2 : values.nb > 5 ? 1 : values.nb > -5 ? 0 : values.nb > -15 ? -1 : values.nb > -30 ? -2 : -3;
  breakdown.push(scoreComponent('Net Breadth', `${values.nb.toFixed(1)}`, s * 2));
  score += s * 2;

  if (values.wh > 3 && values.wl < 2) s = 3;
  else if (values.wh > 1.5 && values.wl < 2) s = 2;
  else if (values.wh > 0.8 && values.wl < 3) s = 1;
  else if (values.wl > 10) s = -3;
  else if (values.wl > 5) s = -2;
  else if (values.wl > 3) s = -1;
  else if (values.wl > 2) s = -1;
  else s = 0;
  breakdown.push(scoreComponent('52W Hi/Lo', `H:${values.wh.toFixed(1)} L:${values.wl.toFixed(1)}`, s * 2));
  score += s * 2;

  s = values.bosf > 2 ? 3 : values.bosf > 1.5 ? 2 : values.bosf > 1 ? 1 : values.bosf > 0.7 ? 0 : values.bosf > 0.4 ? -1 : -2;
  breakdown.push(scoreComponent('BO S/F', values.bosf.toFixed(2), s * 2));
  score += s * 2;

  s = values.uhlh > 30 ? 3 : values.uhlh > 10 ? 2 : values.uhlh > 0 ? 1 : values.uhlh > -15 ? 0 : values.uhlh > -30 ? -1 : -2;
  breakdown.push(scoreComponent('UH/LH', values.uhlh.toFixed(1), s));
  score += s;

  s = values.a200 > 55 ? 2 : values.a200 > 40 ? 1 : values.a200 > 30 ? 0 : values.a200 > 20 ? -1 : -2;
  breakdown.push(scoreComponent('Above 200MA', `${values.a200.toFixed(1)}%`, s));
  score += s;

  s = values.vol > 1.5 ? 2 : values.vol > 0.8 ? 1 : values.vol > 0.4 ? 0 : -1;
  breakdown.push(scoreComponent('Volume', `${values.vol.toFixed(2)}x`, s));
  score += s;

  s = values.adv > 15 ? 3 : values.adv > 10 ? 2 : values.adv > 7 ? 1 : values.adv > 4 ? 0 : -1;
  breakdown.push(scoreComponent('4% Advance', `${values.adv.toFixed(1)}%`, s));
  score += s;

  s = values.nhl > 20 ? 2 : values.nhl > 5 ? 1 : values.nhl > -5 ? 0 : values.nhl > -20 ? -1 : -2;
  breakdown.push(scoreComponent('Net 15% H-L', `${values.nhl.toFixed(1)}`, s));
  score += s;

  s = values.bd > 20 ? -3 : values.bd > 12 ? -2 : values.bd > 7 ? -1 : values.bd > 3 ? 0 : 1;
  breakdown.push(scoreComponent('Breakdowns', `${values.bd.toFixed(1)}%`, s));
  score += s;

  const zoneInfo = scoreToZone(score);
  const signals = [];
  if (values.nb > 30) signals.push({ level: 'positive', label: 'Override', text: 'Net breadth > 30 — mega signal. Breadth thrust strongly supports aggressive follow-through.' });
  if (values.wl > 5) signals.push({ level: 'negative', label: 'Override', text: '52W lows > 5% — exit-all regime. Protect capital first.' });
  if (values.wl > 10) signals.push({ level: 'negative', label: 'Override', text: '52W lows > 10% — panic condition. This overrides almost everything else.' });
  else if (values.wl > 2 && values.wl <= 5) signals.push({ level: 'warning', label: 'Override', text: '52W lows > 2% — be selective. Historical win rates degrade here.' });
  if (values.a20 < 15) signals.push({ level: 'negative', label: 'Override', text: 'Above 20MA < 15% — deep correction backdrop.' });
  if (values.bosf < 0.7) signals.push({ level: 'warning', label: 'Override', text: 'BO S/F < 0.7 — breakout quality is poor. Intraday breakout trades should be avoided.' });
  if (!signals.length) signals.push({ level: 'neutral', label: 'Base rule', text: 'No major overrides. Follow the zone rules and your normal setup quality checks.' });

  const sellSignals = [];
  if (score < -15) sellSignals.push({ level: 'negative', label: 'Emergency', text: 'STRONG AVOID — EXIT ALL at open.' });
  else if (score < -5) sellSignals.push({ level: 'negative', label: 'Urgent', text: 'AVOID zone — close all positions.' });
  else if (score < 5) sellSignals.push({ level: 'warning', label: 'Warning', text: 'NEUTRAL zone — exit unless the position is already comfortably profitable.' });
  if (context.prevScore != null && context.prevScore - score > 15) sellSignals.push({ level: 'negative', label: 'Gap warning', text: `Score dropped ${Math.round(context.prevScore - score)} points overnight — consider exiting at open.` });
  if (context.entryScore != null && context.entryScore - score > 20) sellSignals.push({ level: 'negative', label: 'Entry deterioration', text: `Score dropped ${Math.round(context.entryScore - score)} points since entry — edge may be gone.` });
  if (values.wl > 5) sellSignals.push({ level: 'negative', label: 'Breadth damage', text: `52W lows at ${values.wl.toFixed(1)}% (>5%) — exit-all regime.` });
  if (values.a20 < 20) sellSignals.push({ level: 'negative', label: 'Deep weakness', text: `Above 20MA only ${values.a20.toFixed(1)}% — market internals are very weak.` });
  if (context.daysHeld != null && context.daysHeld > 15) sellSignals.push({ level: 'warning', label: 'Time stop', text: `Day ${Math.round(context.daysHeld)} — past the 15-day max hold window.` });
  if (context.daysHeld != null && context.daysHeld > 5 && context.currentPnl != null && context.currentPnl < 0) sellSignals.push({ level: 'negative', label: 'Time + red', text: `Day ${Math.round(context.daysHeld)} while still at ${round(context.currentPnl, 2)}% — cut the laggard.` });
  if (context.currentPnl != null && context.currentPnl <= -2) sellSignals.push({ level: 'negative', label: 'Stop', text: `At ${round(context.currentPnl, 2)}% — hard stop is hit.` });
  if (context.currentPnl != null && context.currentPnl >= 5) sellSignals.push({ level: 'positive', label: 'Target', text: `At +${round(context.currentPnl, 2)}% — sell half and trail the rest.` });
  if (context.currentPnl != null && context.currentPnl >= 2 && context.currentPnl < 5) sellSignals.push({ level: 'positive', label: 'Trail', text: `At +${round(context.currentPnl, 2)}% — move stop to breakeven.` });
  if (!sellSignals.length && score >= 15) sellSignals.push({ level: 'positive', label: 'Hold', text: 'MBI is strong and no active sell trigger is firing. Hold with trailing stops.' });

  return {
    ready: true,
    score,
    zone: zoneInfo.zone,
    color: zoneInfo.color,
    swingAction: zoneInfo.swingAction,
    intradayAction: zoneInfo.intradayAction,
    stats: zoneInfo.stats,
    signals,
    sellSignals,
    breakdown: breakdown.map((item) => ({ ...item, tone: colorTone(item.score) })),
    sizing: zoneInfo.sizing,
    bucket: mbiBucketLabel(score),
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
  } else if (daysHeld > 15) {
    advice = 'Past the max hold window. Review whether this trade still deserves capital.';
  } else if (pnlPercent < 0 && daysHeld > 5) {
    advice = `Still red after ${daysHeld} days. Consider cutting the trade instead of hoping.`;
  } else if (pnlPercent >= 5) {
    advice = 'At +5% or better. Consider selling partial size and trailing the rest.';
  } else if (pnlPercent >= 2) {
    advice = 'Move stop to breakeven and let the trade work.';
  } else if (pnlPercent >= 0) {
    advice = 'Small profit. Hold only if the market context still supports the setup.';
  } else {
    advice = 'Small loss. Use MBI context and time held to decide whether to cut or hold.';
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
      action: pnlPercent <= -2 ? 'Exit now. Hard stop is already hit.' : 'If yes, stop first and ask questions later.',
    },
    {
      order: 2,
      level: lows52wPercent > 5 ? 'negative' : lows52wPercent > 2 ? 'warning' : 'neutral',
      question: 'Are 52W lows expanding?',
      action: lows52wPercent > 5 ? 'Exit-all regime. Protect capital.' : lows52wPercent > 2 ? 'Be selective. Historical win rates degrade here.' : 'Breadth damage is not extreme yet.',
    },
    {
      order: 3,
      level: mbiScore < -15 ? 'negative' : mbiScore < -5 ? 'warning' : 'neutral',
      question: 'Is MBI in Avoid / Strong Avoid?',
      action: mbiScore < -15 ? 'Strong Avoid: exit aggressively.' : mbiScore < -5 ? 'Avoid: close weak longs and avoid fresh buys.' : 'MBI itself is not forcing an exit yet.',
    },
    {
      order: 4,
      level: (prevScore - mbiScore) > 15 ? 'negative' : 'neutral',
      question: 'Did the score collapse overnight?',
      action: (prevScore - mbiScore) > 15 ? `Score dropped ${Math.round(prevScore - mbiScore)} points. Consider selling at open.` : 'A 15-point overnight drop is a serious warning.',
    },
    {
      order: 5,
      level: above20maPercent < 20 ? 'warning' : 'neutral',
      question: 'Is breadth weak (Above 20MA below 20%)?',
      action: above20maPercent < 20 ? 'Tighten stops. Market internals are weak.' : 'Breadth is not in deep-correction territory.',
    },
    {
      order: 6,
      level: daysHeld > 15 ? 'warning' : pnlPercent >= 5 ? 'positive' : pnlPercent >= 2 ? 'positive' : 'neutral',
      question: 'Has time or target management triggered?',
      action: daysHeld > 15 ? `Held for ${daysHeld} days. Review whether the trade has overstayed.` : pnlPercent >= 5 ? 'Take partial profits and trail the remainder.' : pnlPercent >= 2 ? 'Move stop to breakeven and keep managing the winner.' : 'No time/target trigger yet.',
    },
  ];
}
