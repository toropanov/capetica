import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedPriceState, simulateMarkets } from '../src/domain/marketSimulator.js';
import {
  calculateHoldingsValue,
  calculatePassiveIncome,
  computeLivingCost,
  computeCreditLimit,
  evaluateGoals,
  getMonthlyExpenses,
} from '../src/domain/finance.js';
import { ensureSeed, uniformFromSeed, seedFromString } from '../src/domain/rng.js';
import { DEAL_TEMPLATES, DEAL_WINDOW_RULES } from '../src/domain/deals.js';
import { BALANCE_DEFAULTS } from '../src/domain/balanceConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_DIR = path.resolve(__dirname, '../reports');
const DEFAULT_RUNS = 10000;
const DEFAULT_MONTHS = 60;
const DEFAULT_SEED = 12345;

const roundMoney = (value) => Math.round(value ?? 0);

function loadJson(relativePath) {
  const fullPath = path.resolve(__dirname, '..', relativePath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

function pickDealDuration(rule, rollValue = 0.5) {
  if (!rule) return 3;
  const minTurns = Math.max(1, Math.floor(rule.minTurns ?? 2));
  const maxTurns = Math.max(minTurns, Math.floor(rule.maxTurns ?? minTurns));
  const span = maxTurns - minTurns + 1;
  const bucket = Math.min(span - 1, Math.max(0, Math.floor((rollValue ?? 0) * span)));
  return minTurns + bucket;
}

function initDealWindows(seed) {
  let cursor = ensureSeed(seed ?? Date.now());
  const state = {};
  Object.entries(DEAL_WINDOW_RULES).forEach(([dealId, rule]) => {
    const roll = uniformFromSeed(cursor);
    cursor = roll.seed;
    const duration = pickDealDuration(rule, roll.value);
    state[dealId] = {
      expiresIn: duration,
      slotsLeft: rule.slots ?? 1,
      maxSlots: rule.slots ?? 1,
    };
  });
  return state;
}

function advanceDealWindows(current = {}, seed) {
  let cursor = ensureSeed(seed ?? Date.now());
  const state = {};
  Object.entries(DEAL_WINDOW_RULES).forEach(([dealId, rule]) => {
    const existing = current[dealId];
    let expiresIn =
      typeof existing?.expiresIn === 'number'
        ? existing.expiresIn - 1
        : pickDealDuration(rule, 0.5);
    let slotsLeft =
      typeof existing?.slotsLeft === 'number' ? existing.slotsLeft : rule.slots ?? 1;
    let maxSlots = existing?.maxSlots ?? rule.slots ?? 1;
    if (expiresIn <= 0) {
      const roll = uniformFromSeed(cursor);
      cursor = roll.seed;
      const duration = pickDealDuration(rule, roll.value);
      expiresIn = duration;
      slotsLeft = rule.slots ?? 1;
      maxSlots = rule.slots ?? 1;
    }
    state[dealId] = {
      expiresIn,
      slotsLeft,
      maxSlots,
    };
  });
  return { state, seed: cursor };
}

function applyOutcomeToState(state, outcome = {}) {
  const patch = {};
  if (typeof outcome.cashDelta === 'number') {
    patch.cash = roundMoney(state.cash + outcome.cashDelta);
  }
  if (typeof outcome.salaryBonusDelta === 'number') {
    patch.salaryBonus = roundMoney(state.salaryBonus + outcome.salaryBonusDelta);
  }
  if (typeof outcome.recurringDelta === 'number') {
    const next = Math.max(0, roundMoney((state.recurringExpenses || 0) + outcome.recurringDelta));
    patch.recurringExpenses = next;
  }
  if (typeof outcome.debtDelta === 'number') {
    const nextDebt = Math.max(0, roundMoney(state.debt + outcome.debtDelta));
    patch.debt = nextDebt;
  }
  if (typeof outcome.joblessMonths === 'number') {
    patch.joblessMonths = Math.max(0, Math.round(outcome.joblessMonths));
  }
  if (typeof outcome.salaryCutMonths === 'number') {
    patch.salaryCutMonths = Math.max(0, Math.round(outcome.salaryCutMonths));
    patch.salaryCutAmount = Math.max(0, Math.round(outcome.salaryCutAmount || 0));
  }
  return patch;
}

function rollRandomEvent(state, seed, events = []) {
  if (!events.length) {
    return { event: null, seed, patch: {}, protections: null };
  }
  let cursorSeed = seed;
  const difficultyKey = state.difficulty || BALANCE_DEFAULTS.defaultDifficulty;
  const eventThreshold =
    BALANCE_DEFAULTS.difficultyPresets[difficultyKey]?.eventChance ??
    BALANCE_DEFAULTS.difficultyPresets[BALANCE_DEFAULTS.defaultDifficulty].eventChance;
  const rollChance = uniformFromSeed(cursorSeed);
  cursorSeed = rollChance.seed;
  if (rollChance.value > eventThreshold) {
    return { event: null, seed: cursorSeed, patch: {}, protections: null };
  }
  const pickRoll = uniformFromSeed(cursorSeed);
  cursorSeed = pickRoll.seed;
  const index = Math.min(events.length - 1, Math.floor(pickRoll.value * events.length));
  const event = events[index];
  const confirm = uniformFromSeed(cursorSeed);
  cursorSeed = confirm.seed;
  if (confirm.value > (event.chance ?? 0.5)) {
    return { event: null, seed: cursorSeed, patch: {}, protections: null };
  }
  if (event.protectionKey && state.protections?.[event.protectionKey]) {
    const protections = {
      ...state.protections,
      [event.protectionKey]: false,
    };
    return {
      event: { ...event, prevented: true },
      seed: cursorSeed,
      patch: {},
      protections,
    };
  }
  const patch = applyOutcomeToState(state, event.effect);
  return {
    event,
    seed: cursorSeed,
    patch,
    protections: null,
  };
}

function getActionType(action) {
  if (!action) return 'other';
  if (action.type === 'chance') return 'chance';
  if (action.effect === 'salary_up') return 'salary_up';
  if (action.effect === 'expense_down') return 'expense_down';
  if (action.effect === 'cost_down') return 'cost_down';
  if (action.effect === 'protection') return 'protection';
  if (action.effect === 'take_credit') return 'take_credit';
  if (action.id === 'debt_payment') return 'debt_payment';
  return 'other';
}

function buildWeightedPool(actions = [], options = {}) {
  const typeWeights = options.typeWeights || {};
  const pool = [];
  actions.forEach((action) => {
    const type = getActionType(action);
    const weight = Math.max(0, Math.round(typeWeights[type] ?? 1));
    if (weight <= 0) return;
    for (let i = 0; i < weight; i += 1) {
      pool.push(action.id);
    }
  });
  return pool.length ? pool : actions.map((item) => item.id);
}

function rollMonthlyActions(seed, actions = [], options = {}) {
  let cursor = seed ?? ensureSeed();
  const pool = buildWeightedPool(actions, options);
  const limit = Math.min(options.count ?? BALANCE_DEFAULTS.homeAction.defaultCount, pool.length);
  if (!limit) {
    return { actions: [], seed: cursor };
  }
  const rawChance =
    typeof options.showChance === 'number'
      ? options.showChance
      : BALANCE_DEFAULTS.homeAction.defaultShowChance;
  const showChance = Math.min(1, Math.max(0, rawChance));
  if (showChance <= 0) {
    return { actions: [], seed: cursor };
  }
  const showRoll = uniformFromSeed(cursor);
  cursor = showRoll.seed;
  if (showRoll.value > showChance) {
    return { actions: [], seed: cursor };
  }
  const picked = new Set();
  while (picked.size < limit) {
    const roll = uniformFromSeed(cursor);
    cursor = roll.seed;
    const index = Math.min(pool.length - 1, Math.floor(roll.value * pool.length));
    picked.add(pool[index]);
  }
  const selected = actions.filter((item) => picked.has(item.id));
  return { actions: selected, seed: cursor };
}

function createInitialState(profession, configs, seed) {
  const instrumentList = configs.instruments?.instruments || [];
  const seededPrices = seedPriceState(instrumentList, seed);
  const holdings = {};
  Object.entries(profession.startingPortfolio || {}).forEach(([instrumentId, units]) => {
    holdings[instrumentId] = {
      units,
      costBasis: (seededPrices[instrumentId]?.price || 0) * units,
      leveragedUnits: 0,
      leveragedCost: 0,
    };
  });
  const cash = profession.startingMoney || 0;
  const debt = profession.startingDebt || 0;
  const holdingsValue = calculateHoldingsValue(holdings, seededPrices);
  const netWorth = cash + holdingsValue - debt;
  const salary = profession.salaryMonthly || 0;
  const livingBase = configs.rules ? computeLivingCost(profession.id, configs.rules) : 0;
  const recurringExpenses = Math.max(
    0,
    Math.round(getMonthlyExpenses(profession) + livingBase),
  );
  const creditLimit = computeCreditLimit({
    profession,
    netWorth,
    salary,
    rules: configs.rules,
  });
  const dealWindows = initDealWindows(seed);
  const salaryProgression = profession.salaryProgression
    ? {
        ...profession.salaryProgression,
        monthsUntilStep: profession.salaryProgression.stepMonths || 1,
        currentBase: profession.salaryMonthly || 0,
      }
    : null;
  return {
    profession,
    month: 0,
    cash,
    debt,
    salaryBonus: 0,
    recurringExpenses,
    livingCost: livingBase,
    protections: {
      healthPlan: false,
      legalShield: false,
      techShield: false,
    },
    investments: holdings,
    priceState: seededPrices,
    shockState: {},
    trackers: { win: {}, lose: {} },
    winCondition: null,
    loseCondition: null,
    creditLimit,
    availableCredit: creditLimit - debt,
    creditBucket: 0,
    creditDraws: debt > 0 ? [{ balance: debt }] : [],
    dealParticipations: [],
    joblessMonths: 0,
    salaryCutMonths: 0,
    salaryCutAmount: 0,
    dealWindows,
    salaryProgression,
    difficulty: BALANCE_DEFAULTS.defaultDifficulty,
    rngSeed: seed,
  };
}

function classifyAction(action) {
  if (action.type === 'chance') return 'chance';
  if (action.effect === 'salary_up') return 'salary_up';
  if (action.effect === 'expense_down') return 'expense_down';
  if (action.effect === 'cost_down') return 'cost_down';
  if (action.effect === 'protection') return 'protection';
  if (action.effect === 'take_credit') return 'take_credit';
  if (action.id === 'debt_payment') return 'debt_payment';
  return 'other';
}

function scoreAction(action) {
  if (action.type === 'chance') {
    const p = action.chanceSuccess ?? 0.5;
    const win = action.success?.cashDelta ?? 0;
    const fail = action.fail?.cashDelta ?? 0;
    const cost = action.cost ?? 0;
    return -cost + p * win + (1 - p) * fail;
  }
  if (action.effect === 'salary_up') {
    const value = action.value || 0;
    const cost = action.cost || 1;
    return value > 0 ? cost / value : Number.POSITIVE_INFINITY;
  }
  if (action.effect === 'expense_down' || action.effect === 'cost_down') {
    const value = action.value || 0;
    const cost = action.cost || 1;
    return value > 0 ? cost / value : Number.POSITIVE_INFINITY;
  }
  return 0;
}

function pickAction(policy, state, availableActions, rngSeed) {
  if (!availableActions?.length) return { action: null, seed: rngSeed };
  const actions = availableActions.filter((action) => (action.cost || 0) <= state.cash);
  if (!actions.length) return { action: null, seed: rngSeed };
  const byType = new Map();
  actions.forEach((action) => {
    const key = classifyAction(action);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(action);
  });
  const buffer = policy.cashBufferMultiplier * (state.recurringExpenses || 0);
  if (policy.allowDebtPayment && byType.has('debt_payment') && state.debt > 0 && state.cash > buffer) {
    return { action: byType.get('debt_payment')[0], seed: rngSeed };
  }
  if (policy.allowProtection && byType.has('protection')) {
    const protection = byType
      .get('protection')
      .find((action) => !state.protections?.[action.protectionKey] && (action.cost || 0) <= state.cash - buffer);
    if (protection) return { action: protection, seed: rngSeed };
  }
  const salaryActions = byType.get('salary_up') || [];
  const expenseActions = [...(byType.get('expense_down') || []), ...(byType.get('cost_down') || [])];
  const bestSalary = salaryActions
    .map((action) => ({ action, score: scoreAction(action) }))
    .sort((a, b) => a.score - b.score)[0];
  const bestExpense = expenseActions
    .map((action) => ({ action, score: scoreAction(action) }))
    .sort((a, b) => a.score - b.score)[0];
  if (bestSalary && bestSalary.score <= policy.salaryRoiMonths) {
    return { action: bestSalary.action, seed: rngSeed };
  }
  if (bestExpense && bestExpense.score <= policy.expenseRoiMonths) {
    return { action: bestExpense.action, seed: rngSeed };
  }
  if (policy.allowChance && byType.has('chance')) {
    const roll = uniformFromSeed(rngSeed);
    const chancePick = byType.get('chance').sort((a, b) => scoreAction(b) - scoreAction(a))[0];
    if (roll.value < policy.chancePickRate && chancePick) {
      return { action: chancePick, seed: roll.seed };
    }
    return { action: null, seed: roll.seed };
  }
  if (policy.allowTakeCredit && byType.has('take_credit')) {
    const pick = byType.get('take_credit').sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    return { action: pick, seed: rngSeed };
  }
  return { action: null, seed: rngSeed };
}

function applyHomeAction(action, state, seed) {
  if (!action) return { patch: {}, seed };
  if (action.id === 'debt_payment') {
    if (state.debt <= 0 || state.cash <= 100) {
      return { patch: {}, seed };
    }
    const budget = Math.min(Math.round(state.cash * 0.3), state.cash);
    const payment = Math.min(budget, state.debt);
    const nextCash = roundMoney(state.cash - payment);
    const nextDebt = Math.max(0, roundMoney(state.debt - payment));
    return {
      patch: {
        cash: nextCash,
        debt: nextDebt,
      },
      seed,
    };
  }
  if (action.cost && state.cash < action.cost) {
    return { patch: {}, seed };
  }
  let patch = {};
  if (action.cost) {
    patch.cash = roundMoney(state.cash - action.cost);
  }
  let nextSeed = seed;
  if (action.effect === 'salary_up') {
    const delta = action.value || 0;
    patch.salaryBonus = roundMoney(state.salaryBonus + delta);
  } else if (action.effect === 'expense_down' || action.effect === 'cost_down') {
    const drop = action.value || 0;
    const nextRecurring = Math.max(
      0,
      roundMoney((patch.recurringExpenses ?? state.recurringExpenses) - drop),
    );
    patch.recurringExpenses = nextRecurring;
  } else if (action.effect === 'protection') {
    patch.protections = {
      ...state.protections,
      [action.protectionKey]: true,
    };
  } else if (action.effect === 'take_credit') {
    const available = Math.max(0, state.creditLimit - state.debt);
    const draw = Math.min(action.value || 1000, available);
    if (draw > 0) {
      patch.cash = roundMoney(state.cash + draw);
      patch.debt = roundMoney(state.debt + draw);
      patch.creditBucket = roundMoney((state.creditBucket || 0) + draw);
    }
  }
  if (action.type === 'chance') {
    const roll = uniformFromSeed(seed || ensureSeed());
    nextSeed = roll.seed;
    const success = roll.value < (action.chanceSuccess ?? 0.5);
    const afterCost = roundMoney(state.cash - (action.cost || 0));
    const baseState = { ...state, cash: afterCost };
    const outcomeEffect = success ? action.success : action.fail;
    const outcomePatch = applyOutcomeToState(baseState, outcomeEffect);
    if (typeof outcomePatch.cash !== 'number') {
      outcomePatch.cash = afterCost;
    }
    patch = { ...patch, ...outcomePatch };
  }
  return { patch, seed: nextSeed };
}

function buyInstrument(state, instrument, amount) {
  const price = state.priceState[instrument.id]?.price ?? instrument.initialPrice ?? 0;
  if (amount <= 0 || price <= 0) return state;
  const feePct = instrument.trading?.buyFeePct || 0;
  const minOrder = instrument.trading?.minOrder || 0;
  const maxSpendable = Math.min(amount, state.cash / (1 + feePct));
  if (maxSpendable < minOrder) return state;
  const spend = Math.max(minOrder, maxSpendable);
  const fee = spend * feePct;
  if (spend + fee > state.cash + 1e-3) return state;
  const units = spend / price;
  const nextInvestments = { ...state.investments };
  const existing = nextInvestments[instrument.id] || {
    units: 0,
    costBasis: 0,
    leveragedUnits: 0,
    leveragedCost: 0,
  };
  const newUnits = existing.units + units;
  const totalCost = existing.costBasis * existing.units + spend;
  let leveragedUnits = existing.leveragedUnits || 0;
  let leveragedCost = existing.leveragedCost || 0;
  let creditBucket = state.creditBucket || 0;
  if (instrument.type && ['stocks', 'crypto'].includes(instrument.type) && creditBucket > 0) {
    const creditUsed = Math.min(spend, creditBucket);
    if (creditUsed > 0) {
      const creditComprisedUnits = creditUsed / price;
      leveragedUnits += creditComprisedUnits;
      leveragedCost += creditUsed;
      creditBucket = Math.max(0, creditBucket - creditUsed);
    }
  }
  nextInvestments[instrument.id] = {
    units: newUnits,
    costBasis: totalCost / newUnits,
    leveragedUnits,
    leveragedCost,
  };
  return {
    ...state,
    investments: nextInvestments,
    cash: state.cash - (spend + fee),
    creditBucket,
  };
}

function sellInstrument(state, instrument, amount) {
  const holding = state.investments[instrument.id];
  const price = state.priceState[instrument.id]?.price ?? instrument.initialPrice ?? 0;
  if (!holding || amount <= 0 || price <= 0) return state;
  const maxValue = holding.units * price;
  if (maxValue <= 0) return state;
  const gross = Math.min(amount, maxValue);
  const unitsToSell = gross / price;
  const feePct = instrument.trading?.sellFeePct || 0;
  const fee = gross * feePct;
  const netProceeds = gross - fee;
  const remainingUnits = holding.units - unitsToSell;
  const nextInvestments = { ...state.investments };
  let leveragedUnits = holding.leveragedUnits || 0;
  let leveragedCost = holding.leveragedCost || 0;
  if (leveragedUnits > 0 && holding.units > 0) {
    const leverageRatio = leveragedUnits / holding.units;
    const leveragedSold = Math.min(leveragedUnits, unitsToSell * leverageRatio);
    const costPerLeveragedUnit = leveragedUnits ? leveragedCost / leveragedUnits : 0;
    leveragedUnits = Math.max(0, leveragedUnits - leveragedSold);
    leveragedCost = Math.max(0, leveragedCost - leveragedSold * costPerLeveragedUnit);
  }
  if (remainingUnits <= 0.0001) {
    delete nextInvestments[instrument.id];
  } else {
    const totalCost = holding.costBasis * holding.units;
    const remainingCost = Math.max(0, totalCost - holding.costBasis * unitsToSell);
    nextInvestments[instrument.id] = {
      ...holding,
      units: remainingUnits,
      costBasis: remainingCost / remainingUnits || 0,
      leveragedUnits,
      leveragedCost,
    };
  }
  return {
    ...state,
    investments: nextInvestments,
    cash: state.cash + netProceeds,
  };
}

function chooseDeal(policy, state, dealWindows, deals) {
  const buffer = policy.cashBufferMultiplier * (state.recurringExpenses || 0);
  const eligible = deals.filter((deal) => {
    const window = dealWindows[deal.id];
    if (!window || window.expiresIn <= 0 || (window.slotsLeft ?? 0) <= 0) return false;
    if (deal.entryCost <= 0 || state.cash - deal.entryCost < buffer) return false;
    if (deal.riskMeter > policy.maxDealRisk) return false;
    const roi = (deal.monthlyPayout * deal.durationMonths) / deal.entryCost;
    return roi >= policy.minDealRoi;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const roiA = (a.monthlyPayout * a.durationMonths) / a.entryCost;
    const roiB = (b.monthlyPayout * b.durationMonths) / b.entryCost;
    return roiB - roiA;
  });
  return eligible[0];
}

function applyDeal(state, deal) {
  if (!deal) return state;
  if (state.cash < deal.entryCost) return state;
  const participation = {
    dealId: deal.id,
    title: deal.title,
    invested: deal.entryCost,
    monthlyPayout: deal.monthlyPayout || 0,
    durationMonths: deal.durationMonths || 1,
    elapsedMonths: 0,
    profitEarned: 0,
    completed: false,
    risk: deal.risk,
    startedTurn: state.month,
  };
  return {
    ...state,
    cash: roundMoney(state.cash - deal.entryCost),
    dealParticipations: [...(state.dealParticipations || []), participation],
    dealWindows: {
      ...state.dealWindows,
      [deal.id]: {
        ...(state.dealWindows?.[deal.id] || {}),
        slotsLeft: Math.max(0, (state.dealWindows?.[deal.id]?.slotsLeft ?? 1) - 1),
      },
    },
  };
}

function ensureLiquidity(state, instrumentMap) {
  if (state.cash >= 0) return state;
  let next = state;
  const liquidOrder = ['bonds', 'stocks', 'crypto'];
  liquidOrder.forEach((type) => {
    if (next.cash >= 0) return;
    Object.values(instrumentMap)
      .filter((instrument) => instrument.type === type)
      .forEach((instrument) => {
        if (next.cash >= 0) return;
        const holding = next.investments[instrument.id];
        if (!holding) return;
        const price = next.priceState[instrument.id]?.price ?? instrument.initialPrice ?? 0;
        const value = holding.units * price;
        if (value <= 0) return;
        const needed = Math.min(value, Math.abs(next.cash));
        next = sellInstrument(next, instrument, needed);
      });
  });
  return next;
}

function applyInvestPolicy(state, policy, instrumentMap) {
  const buffer = policy.cashBufferMultiplier * (state.recurringExpenses || 0);
  const investable = Math.max(0, state.cash - buffer);
  if (investable <= 0) return state;
  let next = state;
  const allocations = policy.allocations;
  Object.entries(allocations).forEach(([type, share]) => {
    const instruments = Object.values(instrumentMap).filter((item) => item.type === type);
    if (!instruments.length) return;
    const instrument = instruments[0];
    next = buyInstrument(next, instrument, investable * share);
  });
  return next;
}

function applyCreditPolicy(state, policy) {
  if (!policy.allowCreditDraw) return state;
  const available = Math.max(0, state.creditLimit - state.debt);
  const maxDraw = Math.max(0, available * policy.creditDrawShare);
  if (maxDraw <= 0) return state;
  return {
    ...state,
    cash: roundMoney(state.cash + maxDraw),
    debt: roundMoney(state.debt + maxDraw),
    creditBucket: roundMoney((state.creditBucket || 0) + maxDraw),
  };
}

function stepMonth(state, configs, policy) {
  const instrumentList = configs.instruments?.instruments || [];
  const instrumentMap = instrumentList.reduce((acc, instrument) => {
    acc[instrument.id] = instrument;
    return acc;
  }, {});
  const simResult = simulateMarkets({
    month: state.month,
    priceState: state.priceState,
    instruments: instrumentList,
    marketsConfig: configs.markets,
    rngSeed: state.rngSeed,
    shockState: state.shockState,
  });
  const priceState = simResult.priceState;
  const shockState = simResult.shockState;
  let rngSeed = simResult.rngSeed;
  const baseInvestments = Object.entries(state.investments || {}).reduce((acc, [id, holding]) => {
    acc[id] = { ...holding };
    return acc;
  }, {});
  let autoLiquidation = 0;
  Object.entries(baseInvestments).forEach(([instrumentId, holding]) => {
    const info = instrumentMap[instrumentId];
    if (!info || !['stocks', 'crypto'].includes(info.type)) return;
    const leveragedUnits = holding.leveragedUnits || 0;
    const leveragedCost = holding.leveragedCost || 0;
    if (leveragedUnits <= 0 || leveragedCost <= 0) return;
    const price = priceState[instrumentId]?.price || info.initialPrice || 0;
    const entryPrice = leveragedCost / leveragedUnits;
    if (price <= entryPrice * 0.5) {
      const cashGain = leveragedUnits * price;
      autoLiquidation += cashGain;
      const totalUnits = holding.units || 0;
      const remainingUnits = Math.max(0, totalUnits - leveragedUnits);
      if (remainingUnits <= 0) {
        delete baseInvestments[instrumentId];
      } else {
        const totalCost = holding.costBasis * totalUnits;
        const remainingCost = Math.max(0, totalCost - holding.costBasis * leveragedUnits);
        baseInvestments[instrumentId] = {
          ...holding,
          units: remainingUnits,
          costBasis: remainingCost / remainingUnits || 0,
          leveragedUnits: 0,
          leveragedCost: 0,
        };
      }
    }
  });
  const holdingsValue = calculateHoldingsValue(baseInvestments, priceState);
  const passiveIncomeRaw = calculatePassiveIncome(baseInvestments, priceState, instrumentMap);
  const dealIncomeRaw = (state.dealParticipations || []).reduce((sum, deal) => {
    if (deal.completed) return sum;
    return sum + (deal.monthlyPayout || 0);
  }, 0);
  const passiveIncome = roundMoney(passiveIncomeRaw + dealIncomeRaw);
  let joblessMonths = state.joblessMonths || 0;
  let salaryCutMonths = state.salaryCutMonths || 0;
  let salaryCutAmount = state.salaryCutAmount || 0;
  let salaryProgression = state.salaryProgression || null;
  let salaryBase = state.profession.salaryMonthly || 0;
  if (salaryProgression) {
    const step = Math.max(1, Math.floor(salaryProgression.stepMonths || 1));
    let monthsUntilStep =
      typeof salaryProgression.monthsUntilStep === 'number'
        ? salaryProgression.monthsUntilStep - 1
        : step - 1;
    let currentBase =
      typeof salaryProgression.currentBase === 'number'
        ? salaryProgression.currentBase
        : salaryBase;
    const cap =
      typeof salaryProgression.cap === 'number'
        ? salaryProgression.cap
        : Number.POSITIVE_INFINITY;
    const percent = salaryProgression.percent || 0;
    if (monthsUntilStep <= 0) {
      if (currentBase < cap) {
        currentBase = Math.min(cap, Math.round(currentBase * (1 + percent)));
      }
      monthsUntilStep = step;
    }
    salaryBase = currentBase;
    salaryProgression = {
      ...salaryProgression,
      monthsUntilStep,
      currentBase,
    };
  }
  let salary = 0;
  if (joblessMonths > 0) {
    joblessMonths -= 1;
  } else {
    const cut = salaryCutMonths > 0 ? salaryCutAmount : 0;
    salary = Math.max(0, roundMoney(salaryBase + state.salaryBonus - cut));
    if (salaryCutMonths > 0) {
      salaryCutMonths -= 1;
      if (salaryCutMonths === 0) {
        salaryCutAmount = 0;
      }
    }
  }
  const recurringExpenses = roundMoney(state.recurringExpenses || 0);
  const progressiveRules = configs.rules?.progressiveExpenses;
  const maintenanceRules = configs.rules?.assetMaintenance;
  const incomeBase = salary;
  const progressiveExpense = progressiveRules
    ? Math.min(
        progressiveRules.capMonthly ?? Number.POSITIVE_INFINITY,
        Math.max(
          0,
          ((state.cash || 0) > (progressiveRules.cashThreshold || 0)
            ? (state.cash || 0) * (progressiveRules.cashRate || 0)
            : 0) + incomeBase * (progressiveRules.incomeRate || 0),
        ),
      )
    : 0;
  const maintenanceExpense = maintenanceRules
    ? Math.max(
        maintenanceRules.minMonthly || 0,
        holdingsValue * (maintenanceRules.rateMonthly || 0),
      )
    : 0;
  const effectiveRecurring = roundMoney(recurringExpenses + progressiveExpense + maintenanceExpense);
  const monthlyRate = configs.rules?.loans?.apr || 0;
  const baseDebt = Math.max(0, roundMoney(state.debt));
  const debtInterest = roundMoney(baseDebt * monthlyRate);
  const debt = Math.max(0, roundMoney(baseDebt + debtInterest));
  const cash = roundMoney(state.cash + salary + passiveIncome - effectiveRecurring + autoLiquidation);
  const updatedDeals = (state.dealParticipations || []).map((deal) => {
    if (deal.completed) return deal;
    const nextElapsed = Math.min(deal.durationMonths || 1, (deal.elapsedMonths || 0) + 1);
    const completed = nextElapsed >= (deal.durationMonths || 1);
    const profitEarned = roundMoney((deal.profitEarned || 0) + (deal.monthlyPayout || 0));
    return {
      ...deal,
      elapsedMonths: nextElapsed,
      profitEarned,
      completed,
    };
  });
  const eventPool = configs.randomEvents?.events || [];
  const eventRoll = rollRandomEvent({ ...state, cash, debt }, rngSeed, eventPool);
  const homeActionsConfig = configs.homeActions || {};
  const actionsRoll = rollMonthlyActions(eventRoll.seed, homeActionsConfig.actions || [], homeActionsConfig);
  const dealWindowRoll = advanceDealWindows(state.dealWindows, actionsRoll.seed);
  rngSeed = dealWindowRoll.seed;
  const patchedCash = eventRoll.patch.cash ?? cash;
  const patchedDebt = eventRoll.patch.debt ?? debt;
  const patchedSalaryBonus = eventRoll.patch.salaryBonus ?? state.salaryBonus;
  const patchedRecurring = eventRoll.patch.recurringExpenses ?? state.recurringExpenses;
  const patchedEffectiveRecurring = roundMoney(
    (patchedRecurring || 0) + progressiveExpense + maintenanceExpense,
  );
  const patchedProtections = eventRoll.protections || state.protections;
  let nextState = {
    ...state,
    month: state.month + 1,
    cash: patchedCash,
    debt: patchedDebt,
    salaryBonus: patchedSalaryBonus,
    recurringExpenses: patchedRecurring,
    priceState,
    shockState,
    investments: baseInvestments,
    dealParticipations: updatedDeals,
    joblessMonths,
    salaryCutMonths,
    salaryCutAmount,
    salaryProgression,
    protections: patchedProtections,
    rngSeed,
    dealWindows: dealWindowRoll.state,
  };
  const actionPick = pickAction(policy, nextState, actionsRoll.actions, rngSeed);
  rngSeed = actionPick.seed;
  const actionResult = applyHomeAction(actionPick.action, nextState, rngSeed);
  nextState = {
    ...nextState,
    ...actionResult.patch,
    rngSeed: actionResult.seed,
  };
  nextState = applyCreditPolicy(nextState, policy);
  nextState = applyInvestPolicy(nextState, policy, instrumentMap);
  const dealPick = chooseDeal(policy, nextState, nextState.dealWindows, DEAL_TEMPLATES);
  nextState = applyDeal(nextState, dealPick);
  nextState = ensureLiquidity(nextState, instrumentMap);
  let netWorth =
    nextState.cash +
    calculateHoldingsValue(nextState.investments, nextState.priceState) -
    nextState.debt;
  const creditLimit = computeCreditLimit({
    profession: nextState.profession,
    netWorth,
    salary: (nextState.profession.salaryMonthly || 0) + nextState.salaryBonus,
    rules: configs.rules,
  });
  let availableCredit = creditLimit - nextState.debt;
  const emergencyRules = configs.rules?.emergencyCredit;
  let emergencyDraw = 0;
  if (emergencyRules?.enabled && nextState.cash < 0 && availableCredit > 0) {
    const minDraw = emergencyRules.minDraw || 0;
    const percent = emergencyRules.drawPercent || 0;
    const target = Math.max(minDraw, patchedEffectiveRecurring * percent);
    emergencyDraw = Math.min(availableCredit, Math.max(0, Math.round(target)));
  }
  if (emergencyDraw > 0) {
    nextState = {
      ...nextState,
      cash: roundMoney(nextState.cash + emergencyDraw),
      debt: roundMoney(nextState.debt + emergencyDraw),
    };
    availableCredit = creditLimit - nextState.debt;
    netWorth =
      nextState.cash +
      calculateHoldingsValue(nextState.investments, nextState.priceState) -
      nextState.debt;
  }
  const metrics = {
    cash: nextState.cash,
    netWorth,
    passiveIncome,
    recurringExpenses: patchedEffectiveRecurring,
    monthlyCashFlow: salary + passiveIncome - patchedEffectiveRecurring,
    debtDelta: debtInterest,
    debt: nextState.debt,
    availableCredit,
  };
  const goalState = evaluateGoals({ rules: configs.rules, trackers: nextState.trackers }, metrics);
  nextState = {
    ...nextState,
    creditLimit,
    availableCredit,
    trackers: goalState.trackers,
    winCondition: nextState.winCondition || goalState.win,
    loseCondition: nextState.loseCondition || goalState.lose,
  };
  return {
    state: nextState,
    metrics,
    eventApplied: Boolean(eventRoll.event && !eventRoll.event.prevented),
    eventType: eventRoll.event?.type || null,
  };
}

function toStats(values) {
  if (!values.length) {
    return { count: 0, mean: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  return {
    count: values.length,
    mean: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p10: pick(0.1),
    p50: pick(0.5),
    p90: pick(0.9),
  };
}

function runPolicy({
  policy,
  configs,
  professions,
  runs = DEFAULT_RUNS,
  months = DEFAULT_MONTHS,
  seed = DEFAULT_SEED,
}) {
  const results = [];
  const timeToPositive = [];
  const timeToStablePlus = [];
  const timeToBankrupt = [];
  const timeToWin = [];
  const finalNetWorth = [];
  const finalCash = [];
  const bankruptcyWithin50 = [];
  const eventsTotal = [];
  const eventsPositive = [];
  const eventsNegative = [];
  for (let i = 0; i < runs; i += 1) {
    const profession = professions[i % professions.length];
    const runSeed = ensureSeed(seedFromString(`${seed}-${policy.name}-${i}-${profession.id}`));
    let state = createInitialState(profession, configs, runSeed);
    let positiveMonth = null;
    let stableStreak = 0;
    let stableMonth = null;
    let bankruptMonth = null;
    let winMonth = null;
    let eventsCount = 0;
    let eventsPos = 0;
    let eventsNeg = 0;
    for (let month = 0; month < months; month += 1) {
      const step = stepMonth(state, configs, policy);
      state = step.state;
      if (step.eventApplied) {
        eventsCount += 1;
        if (step.eventType === 'positive') eventsPos += 1;
        if (step.eventType === 'negative') eventsNeg += 1;
      }
      if (positiveMonth === null && step.metrics.monthlyCashFlow > 0) {
        positiveMonth = month + 1;
      }
      if (step.metrics.monthlyCashFlow > 0) {
        stableStreak += 1;
        if (stableStreak >= 6 && stableMonth === null) {
          stableMonth = month + 1;
        }
      } else {
        stableStreak = 0;
      }
      if (!bankruptMonth && state.loseCondition) {
        bankruptMonth = month + 1;
      }
      if (!winMonth && state.winCondition) {
        winMonth = month + 1;
      }
      if (bankruptMonth) break;
    }
    const netWorth =
      state.cash + calculateHoldingsValue(state.investments, state.priceState) - state.debt;
    results.push({
      profession: profession.id,
      positiveMonth,
      stableMonth,
      bankruptMonth,
      winMonth,
      netWorth,
      cash: state.cash,
    });
    if (positiveMonth != null) timeToPositive.push(positiveMonth);
    if (stableMonth != null) timeToStablePlus.push(stableMonth);
    if (bankruptMonth != null) timeToBankrupt.push(bankruptMonth);
    if (winMonth != null) timeToWin.push(winMonth);
    finalNetWorth.push(netWorth);
    finalCash.push(state.cash);
    bankruptcyWithin50.push(bankruptMonth != null && bankruptMonth <= 50 ? 1 : 0);
    eventsTotal.push(eventsCount);
    eventsPositive.push(eventsPos);
    eventsNegative.push(eventsNeg);
  }
  return {
    policy: policy.name,
    runs,
    months,
    timeToPositive: toStats(timeToPositive),
    timeToStablePlus: toStats(timeToStablePlus),
    timeToBankrupt: toStats(timeToBankrupt),
    timeToWin: toStats(timeToWin),
    finalNetWorth: toStats(finalNetWorth),
    finalCash: toStats(finalCash),
    bankruptcyWithin50: {
      rate: bankruptcyWithin50.reduce((a, b) => a + b, 0) / runs,
    },
    events: {
      total: toStats(eventsTotal),
      positive: toStats(eventsPositive),
      negative: toStats(eventsNegative),
    },
  };
}

const policies = [
  {
    name: 'conservative',
    cashBufferMultiplier: 3,
    salaryRoiMonths: 10,
    expenseRoiMonths: 12,
    allowChance: false,
    chancePickRate: 0,
    allowTakeCredit: false,
    allowCreditDraw: false,
    creditDrawShare: 0,
    allowDebtPayment: true,
    allowProtection: true,
    allocations: { bonds: 1.0 },
    maxDealRisk: 2,
    minDealRoi: 0.8,
  },
  {
    name: 'balanced',
    cashBufferMultiplier: 2,
    salaryRoiMonths: 8,
    expenseRoiMonths: 10,
    allowChance: true,
    chancePickRate: 0.25,
    allowTakeCredit: false,
    allowCreditDraw: false,
    creditDrawShare: 0,
    allowDebtPayment: true,
    allowProtection: true,
    allocations: { bonds: 0.4, stocks: 0.4, crypto: 0.2 },
    maxDealRisk: 3,
    minDealRoi: 0.7,
  },
  {
    name: 'aggressive',
    cashBufferMultiplier: 1,
    salaryRoiMonths: 12,
    expenseRoiMonths: 12,
    allowChance: true,
    chancePickRate: 0.75,
    allowTakeCredit: true,
    allowCreditDraw: true,
    creditDrawShare: 0.5,
    allowDebtPayment: false,
    allowProtection: false,
    allocations: { stocks: 0.7, crypto: 0.3 },
    maxDealRisk: 5,
    minDealRoi: 0.6,
  },
];

function buildMarkdownReport(summary, meta) {
  const lines = [];
  lines.push('# Balance Simulation Report');
  lines.push('');
  lines.push(`Seed: ${meta.seed}`);
  lines.push(`Runs per policy: ${meta.runs}`);
  lines.push(`Months: ${meta.months}`);
  lines.push('');
  summary.forEach((policy) => {
    lines.push(`## ${policy.policy}`);
    lines.push('');
    lines.push(`- Time to positive cashflow (p50): ${policy.timeToPositive.p50 || 'n/a'}`);
    lines.push(`- Time to stable plus (p50): ${policy.timeToStablePlus.p50 || 'n/a'}`);
    lines.push(`- Time to bankruptcy (p50): ${policy.timeToBankrupt.p50 || 'n/a'}`);
    lines.push(`- Bankruptcy within 50 months: ${(policy.bankruptcyWithin50.rate * 100).toFixed(2)}%`);
    lines.push(`- Final net worth p10/p50/p90: ${policy.finalNetWorth.p10.toFixed(0)} / ${policy.finalNetWorth.p50.toFixed(0)} / ${policy.finalNetWorth.p90.toFixed(0)}`);
    lines.push(`- Events per run avg: ${policy.events.total.mean.toFixed(2)} (pos ${policy.events.positive.mean.toFixed(2)}, neg ${policy.events.negative.mean.toFixed(2)})`);
    lines.push('');
  });
  return lines.join('\n');
}

function run() {
  const configs = {
    rules: loadJson('public/config/game_rules.json'),
    professions: loadJson('public/config/professions.json').professions,
    instruments: loadJson('public/config/instruments.json'),
    markets: loadJson('public/config/markets.json'),
    randomEvents: loadJson('public/config/random_events.json'),
    homeActions: loadJson('public/config/home_actions.json'),
  };
  const runs = Number(process.env.SIM_RUNS || DEFAULT_RUNS);
  const months = Number(process.env.SIM_MONTHS || DEFAULT_MONTHS);
  const seed = Number(process.env.SIM_SEED || DEFAULT_SEED);
  const summary = policies.map((policy) =>
    runPolicy({
      policy,
      configs,
      professions: configs.professions,
      runs,
      months,
      seed,
    }),
  );
  const report = {
    meta: {
      seed,
      runs,
      months,
      timestamp: new Date().toISOString(),
    },
    summary,
  };
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const jsonPath = path.join(REPORT_DIR, 'balance-sim-report.json');
  const mdPath = path.join(REPORT_DIR, 'balance-sim-report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdownReport(summary, report.meta));
  console.log(`Report written: ${jsonPath}`);
  console.log(`Report written: ${mdPath}`);
}

run();
