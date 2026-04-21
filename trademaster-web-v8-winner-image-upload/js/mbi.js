function n(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreComponent(name, raw, score) {
  return { name, raw, score, tone: score >= 0 ? 'positive' : 'negative' };
}

function colorTone(score) {
  if (score >= 65) return 'green';
  if (score >= 55) return 'blue';
  if (score >= 45) return 'amber';
  return 'red';
}

export function mbiBucketLabel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'Unspecified';
  if (value >= 65) return 'PRESS (65+)';
  if (value >= 60) return 'PUNCH (60-64.9)';
  if (value >= 55) return 'TRADE (55-59.9)';
  if (value >= 50) return 'PILOT (50-54.9)';
  if (value >= 45) return 'WATCH (45-49.9)';
  return 'SKIP (<45)';
}

export function superMbiZoneInfo(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) {
    return {
      zone: '',
      action: '',
      color: 'slate',
      summary: '',
      posture: 'Need 3-day filters',
      participation: 'Incomplete',
    };
  }
  if (value < 45) {
    return {
      zone: 'SKIP',
      action: 'No fresh longs',
      color: 'red',
      summary: 'Stay out of fresh momentum longs. Preserve cash and wait for better burst conditions.',
      posture: 'Risk-off',
      participation: 'Skip',
    };
  }
  if (value < 50) {
    return {
      zone: 'WATCH',
      action: 'Watchlist only',
      color: 'amber',
      summary: 'Track leaders, but do not start fresh longs just because a chart looks tempting.',
      posture: 'Observation',
      participation: 'Watch only',
    };
  }
  if (value < 55) {
    return {
      zone: 'PILOT',
      action: 'Pilot size only',
      color: 'amber',
      summary: 'Take only small feeler positions. This is not the regime for full aggression.',
      posture: 'Testing',
      participation: 'Pilot',
    };
  }
  if (value < 60) {
    return {
      zone: 'TRADE',
      action: 'Normal swing trading',
      color: 'blue',
      summary: 'Trade normally. The market is supportive enough for routine momentum participation.',
      posture: 'Constructive',
      participation: 'Normal',
    };
  }
  if (value < 65) {
    return {
      zone: 'PUNCH',
      action: 'Increase exposure',
      color: 'green',
      summary: 'Lean in harder. This is a better-than-normal environment for burst follow-through.',
      posture: 'Aggressive',
      participation: 'Punch',
    };
  }
  return {
    zone: 'PRESS',
    action: 'Press hard',
    color: 'green',
    summary: 'Best burst window. Be present for top-tier leaders and press your best setups.',
    posture: 'Maximum focus',
    participation: 'Press',
  };
}

function pillarScores(values) {
  const breakdown = [];
  let total = 0;
  let score = 0;

  score = values.a20 >= 60 ? 3 : values.a20 >= 45 ? 2 : values.a20 >= 35 ? 1 : values.a20 >= 25 ? 0 : values.a20 >= 15 ? -1 : -3;
  total += score * 3;
  breakdown.push(scoreComponent('Above 20 MA', `${values.a20.toFixed(2)} pts`, score * 3));

  score = values.a50 >= 55 ? 3 : values.a50 >= 40 ? 2 : values.a50 >= 30 ? 1 : values.a50 >= 20 ? 0 : -2;
  total += score * 2;
  breakdown.push(scoreComponent('Above 50 MA', `${values.a50.toFixed(2)} pts`, score * 2));

  score = values.nb > 40 ? 4 : values.nb > 25 ? 3 : values.nb > 15 ? 2 : values.nb > 5 ? 1 : values.nb >= -5 ? 0 : values.nb > -15 ? -1 : values.nb > -30 ? -2 : -3;
  total += score * 2;
  breakdown.push(scoreComponent('Net Breadth', `${values.nb.toFixed(2)}`, score * 2));

  if (values.wh > 3 && values.wl < 2) score = 3;
  else if (values.wh > 1.5 && values.wl < 2) score = 2;
  else if (values.wh > 0.8 && values.wl < 3) score = 1;
  else if (values.wl > 10) score = -3;
  else if (values.wl > 5) score = -2;
  else if (values.wl > 3) score = -1;
  else if (values.wl > 2) score = -1;
  else score = 0;
  total += score * 2;
  breakdown.push(scoreComponent('52W Hi / Lo', `NH ${values.wh.toFixed(2)} • NL ${values.wl.toFixed(2)}`, score * 2));

  score = values.bosf > 2 ? 3 : values.bosf > 1.5 ? 2 : values.bosf > 1 ? 1 : values.bosf > 0.7 ? 0 : values.bosf > 0.4 ? -1 : -2;
  total += score * 2;
  breakdown.push(scoreComponent('BO S/F Ratio', values.bosf.toFixed(2), score * 2));

  score = values.uhlh > 30 ? 3 : values.uhlh > 10 ? 2 : values.uhlh > 0 ? 1 : values.uhlh > -15 ? 0 : values.uhlh > -30 ? -1 : -2;
  total += score;
  breakdown.push(scoreComponent('UH/LH Ratio', values.uhlh.toFixed(2), score));

  score = values.a200 > 55 ? 2 : values.a200 > 40 ? 1 : values.a200 > 30 ? 0 : values.a200 > 20 ? -1 : -2;
  total += score;
  breakdown.push(scoreComponent('Above 200 MA', `${values.a200.toFixed(2)} pts`, score));

  score = values.vol > 1.5 ? 2 : values.vol > 0.8 ? 1 : values.vol > 0.4 ? 0 : -1;
  total += score;
  breakdown.push(scoreComponent('Volume', values.vol.toFixed(2), score));

  score = values.adv > 15 ? 3 : values.adv > 10 ? 2 : values.adv > 7 ? 1 : values.adv > 4 ? 0 : -1;
  total += score;
  breakdown.push(scoreComponent('4% Advance', `${values.adv.toFixed(2)} pts`, score));

  score = values.nhl > 20 ? 2 : values.nhl > 5 ? 1 : values.nhl >= -5 ? 0 : values.nhl > -20 ? -1 : -2;
  total += score;
  breakdown.push(scoreComponent('Net 15% H-L', values.nhl.toFixed(2), score));

  score = values.bd > 20 ? -3 : values.bd > 12 ? -2 : values.bd > 7 ? -1 : values.bd > 3 ? 0 : 1;
  total += score;
  breakdown.push(scoreComponent('Breakdowns', `${values.bd.toFixed(2)} pts`, score));

  return { currentScore: total, breakdown };
}

function manualValues(input = {}) {
  return {
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
    adv3Pts: n(input.adv3Pts),
    newHigh3Pts: n(input.newHigh3Pts),
    latestDate: input.latestDate || '',
  };
}

function dashboardFieldToPctPoints(value) {
  const parsed = n(value);
  if (parsed == null) return null;
  return parsed * 100;
}

function parseDelimitedRows(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ',';
  return lines.map((line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function isDashboardHeader(cells = []) {
  const joined = cells.join('|').toUpperCase();
  return joined.includes('DATE') && joined.includes('4% ADVANCE') && joined.includes('ABOVE 20 MA') && joined.includes('ABOVE 200 MA');
}

function rowFromDashboardCells(cells = []) {
  if (!cells.length || cells.every((cell) => !String(cell || '').trim())) return null;
  if (cells.length < 33) return null;
  const record = {
    date: String(cells[0] || '').trim(),
    adv: dashboardFieldToPctPoints(cells[6]),
    nb: n(cells[8]),
    vol: n(cells[11]),
    uhlh: n(cells[12]),
    bosf: n(cells[15]),
    bd: dashboardFieldToPctPoints(cells[16]),
    wh: dashboardFieldToPctPoints(cells[23]),
    wl: dashboardFieldToPctPoints(cells[24]),
    nhl: n(cells[28]),
    a20: dashboardFieldToPctPoints(cells[30]),
    a50: dashboardFieldToPctPoints(cells[31]),
    a200: dashboardFieldToPctPoints(cells[32]),
  };
  return Object.values(record).some((value) => value == null || value === '') ? null : record;
}

export function parseDashboardHistoryCsv(text) {
  const rows = parseDelimitedRows(text);
  if (!rows.length) return { rows: [], headerDetected: false };
  const headerDetected = isDashboardHeader(rows[0]);
  const dataRows = (headerDetected ? rows.slice(1) : rows)
    .map(rowFromDashboardCells)
    .filter(Boolean);
  return { rows: dataRows, headerDetected };
}

export function calculateMbi(input = {}) {
  const values = manualValues(input);
  const required = [
    values.a20, values.a50, values.a200, values.nb, values.wh, values.wl,
    values.bosf, values.uhlh, values.vol, values.adv, values.nhl, values.bd,
    values.adv3Pts, values.newHigh3Pts,
  ];

  const partialBreakdown = [values.a20, values.a50, values.a200, values.nb, values.wh, values.wl, values.bosf, values.uhlh, values.vol, values.adv, values.nhl, values.bd].every((value) => value != null)
    ? pillarScores(values)
    : { currentScore: null, breakdown: [] };

  if (required.some((value) => value == null)) {
    return {
      ready: false,
      score: null,
      superMbi: null,
      currentScore: partialBreakdown.currentScore,
      zone: '',
      action: '',
      color: 'slate',
      summary: 'Fill all 11 latest-row fields plus Adv3 and NewHigh3 to calculate SuperMBI.',
      signals: [],
      sellSignals: [],
      breakdown: partialBreakdown.breakdown,
      sizingCards: [],
      statsText: '',
      bucket: partialBreakdown.currentScore == null ? 'Unspecified' : mbiBucketLabel(null),
      latestDate: values.latestDate,
      adv3Pts: values.adv3Pts,
      newHigh3Pts: values.newHigh3Pts,
    };
  }

  const { currentScore, breakdown } = pillarScores(values);
  const superMbi = clamp(31.34 + (0.75 * currentScore) + (0.71 * values.adv3Pts) + (0.40 * values.newHigh3Pts), 0, 100);
  const zoneInfo = superMbiZoneInfo(superMbi);

  const signals = [
    { level: zoneInfo.color === 'green' ? 'positive' : zoneInfo.color === 'blue' ? 'positive' : zoneInfo.color === 'amber' ? 'warning' : 'negative', label: zoneInfo.zone, text: zoneInfo.summary },
    { level: 'neutral', label: 'Workflow', text: 'Use this SuperMBI after market close and apply it as the next-day regime score.' },
  ];

  const sellSignals = [];
  if (superMbi < 55) sellSignals.push({ level: 'warning', label: 'Add rule', text: 'SuperMBI < 55 — do not add aggressively.' });
  if (superMbi < 50) sellSignals.push({ level: 'warning', label: 'Trim rule', text: 'SuperMBI < 50 — trim weaker / later entries and stop adding.' });
  if (superMbi < 45) sellSignals.push({ level: 'negative', label: 'Risk-off', text: 'SuperMBI < 45 — move risk-off and cut open momentum exposure harder. Keep only the best leaders.' });
  if (!sellSignals.length) sellSignals.push({ level: 'positive', label: 'Overlay', text: 'SuperMBI is strong enough that you can keep leaning into valid momentum setups.' });

  const sizingCards = [
    { label: 'CurrentScore', value: String(round(currentScore, 0)), tone: currentScore >= 0 ? 'positive' : 'negative' },
    { label: 'Adv3 pts', value: round(values.adv3Pts, 2).toFixed(2), tone: values.adv3Pts >= 10 ? 'positive' : values.adv3Pts >= 7 ? 'warning' : 'negative' },
    { label: 'NewHigh3 pts', value: round(values.newHigh3Pts, 2).toFixed(2), tone: values.newHigh3Pts >= 1.5 ? 'positive' : values.newHigh3Pts >= 0.8 ? 'warning' : 'negative' },
    { label: 'Participation', value: zoneInfo.participation, tone: zoneInfo.color === 'green' ? 'positive' : zoneInfo.color === 'blue' ? 'positive' : zoneInfo.color === 'amber' ? 'warning' : 'negative' },
    { label: 'Posture', value: zoneInfo.posture, tone: zoneInfo.color === 'green' ? 'positive' : zoneInfo.color === 'blue' ? 'positive' : zoneInfo.color === 'amber' ? 'warning' : 'negative' },
    { label: 'Action', value: zoneInfo.action, tone: zoneInfo.color === 'red' ? 'negative' : zoneInfo.color === 'amber' ? 'warning' : 'positive' },
  ];

  const latestDateText = values.latestDate ? ` • Latest row ${values.latestDate}` : '';
  const statsText = `CurrentScore ${round(currentScore, 0)} • Adv3 ${round(values.adv3Pts, 2).toFixed(2)} pts • NewHigh3 ${round(values.newHigh3Pts, 2).toFixed(2)} pts${latestDateText}`;

  return {
    ready: true,
    score: superMbi,
    superMbi,
    currentScore,
    zone: zoneInfo.zone,
    action: zoneInfo.action,
    color: zoneInfo.color,
    summary: zoneInfo.summary,
    signals,
    sellSignals,
    breakdown,
    sizingCards,
    statsText,
    bucket: mbiBucketLabel(superMbi),
    latestDate: values.latestDate,
    adv3Pts: values.adv3Pts,
    newHigh3Pts: values.newHigh3Pts,
  };
}

export function calculateSuperMbiHistoryFromText(text) {
  const parsed = parseDashboardHistoryCsv(text);
  const enrichedRows = parsed.rows.map((row, index, list) => {
    const base = pillarScores(row);
    const adv3Pts = index >= 2 ? round((list[index].adv + list[index - 1].adv + list[index - 2].adv) / 3, 4) : null;
    const newHigh3Pts = index >= 2 ? round((list[index].wh + list[index - 1].wh + list[index - 2].wh) / 3, 4) : null;
    const superMbi = adv3Pts == null || newHigh3Pts == null
      ? null
      : clamp(31.34 + (0.75 * base.currentScore) + (0.71 * adv3Pts) + (0.40 * newHigh3Pts), 0, 100);
    const zoneInfo = superMbi == null ? superMbiZoneInfo(null) : superMbiZoneInfo(superMbi);
    return {
      ...row,
      currentScore: base.currentScore,
      adv3Pts,
      newHigh3Pts,
      superMbi,
      zone: zoneInfo.zone,
      action: zoneInfo.action,
      color: zoneInfo.color,
    };
  });

  const latest = enrichedRows.length ? enrichedRows[enrichedRows.length - 1] : null;
  return {
    rows: enrichedRows,
    latest,
    headerDetected: parsed.headerDetected,
    summary: {
      rowCount: enrichedRows.length,
      latestDate: latest?.date || '',
      readyRowCount: enrichedRows.filter((row) => row.superMbi != null).length,
    },
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
    advice = 'Past the max hold window. Review whether the trade still deserves capital.';
  } else if (pnlPercent < 0 && daysHeld > 5) {
    advice = `Still red after ${daysHeld} days. Consider cutting the laggard.`;
  } else if (pnlPercent >= 5) {
    advice = 'At +5% or better. Consider selling partial size and trailing the rest.';
  } else if (pnlPercent >= 2) {
    advice = 'Move stop to breakeven and let the trade work.';
  } else if (pnlPercent >= 0) {
    advice = 'Small profit. Hold only if the regime and setup still support the trade.';
  } else {
    advice = 'Small loss. Let the regime score decide whether the position still deserves patience.';
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
      level: mbiScore < 45 ? 'negative' : mbiScore < 50 ? 'warning' : mbiScore < 55 ? 'warning' : 'neutral',
      question: 'What is the current SuperMBI regime?',
      action: mbiScore < 45
        ? 'SKIP regime. Move risk-off and cut open momentum exposure harder.'
        : mbiScore < 50
          ? 'WATCH regime. Trim weaker / later entries and stop adding.'
          : mbiScore < 55
            ? 'PILOT regime. Do not add aggressively.'
            : 'SuperMBI is supportive enough that the regime alone is not forcing an exit.',
    },
    {
      order: 3,
      level: lows52wPercent > 5 ? 'negative' : lows52wPercent > 2 ? 'warning' : 'neutral',
      question: 'Are 52W lows expanding?',
      action: lows52wPercent > 5 ? '52W lows > 5% is severe damage. Treat the tape defensively.' : lows52wPercent > 2 ? '52W lows > 2% means be selective and keep stops tighter.' : 'Breadth damage is not extreme yet.',
    },
    {
      order: 4,
      level: above20maPercent < 20 ? 'warning' : 'neutral',
      question: 'Is Above 20 MA below 20 points?',
      action: above20maPercent < 20 ? 'Breadth is weak. Tighten stops and avoid giving back gains.' : 'Breadth is not in deep-correction territory.',
    },
    {
      order: 5,
      level: daysHeld > 15 ? 'warning' : pnlPercent >= 5 ? 'positive' : pnlPercent >= 2 ? 'positive' : 'neutral',
      question: 'Has time or target management triggered?',
      action: daysHeld > 15 ? `Held for ${daysHeld} days. Review whether the trade has overstayed.` : pnlPercent >= 5 ? 'Take partial profits and trail the remainder.' : pnlPercent >= 2 ? 'Move stop to breakeven and keep managing the winner.' : 'No time/target trigger yet.',
    },
  ];
}
