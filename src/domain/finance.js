import { BALANCE_DEFAULTS, PASSIVE_MULTIPLIERS } from './balanceConfig';

export function getProfessionById(config, id) {
  return config?.professions?.find((item) => item.id === id);
}

export function computeLivingCost(professionId, rules) {
  if (!rules?.livingCost) {
    return 0;
  }
  const overrides = rules.livingCost.professionOverrides || {};
  return overrides[professionId] || rules.livingCost.defaultMonthly || 0;
}

export function computeCreditLimit({ profession, netWorth, salary, rules }) {
  if (!rules?.loans?.creditLimit || !profession) {
    return profession?.creditLimitBase || 0;
  }
  const base = profession.creditLimitBase || 0;
  const netWorthMultiplier =
    rules.loans.creditLimit.netWorthMultiplier ??
    BALANCE_DEFAULTS.creditLimit.netWorthMultiplier;
  const salaryMultiplier =
    rules.loans.creditLimit.salaryMultiplier ??
    BALANCE_DEFAULTS.creditLimit.salaryMultiplier;
  const formulaValue = Math.max(base, netWorthMultiplier * netWorth + salaryMultiplier * salary);
  const capMultiplier =
    rules.loans.creditLimit.capMultiplier ?? BALANCE_DEFAULTS.creditLimit.capMultiplier;
  const maxLimit = base * capMultiplier;
  return Math.min(formulaValue, maxLimit || formulaValue);
}

export function calculateHoldingsValue(investments = {}, priceState = {}) {
  return Object.entries(investments).reduce((acc, [instrumentId, position]) => {
    const price = priceState[instrumentId]?.price || 0;
    return acc + position.units * price;
  }, 0);
}

export function sumExpenseBreakdown(breakdown = {}) {
  return Object.values(breakdown || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export function getMonthlyExpenses(profession) {
  if (!profession) return 0;
  const breakdownTotal = sumExpenseBreakdown(profession.monthlyExpenseBreakdown || {});
  if (breakdownTotal > 0) return breakdownTotal;
  return profession.monthlyExpenses || 0;
}

export function getPassiveMultiplier(type) {
  if (!type) return PASSIVE_MULTIPLIERS.stocks;
  return PASSIVE_MULTIPLIERS[type] || 0.001;
}

export function calculatePassiveIncome(investments = {}, priceState = {}, instrumentMap = {}) {
  return Object.entries(investments).reduce((total, [instrumentId, position]) => {
    const info = instrumentMap[instrumentId];
    const price = priceState[instrumentId]?.price || 0;
    const value = position.units * price;
    const type = info?.type || 'stocks';
    const multiplier = getPassiveMultiplier(type);
    return total + value * multiplier;
  }, 0);
}

export function buildPortfolioSummary(investments = {}, priceState = {}, instruments = []) {
  const rows = instruments.map((instrument) => {
    const holding = investments[instrument.id];
    const price = priceState[instrument.id]?.price || instrument.initialPrice;
    const units = holding?.units || 0;
    const value = units * price;
    return {
      id: instrument.id,
      title: instrument.title,
      value,
      units,
      price,
    };
  });
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  return rows.map((row) => ({ ...row, allocation: row.value / total }));
}

export function estimateMonthlyDebtInterest({
  debt = 0,
  apr = 0,
  lastTurnInterest,
  preferLastTurn = true,
} = {}) {
  if (preferLastTurn && typeof lastTurnInterest === 'number' && !Number.isNaN(lastTurnInterest)) {
    return Math.max(0, Math.round(lastTurnInterest));
  }
  const baseDebt = Math.max(0, Math.round(debt || 0));
  if (baseDebt <= 0 || apr <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(baseDebt * apr));
}

function checkWinCondition(rule, metrics) {
  switch (rule.type) {
    case 'passive_income_cover_costs':
      return metrics.passiveIncome >= metrics.recurringExpenses;
    case 'net_worth_reach':
      return metrics.netWorth >= rule.target;
    default:
      return false;
  }
}

function checkLoseCondition(rule, metrics) {
  switch (rule.type) {
    case 'no_liquidity_no_credit':
      return metrics.cash <= 0 && metrics.availableCredit <= 0;
    case 'insolvency':
    case 'negative_cashflow_debt_growing':
      return metrics.monthlyCashFlow < 0 && metrics.debtDelta > 0;
    case 'debt_ratio':
      return metrics.debt >= metrics.netWorth * (rule.minDebtToNetWorth || 1);
    default:
      return false;
  }
}

export function evaluateGoals({ rules, trackers }, metrics) {
  const winRules = rules?.win || [];
  const loseRules = rules?.lose || [];
  const winTrackers = { ...(trackers?.win || {}) };
  const loseTrackers = { ...(trackers?.lose || {}) };
  let achievedWin = null;
  winRules.forEach((rule) => {
    if (checkWinCondition(rule, metrics)) {
      winTrackers[rule.id] = (winTrackers[rule.id] || 0) + 1;
      if (
        !achievedWin &&
        winTrackers[rule.id] >= (rule.requiredStreakMonths || 1)
      ) {
        achievedWin = rule;
      }
    } else {
      winTrackers[rule.id] = 0;
    }
  });
  let failedRule = null;
  loseRules.forEach((rule) => {
    if (checkLoseCondition(rule, metrics)) {
      loseTrackers[rule.id] = (loseTrackers[rule.id] || 0) + 1;
      if (
        !failedRule &&
        loseTrackers[rule.id] >= (rule.consecutiveMonths || 1)
      ) {
        failedRule = rule;
      }
    } else {
      loseTrackers[rule.id] = 0;
    }
  });
  return {
    win: achievedWin,
    lose: failedRule,
    trackers: {
      win: winTrackers,
      lose: loseTrackers,
    },
  };
}
