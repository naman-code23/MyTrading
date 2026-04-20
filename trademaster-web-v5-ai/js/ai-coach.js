import { attachMetrics, summarizeJournal, weekdayBreakdown } from './trade-engine.js';
import { mbiBucketLabel } from './mbi.js';
import { round } from './utils.js';

function safeDiv(a, b) {
  return b ? a / b : 0;
}

function holdBucketLabel(minutes) {
  const total = Number(minutes || 0);
  if (total <= 390) return 'Same day';
  if (total <= 3 * 1440) return '1-3d';
  if (total <= 10 * 1440) return '4-10d';
  if (total <= 20 * 1440) return '11-20d';
  return '21d+';
}

function groupClosedTrades(items, labelFn) {
  const bucket = new Map();
  for (const trade of items) {
    const label = labelFn(trade) || 'Unspecified';
    const current = bucket.get(label) || { label, trades: 0, wins: 0, pnl: 0, avgPnl: 0, winRate: 0 };
    current.trades += 1;
    current.pnl += trade.metrics.realizedNetPnl;
    if (trade.metrics.realizedNetPnl > 0) current.wins += 1;
    bucket.set(label, current);
  }
  return [...bucket.values()]
    .map((item) => ({
      ...item,
      pnl: round(item.pnl),
      avgPnl: round(safeDiv(item.pnl, item.trades)),
      winRate: round(safeDiv(item.wins * 100, item.trades), 1),
    }))
    .sort((a, b) => b.pnl - a.pnl || b.trades - a.trades);
}

function pickBest(items, minTrades = 2) {
  return items.filter((item) => item.trades >= minTrades).sort((a, b) => b.pnl - a.pnl || b.winRate - a.winRate)[0] || null;
}

function pickWorst(items, minTrades = 2) {
  return items.filter((item) => item.trades >= minTrades).sort((a, b) => a.pnl - b.pnl || a.winRate - b.winRate)[0] || null;
}

function currencyNumber(value) {
  const rounded = Math.round(Number(value || 0));
  return rounded.toLocaleString('en-IN');
}

function buildNarrative({ summary, bestStrategy, worstStrategy, bestMbi, weakMbi, bestHold, weakHold, bestWeekday, worstWeekday }) {
  const parts = [];
  if (summary.closedTradeCount < 5) {
    return 'There is not enough closed-trade history yet for a high-confidence coach read. Import more tradebook history or log a few more completed trades.';
  }

  if (summary.netPnl > 0) {
    parts.push(`Your closed sample is profitable, with expectancy above zero and ${summary.winCount}/${summary.closedTradeCount} winning trades.`);
  } else if (summary.netPnl < 0) {
    parts.push(`The current closed sample is negative, so the priority is cutting the biggest leak before adding more size.`);
  } else {
    parts.push('Your closed sample is flat right now, so edge is being cancelled out by one or two weak habits.');
  }

  if (bestStrategy) {
    parts.push(`${bestStrategy.label} is your strongest repeatable setup so far, producing ₹${currencyNumber(bestStrategy.pnl)} across ${bestStrategy.trades} closed trades.`);
  }
  if (worstStrategy && bestStrategy && worstStrategy.label !== bestStrategy.label && worstStrategy.pnl < 0) {
    parts.push(`${worstStrategy.label} is dragging results, so it should either be reduced in size or reviewed before the next attempt.`);
  }
  if (bestMbi && weakMbi && bestMbi.label !== weakMbi.label) {
    parts.push(`Your best regime is ${bestMbi.label} MBI, while ${weakMbi.label} is the weakest regime in the log.`);
  }
  if (bestHold && weakHold && bestHold.label !== weakHold.label) {
    parts.push(`Hold-time data says ${bestHold.label} works better than ${weakHold.label}, which is useful for tightening exits.`);
  }
  if (bestWeekday && worstWeekday && bestWeekday.label !== worstWeekday.label) {
    parts.push(`${bestWeekday.label} is currently stronger than ${worstWeekday.label}, so you can be more selective on the weaker day.`);
  }

  return parts.join(' ');
}

function addUnique(target, item) {
  if (!item) return;
  if (!target.includes(item)) target.push(item);
}

function buildPrompt(report) {
  return [
    'Review my trading journal and give me a concrete improvement plan.',
    '',
    `Coach verdict: ${report.verdict} (${report.score}/100)`,
    `Closed trades: ${report.summary.closedTradeCount}`,
    `Net P&L: ${report.summary.netPnl}`,
    `Win rate: ${round(report.summary.winRate, 1)}%`,
    `Profit factor: ${report.summary.profitFactor ? round(report.summary.profitFactor, 2) : 'n/a'}`,
    `Expectancy: ${round(report.summary.expectancy, 2)}`,
    `Max drawdown: ${report.summary.maxDrawdown}`,
    '',
    'Strengths:',
    ...report.strengths.map((item) => `- ${item}`),
    '',
    'Leaks:',
    ...report.leaks.map((item) => `- ${item}`),
    '',
    'Next actions:',
    ...report.actions.map((item) => `- ${item}`),
    '',
    'Pattern map:',
    ...report.patternCards.map((item) => `- ${item.label}: ${item.value}${item.note ? ` (${item.note})` : ''}`),
  ].join('\n');
}

export function buildAiCoachReport(trades, method) {
  const summary = summarizeJournal(trades, method);
  const closed = attachMetrics(trades, method).filter((trade) => trade.metrics.status === 'CLOSED');
  const closedWithStrategy = closed.filter((trade) => trade.strategy);
  const closedWithMbi = closed.filter((trade) => Number.isFinite(Number(trade.mbiScore)));

  if (!closed.length) {
    return {
      ready: false,
      score: 0,
      verdict: 'Need closed trades',
      summaryText: 'Log or import at least one completed trade to unlock coach analysis.',
      strengths: [],
      leaks: [],
      actions: ['Import your broker tradebook CSV to seed the journal faster.', 'Tag each trade with a strategy and MBI snapshot for sharper analysis.'],
      patternCards: [],
      summary,
      series: {
        mbiBuckets: [],
        holdBuckets: [],
      },
      promptText: 'No closed trades yet.',
    };
  }

  const strategyStats = groupClosedTrades(closed, (trade) => trade.strategy || 'Unspecified');
  const mbiStats = groupClosedTrades(closedWithMbi, (trade) => mbiBucketLabel(Number(trade.mbiScore)));
  const holdStats = groupClosedTrades(closed, (trade) => holdBucketLabel(trade.metrics.holdMinutes));
  const directionStats = groupClosedTrades(closed, (trade) => trade.direction || 'LONG');
  const weekdayStats = weekdayBreakdown(trades, method)
    .filter((item) => item.trades > 0)
    .map((item) => ({ ...item, label: item.label, pnl: item.pnl, trades: item.trades, winRate: item.winRate }));

  const bestStrategy = pickBest(strategyStats, 2);
  const worstStrategy = pickWorst(strategyStats, 2);
  const bestMbi = pickBest(mbiStats, 2);
  const weakMbi = pickWorst(mbiStats, 2);
  const bestHold = pickBest(holdStats, 2);
  const weakHold = pickWorst(holdStats, 2);
  const bestDirection = pickBest(directionStats, 2);
  const weakDirection = pickWorst(directionStats, 2);
  const bestWeekday = weekdayStats.filter((item) => item.trades >= 2).sort((a, b) => b.pnl - a.pnl || b.winRate - a.winRate)[0] || null;
  const worstWeekday = weekdayStats.filter((item) => item.trades >= 2).sort((a, b) => a.pnl - b.pnl || a.winRate - b.winRate)[0] || null;

  const avgLossAbs = Math.abs(summary.avgLoss || 0);
  const avgWinAbs = Math.abs(summary.avgWin || 0);
  const rewardRisk = avgLossAbs > 0 ? avgWinAbs / avgLossAbs : 0;
  const missingStrategyCount = closed.filter((trade) => !trade.strategy).length;
  const missingMbiCount = closed.filter((trade) => !Number.isFinite(Number(trade.mbiScore))).length;

  let score = 50;
  if (summary.netPnl > 0) score += 12;
  else if (summary.netPnl < 0) score -= 12;
  if ((summary.profitFactor || 0) >= 1.8) score += 12;
  else if ((summary.profitFactor || 0) >= 1.2) score += 6;
  else if ((summary.profitFactor || 0) > 0 && (summary.profitFactor || 0) < 1) score -= 10;
  if (summary.expectancy > 0) score += 8;
  else if (summary.expectancy < 0) score -= 8;
  if (rewardRisk >= 1.5) score += 8;
  else if (rewardRisk > 0 && rewardRisk < 1) score -= 8;
  if (summary.winRate >= 55) score += 5;
  else if (summary.winRate < 40) score -= 5;
  if (summary.bestLossStreak >= 3) score -= 6;
  if (missingStrategyCount > closed.length / 2) score -= 4;
  if (missingMbiCount > closed.length / 2) score -= 4;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let verdict = 'Stabilising';
  if (score >= 80) verdict = 'Strong edge';
  else if (score >= 65) verdict = 'Productive';
  else if (score >= 50) verdict = 'Improving';
  else if (score >= 35) verdict = 'Fragile';
  else verdict = 'Capital first';

  const strengths = [];
  const leaks = [];
  const actions = [];

  if (summary.netPnl > 0) addUnique(strengths, `Closed trades are net positive by ₹${currencyNumber(summary.netPnl)}.`);
  if ((summary.profitFactor || 0) >= 1.5) addUnique(strengths, `Profit factor is ${round(summary.profitFactor, 2)}, which means winners are paying for mistakes.`);
  if (rewardRisk >= 1.3) addUnique(strengths, `Average win is ${round(rewardRisk, 2)}x the average loss, which is healthy reward-to-risk.`);
  if (bestStrategy) addUnique(strengths, `${bestStrategy.label} is the strongest strategy bucket so far (${bestStrategy.trades} trades, ₹${currencyNumber(bestStrategy.pnl)}).`);
  if (bestMbi && bestMbi.pnl > 0) addUnique(strengths, `${bestMbi.label} MBI trades are the strongest market regime in your journal.`);
  if (bestHold && bestHold.pnl > 0) addUnique(strengths, `${bestHold.label} is your best hold-time bucket, so timing is creating edge there.`);
  if (bestDirection && bestDirection.pnl > 0) addUnique(strengths, `${bestDirection.label} trades are currently outperforming the opposite side.`);

  if (summary.netPnl < 0) addUnique(leaks, `Closed trades are down ₹${currencyNumber(summary.netPnl)}. The priority is stopping the biggest repeated leak.`);
  if ((summary.profitFactor || 0) > 0 && (summary.profitFactor || 0) < 1.1) addUnique(leaks, `Profit factor is only ${round(summary.profitFactor, 2)}, so the edge is too thin right now.`);
  if (rewardRisk > 0 && rewardRisk < 1) addUnique(leaks, `Average loss is larger than average win. Stops or late exits are giving back too much.`);
  if (summary.bestLossStreak >= 3) addUnique(leaks, `You hit a ${summary.bestLossStreak}-trade losing streak. Risk should automatically step down during drawdowns.`);
  if (worstStrategy && worstStrategy.pnl < 0) addUnique(leaks, `${worstStrategy.label} is the weakest strategy bucket (${worstStrategy.trades} trades, ₹${currencyNumber(worstStrategy.pnl)}).`);
  if (weakMbi && weakMbi.pnl < 0) addUnique(leaks, `${weakMbi.label} MBI trades are underperforming and should be filtered harder.`);
  if (weakHold && weakHold.pnl < 0) addUnique(leaks, `${weakHold.label} is the weakest hold bucket, so exits or patience there need work.`);
  if (weakDirection && weakDirection.label !== bestDirection?.label && weakDirection.pnl < 0) addUnique(leaks, `${weakDirection.label} trades are weaker than the opposite direction in the current sample.`);

  if (bestStrategy) addUnique(actions, `Allocate more attention to ${bestStrategy.label} and reduce experimentation outside that playbook until consistency improves.`);
  if (worstStrategy && worstStrategy.pnl < 0) addUnique(actions, `Cut size in ${worstStrategy.label} by at least 50% until you review screenshots and notes from every loser.`);
  if (weakMbi && weakMbi.pnl < 0) addUnique(actions, `Add a hard filter: avoid fresh trades in ${weakMbi.label} MBI conditions unless the setup is exceptional.`);
  if (weakHold && weakHold.label !== bestHold?.label) addUnique(actions, `Your weakest hold bucket is ${weakHold.label}. Tighten exits or stop adding there.`);
  if (summary.bestLossStreak >= 3) addUnique(actions, 'After two consecutive losses, cut the next trade risk in half until a green close appears.');
  if (bestWeekday && worstWeekday && bestWeekday.label !== worstWeekday.label) addUnique(actions, `Be more selective on ${worstWeekday.label}; your strongest weekday is ${bestWeekday.label}.`);
  if (missingStrategyCount > 0) addUnique(actions, `Add strategy tags on every trade. ${missingStrategyCount} closed trades are still unclassified.`);
  if (missingMbiCount > 0) addUnique(actions, `Capture the MBI snapshot on every trade. ${missingMbiCount} closed trades are missing regime data.`);

  if (!strengths.length) addUnique(strengths, 'The sample is still small, so the main strength right now is getting clean data into the journal.');
  if (!leaks.length) addUnique(leaks, 'No single leak dominates the sample yet. Keep logging cleanly and the coach will sharpen.');
  if (!actions.length) addUnique(actions, 'Keep importing trades and tagging strategy + MBI so the coach can generate sharper improvement plans.');

  const patternCards = [
    bestStrategy ? { label: 'Best strategy', value: bestStrategy.label, note: `₹${currencyNumber(bestStrategy.pnl)} across ${bestStrategy.trades} trades`, tone: 'positive' } : null,
    worstStrategy ? { label: 'Weakest strategy', value: worstStrategy.label, note: `₹${currencyNumber(worstStrategy.pnl)} across ${worstStrategy.trades} trades`, tone: worstStrategy.pnl < 0 ? 'negative' : 'warning' } : null,
    bestMbi ? { label: 'Best MBI bucket', value: bestMbi.label, note: `₹${currencyNumber(bestMbi.pnl)} • ${bestMbi.winRate}% WR`, tone: 'positive' } : null,
    weakMbi ? { label: 'Weak MBI bucket', value: weakMbi.label, note: `₹${currencyNumber(weakMbi.pnl)} • ${weakMbi.winRate}% WR`, tone: weakMbi.pnl < 0 ? 'negative' : 'warning' } : null,
    bestHold ? { label: 'Best hold bucket', value: bestHold.label, note: `₹${currencyNumber(bestHold.pnl)} • ${bestHold.winRate}% WR`, tone: 'positive' } : null,
    weakHold ? { label: 'Weak hold bucket', value: weakHold.label, note: `₹${currencyNumber(weakHold.pnl)} • ${weakHold.winRate}% WR`, tone: weakHold.pnl < 0 ? 'negative' : 'warning' } : null,
    bestWeekday ? { label: 'Best weekday', value: bestWeekday.label, note: `₹${currencyNumber(bestWeekday.pnl)} • ${bestWeekday.winRate}% WR`, tone: 'positive' } : null,
    worstWeekday ? { label: 'Weak weekday', value: worstWeekday.label, note: `₹${currencyNumber(worstWeekday.pnl)} • ${worstWeekday.winRate}% WR`, tone: worstWeekday.pnl < 0 ? 'negative' : 'warning' } : null,
  ].filter(Boolean);

  const report = {
    ready: true,
    score,
    verdict,
    summaryText: buildNarrative({ summary, bestStrategy, worstStrategy, bestMbi, weakMbi, bestHold, weakHold, bestWeekday, worstWeekday }),
    strengths: strengths.slice(0, 6),
    leaks: leaks.slice(0, 6),
    actions: actions.slice(0, 6),
    patternCards,
    summary,
    series: {
      mbiBuckets: mbiStats,
      holdBuckets: holdStats,
      directions: directionStats,
    },
  };
  report.promptText = buildPrompt(report);
  return report;
}
