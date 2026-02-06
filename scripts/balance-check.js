import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEAL_TEMPLATES } from '../src/domain/deals.js';
import {
  calculateHoldingsValue,
  calculatePassiveIncome,
  computeCreditLimit,
  computeLivingCost,
  evaluateGoals,
  getMonthlyExpenses,
} from '../src/domain/finance.js';
import { BALANCE_DEFAULTS } from '../src/domain/balanceConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'public', 'config');

const RUNS = Number(process.env.RUNS || 10000);
const TURNS = Number(process.env.TURNS || 50);
const SHORT_TURNS = Number(process.env.SHORT_TURNS || 15);
const BASE_SEED = Number(process.env.SEED || 1337);

const readJson = async (name) => {
  const fullPath = path.join(configDir, name);
  const raw = await fs.readFile(fullPath, 'utf-8');
  return JSON.parse(raw);
};

const createRng = (seed) => {
  let state = Math.max(1, seed >>> 0);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const boxMuller = (rng) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const computeProgressiveExpense = (state, rules, incomeBase) => {
  const progressiveRules = rules?.progressiveExpenses;
  if (!progressiveRules) return 0;
  const cash = state.cash || 0;
  const cashPart = cash > (progressiveRules.cashThreshold || 0)
    ? cash * (progressiveRules.cashRate || 0)
    : 0;
  const incomePart = incomeBase * (progressiveRules.incomeRate || 0);
  const value = Math.max(0, cashPart + incomePart);
  return Math.min(progressiveRules.capMonthly ?? Number.POSITIVE_INFINITY, value);
};

const getInstrumentMap = (configs) => {
  const list = configs?.instruments?.instruments || [];
  return list.reduce((acc, instrument) => {
    acc[instrument.id] = instrument;
    return acc;
  }, {});
};

const estimateMonthlyIncome = (state, configs, instrumentMap) => {
  const salaryBase =
    (state.salaryProgression?.currentBase ?? state.profession?.salaryMonthly) || 0;
  const salaryCut = state.salaryCutMonths > 0 ? state.salaryCutAmount || 0 : 0;
  const salary = state.joblessMonths > 0
    ? 0
    : Math.max(0, Math.round(salaryBase + (state.salaryBonus || 0) - salaryCut));
  const passiveFromInvestments = calculatePassiveIncome(
    state.investments,
    state.priceState,
    instrumentMap,
  );
  const passiveFromDeals = (state.dealParticipations || []).reduce((sum, deal) => {
    if (deal.completed) return sum;
    return sum + (deal.monthlyPayout || 0);
  }, 0);
  const passiveIncome = Math.round(passiveFromInvestments + passiveFromDeals);
  return { salary, passiveIncome };
};

const simulateMarkets = (state, configs, rng) => {
  const instruments = configs?.instruments?.instruments || [];
  const maxAbs = configs?.markets?.global?.maxMonthlyReturnAbs;
  const nextPrices = {};
  const returns = {};
  instruments.forEach((instrument) => {
    const prevPrice = state.priceState[instrument.id]?.price || instrument.initialPrice || 1;
    const mu = instrument.model?.muMonthly || 0;
    const sigma = instrument.model?.sigmaMonthly || 0;
    let logReturn = mu + sigma * boxMuller(rng);
    if (typeof maxAbs === 'number') {
      logReturn = Math.min(maxAbs, Math.max(-maxAbs, logReturn));
    }
    const drawdownClamp = instrument.model?.maxDrawdownClamp;
    if (typeof drawdownClamp === 'number') {
      const floor = Math.log(Math.max(1 - drawdownClamp, 0.05));
      logReturn = Math.max(logReturn, floor);
    }
    const nextPrice = Math.max(prevPrice * Math.exp(logReturn), 0.01);
    nextPrices[instrument.id] = { price: nextPrice };
    returns[instrument.id] = Math.exp(logReturn) - 1;
  });
  return { priceState: nextPrices, returns };
};

const pickProfessionId = (configs, rng) => {
  const list = configs?.professions?.professions || [];
  if (!list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index].id;
};

const getEffectiveRecurring = (state, rules, incomeBase) => {
  const recurring = Math.round(state.recurringExpenses || 0);
  const progressive = computeProgressiveExpense(state, rules, incomeBase);
  return Math.round(recurring + progressive);
};

const selectHomeAction = (policy, availableActions, state, configs, rng) => {
  const actions = availableActions || [];
  if (!actions.length) return null;
  const cash = state.cash || 0;
  const { salary } = estimateMonthlyIncome(state, configs, getInstrumentMap(configs));
  const effectiveRecurring = getEffectiveRecurring(state, configs.rules, salary);
  const buffer = policy === 'conservative'
    ? effectiveRecurring * 6
    : policy === 'aggressive'
      ? effectiveRecurring * 0.3
      : effectiveRecurring * 2.2;

  const scored = actions.map((action) => {
    if (action.type === 'chance') {
      const success = action.chanceSuccess ?? 0.5;
      const expected = (success * (action.success?.cashDelta || 0))
        + ((1 - success) * (action.fail?.cashDelta || 0))
        - (action.cost || 0);
      return { action, score: expected / Math.max(1, action.cost || 1), expected };
    }
    if (action.effect === 'salary_up') {
      return { action, score: (action.value || 0) / Math.max(1, action.cost || 1) };
    }
    if (action.effect === 'expense_down' || action.effect === 'cost_down') {
      return { action, score: (action.value || 0) / Math.max(1, action.cost || 1) };
    }
    if (action.effect === 'debt_payment') {
      return { action, score: 0.4 };
    }
    if (action.effect === 'protection') {
      const active = Boolean(state.protections?.[action.protectionKey]);
      const baseScore = policy === 'conservative' ? 1.2 : 0.4;
      return { action, score: active ? 0.05 : baseScore };
    }
    if (action.effect === 'take_credit') {
      return { action, score: policy === 'aggressive' ? 1.1 : -0.2 };
    }
    return { action, score: 0 };
  });

  const filtered = scored.filter(({ action }) => {
    if (action.type === 'chance') {
      if (policy === 'conservative') return false;
      if (policy === 'balanced' && cash < buffer * 1.4) return false;
      return true;
    }
    if (action.effect === 'take_credit') {
      return policy === 'aggressive' && cash < buffer * 2;
    }
    if (action.effect === 'protection') {
      return policy !== 'aggressive' && cash > buffer * 1.2;
    }
    return true;
  });

  if (policy === 'balanced' && rng() < 0.3) return null;
  filtered.sort((a, b) => b.score - a.score);
  const candidate = filtered[0]?.action || null;
  if (!candidate) return null;
  if (candidate.cost && cash < candidate.cost) return null;
  if (candidate.type === 'chance') {
    if (policy === 'balanced' && rng() < 0.6) return null;
    if (policy === 'aggressive' && rng() < 0.02) return null;
  }
  return candidate.id;
};

const DEAL_OFFER_CHANCE = 0.35;

const pickDeal = (policy, state, configs, rng) => {
  if (rng() > DEAL_OFFER_CHANCE) return null;
  const openDeals = DEAL_TEMPLATES.filter((deal) => {
    if (!deal.entryCost || !deal.monthlyPayout) return false;
    return true;
  });
  if (!openDeals.length) return null;
  const incomeBase = estimateMonthlyIncome(state, configs, getInstrumentMap(configs)).salary;
  const effectiveRecurring = getEffectiveRecurring(state, configs.rules, incomeBase);
  const buffer = policy === 'conservative'
    ? effectiveRecurring * 6
    : policy === 'aggressive'
      ? effectiveRecurring * 0.4
      : effectiveRecurring * 2.2;
  const budget = Math.max(0, (state.cash || 0) - buffer);
  const maxPayback = policy === 'conservative' ? 8 : policy === 'balanced' ? 24 : 48;
  const sorted = openDeals
    .map((deal) => ({
      deal,
      payback: (deal.entryCost || 0) / Math.max(1, deal.monthlyPayout || 1),
    }))
    .filter(({ deal, payback }) => payback <= maxPayback && deal.entryCost <= budget)
    .sort((a, b) => a.payback - b.payback);
  return sorted[0]?.deal || null;
};

const applyInvestments = (policy, state, configs) => {
  const instrumentMap = getInstrumentMap(configs);
  const instruments = configs?.instruments?.instruments || [];
  const incomeBase = estimateMonthlyIncome(state, configs, instrumentMap).salary;
  const effectiveRecurring = getEffectiveRecurring(state, configs.rules, incomeBase);
  const buffer = policy === 'conservative'
    ? effectiveRecurring * 6
    : policy === 'aggressive'
      ? effectiveRecurring * 0.4
      : effectiveRecurring * 2.2;
  const cash = state.cash || 0;
  if (cash <= buffer) {
    Object.entries(state.investments || {}).forEach(([instrumentId, holding]) => {
      if (state.cash >= buffer) return;
      const price = state.priceState[instrumentId]?.price || 0;
      if (!price || holding.units <= 0) return;
      const sellAmount = Math.min(price * holding.units, buffer - state.cash);
      if (sellAmount <= 0) return;
      const unitsToSell = sellAmount / price;
      holding.units = Math.max(0, holding.units - unitsToSell);
      state.cash = Math.round(state.cash + sellAmount);
    });
    return;
  }
  const investableBase = Math.max(0, cash - buffer);
  const investable = policy === 'conservative'
    ? investableBase * 0.25
    : policy === 'aggressive'
      ? investableBase * 1.0
      : investableBase * 0.8;
  if (investable <= 0) return;
  const bond = instruments.find((item) => item.type === 'bonds');
  const stocks = instruments.filter((item) => item.type === 'stocks');
  const crypto = instruments.filter((item) => item.type === 'crypto');
  const pickTop = (list) => list.slice().sort((a, b) => (b.model?.muMonthly || 0) - (a.model?.muMonthly || 0))[0];
  const plan = [];
  if (policy === 'conservative') {
    if (bond) plan.push({ instrument: bond, share: 0.85 });
    if (stocks.length) plan.push({ instrument: pickTop(stocks), share: 0.15 });
  } else if (policy === 'balanced') {
    if (bond) plan.push({ instrument: bond, share: 0.3 });
    if (stocks.length) plan.push({ instrument: pickTop(stocks), share: 0.5 });
    if (crypto.length) plan.push({ instrument: pickTop(crypto), share: 0.2 });
  } else {
    if (stocks.length) plan.push({ instrument: pickTop(stocks), share: 0.25 });
    if (crypto.length) plan.push({ instrument: pickTop(crypto), share: 0.7 });
    if (bond) plan.push({ instrument: bond, share: 0.05 });
  }
  plan.forEach(({ instrument, share }) => {
    const amount = investable * share;
    if (amount <= 0) return;
    const price = state.priceState[instrument.id]?.price || instrument.initialPrice || 1;
    const units = amount / price;
    state.cash = Math.round(state.cash - amount);
    const existing = state.investments[instrument.id] || { units: 0, costBasis: 0 };
    const totalCost = existing.costBasis * existing.units + amount;
    const newUnits = existing.units + units;
    state.investments[instrument.id] = {
      units: newUnits,
      costBasis: totalCost / Math.max(1e-6, newUnits),
    };
  });
};

const applyHomeAction = (action, state, configs, rng) => {
  if (!action) return;
  if (action.id === 'debt_payment') {
    if (state.debt <= 0 || state.cash <= 100) return;
    const budget = Math.min(Math.round(state.cash * 0.3), state.cash);
    const payment = Math.min(budget, state.debt);
    if (payment <= 0) return;
    state.cash = Math.round(state.cash - payment);
    state.debt = Math.max(0, Math.round(state.debt - payment));
    return;
  }
  if (action.cost && state.cash < action.cost) return;
  if (action.cost) {
    state.cash = Math.round(state.cash - action.cost);
  }
  if (action.type === 'chance') {
    const success = rng() < (action.chanceSuccess ?? 0.5);
    const outcome = success ? action.success : action.fail;
    state.cash = Math.round(state.cash + (outcome?.cashDelta || 0));
    return;
  }
  switch (action.effect) {
    case 'salary_up': {
      const delta = action.value || 0;
      state.salaryBonus = Math.round((state.salaryBonus || 0) + delta);
      break;
    }
    case 'expense_down':
    case 'cost_down': {
      const drop = action.value || 0;
      state.recurringExpenses = Math.max(0, Math.round((state.recurringExpenses || 0) - drop));
      break;
    }
    case 'protection': {
      state.protections = { ...state.protections, [action.protectionKey]: true };
      break;
    }
    case 'take_credit': {
      const creditLimit = computeCreditLimit({
        profession: state.profession,
        netWorth: computeNetWorth(state, configs),
        salary: state.profession?.salaryMonthly || 0,
        rules: configs.rules,
      });
      const available = Math.max(0, creditLimit - state.debt);
      const draw = Math.min(action.value || 1000, available);
      if (draw <= 0) return;
      state.cash = Math.round(state.cash + draw);
      state.debt = Math.round(state.debt + draw);
      break;
    }
    default:
      break;
  }
};

const computeNetWorth = (state, configs) => {
  const instrumentMap = getInstrumentMap(configs);
  const holdingsValue = calculateHoldingsValue(state.investments, state.priceState, instrumentMap);
  return Math.round((state.cash || 0) + holdingsValue - (state.debt || 0));
};

const buildInitialState = (profession, configs, rng) => {
  const instruments = configs?.instruments?.instruments || [];
  const priceState = instruments.reduce((acc, instrument) => {
    acc[instrument.id] = { price: instrument.initialPrice || 1 };
    return acc;
  }, {});
  const holdings = {};
  Object.entries(profession.startingPortfolio || {}).forEach(([instrumentId, units]) => {
    holdings[instrumentId] = { units, costBasis: (priceState[instrumentId]?.price || 0) * units };
  });
  const livingCost = computeLivingCost(profession.id, configs.rules);
  const cash = profession.startingMoney || 0;
  const debt = profession.startingDebt || 0;
  const salary = profession.salaryMonthly || 0;
  const recurringExpenses = Math.max(0, Math.round(getMonthlyExpenses(profession) + livingCost));
  const salaryProgression = profession.salaryProgression
    ? {
        ...profession.salaryProgression,
        monthsUntilStep: profession.salaryProgression.stepMonths || 1,
        currentBase: profession.salaryMonthly || 0,
      }
    : null;
  return {
    month: 0,
    profession,
    cash,
    debt,
    salaryBonus: 0,
    recurringExpenses,
    protections: { healthPlan: false, legalShield: false, techShield: false },
    investments: holdings,
    priceState,
    dealParticipations: [],
    joblessMonths: 0,
    salaryCutMonths: 0,
    salaryCutAmount: 0,
    salaryProgression,
    trackers: { win: {}, lose: {} },
    winCondition: null,
    loseCondition: null,
    rng,
  };
};

const buildWeightedPool = (actions, options = {}) => {
  const typeWeights = options.typeWeights || {};
  const pool = [];
  actions.forEach((action) => {
    const type = action.effect || action.type || 'other';
    const weight = Math.max(0, Math.round(typeWeights[type] ?? 1));
    if (weight <= 0) return;
    for (let i = 0; i < weight; i += 1) {
      pool.push(action.id);
    }
  });
  return pool.length ? pool : actions.map((item) => item.id);
};

const rollMonthlyActions = (rng, actions = [], options = {}) => {
  const pool = buildWeightedPool(actions, options);
  const limit = Math.min(options.count ?? BALANCE_DEFAULTS.homeAction.defaultCount, pool.length);
  if (!limit) return [];
  const showChance = Math.min(
    1,
    Math.max(0, typeof options.showChance === 'number' ? options.showChance : BALANCE_DEFAULTS.homeAction.defaultShowChance),
  );
  if (rng() > showChance) return [];
  const picked = new Set();
  while (picked.size < limit) {
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    picked.add(pool[index]);
  }
  return actions.filter((item) => picked.has(item.id));
};

const applyEventEffect = (state, effect = {}) => {
  if (typeof effect.cashDelta === 'number') {
    state.cash = Math.round(state.cash + effect.cashDelta);
  }
  if (typeof effect.salaryBonusDelta === 'number') {
    state.salaryBonus = Math.round((state.salaryBonus || 0) + effect.salaryBonusDelta);
  }
  if (typeof effect.recurringDelta === 'number') {
    state.recurringExpenses = Math.max(0, Math.round((state.recurringExpenses || 0) + effect.recurringDelta));
  }
  if (typeof effect.debtDelta === 'number') {
    state.debt = Math.max(0, Math.round((state.debt || 0) + effect.debtDelta));
  }
  if (typeof effect.joblessMonths === 'number') {
    state.joblessMonths = Math.max(0, Math.round(effect.joblessMonths));
  }
  if (typeof effect.salaryCutMonths === 'number') {
    state.salaryCutMonths = Math.max(0, Math.round(effect.salaryCutMonths));
    state.salaryCutAmount = Math.max(0, Math.round(effect.salaryCutAmount || 0));
  }
};

const rollRandomEvent = (state, configs, rng) => {
  const events = configs?.randomEvents?.events || [];
  if (!events.length) return;
  const difficulty = BALANCE_DEFAULTS.defaultDifficulty;
  const eventChance = BALANCE_DEFAULTS.difficultyPresets?.[difficulty]?.eventChance ?? 0.3;
  if (rng() > eventChance) return;
  const event = events[Math.min(events.length - 1, Math.floor(rng() * events.length))];
  if (rng() > (event.chance ?? 0.5)) return;
  if (event.protectionKey && state.protections?.[event.protectionKey]) {
    state.protections = { ...state.protections, [event.protectionKey]: false };
    return;
  }
  applyEventEffect(state, event.effect);
};

const advanceMonth = (state, configs, rng) => {
  const instruments = configs?.instruments?.instruments || [];
  const instrumentMap = getInstrumentMap(configs);
  const market = simulateMarkets(state, configs, rng);
  state.priceState = market.priceState;

  rollRandomEvent(state, configs, rng);

  const income = estimateMonthlyIncome(state, configs, instrumentMap);
  let salary = income.salary;
  let salaryProgression = state.salaryProgression;
  if (salaryProgression) {
    const step = Math.max(1, Math.floor(salaryProgression.stepMonths || 1));
    let monthsUntilStep =
      typeof salaryProgression.monthsUntilStep === 'number'
        ? salaryProgression.monthsUntilStep - 1
        : step - 1;
    let currentBase =
      typeof salaryProgression.currentBase === 'number'
        ? salaryProgression.currentBase
        : salary;
    const cap = typeof salaryProgression.cap === 'number'
      ? salaryProgression.cap
      : Number.POSITIVE_INFINITY;
    const percent = salaryProgression.percent || 0;
    if (monthsUntilStep <= 0) {
      if (currentBase < cap) {
        currentBase = Math.min(cap, Math.round(currentBase * (1 + percent)));
      }
      monthsUntilStep = step;
    }
    salaryProgression = { ...salaryProgression, monthsUntilStep, currentBase };
    state.salaryProgression = salaryProgression;
  }
  if (state.joblessMonths > 0) {
    state.joblessMonths -= 1;
    salary = 0;
  }
  if (state.salaryCutMonths > 0) {
    state.salaryCutMonths -= 1;
    if (state.salaryCutMonths === 0) {
      state.salaryCutAmount = 0;
    }
  }
  const progressive = computeProgressiveExpense(state, configs.rules, salary);
  const effectiveRecurring = Math.round((state.recurringExpenses || 0) + progressive);
  const monthlyRate = configs.rules?.loans?.apr || 0;
  const debtInterest = Math.round(Math.max(0, state.debt * monthlyRate));
  state.debt = Math.max(0, Math.round(state.debt + debtInterest));
  const passiveIncome = income.passiveIncome;
  state.cash = Math.round(state.cash + salary + passiveIncome - effectiveRecurring);
  const updatedDeals = state.dealParticipations.map((deal) => {
    if (deal.completed) return deal;
    const nextElapsed = Math.min(deal.durationMonths || 1, (deal.elapsedMonths || 0) + 1);
    return {
      ...deal,
      elapsedMonths: nextElapsed,
      completed: nextElapsed >= (deal.durationMonths || 1),
    };
  });
  state.dealParticipations = updatedDeals;
  state.month += 1;
  let netWorth = computeNetWorth(state, configs);
  const creditLimit = computeCreditLimit({
    profession: state.profession,
    netWorth,
    salary: state.profession?.salaryMonthly || 0,
    rules: configs.rules,
  });
  let availableCredit = creditLimit - state.debt;
  const emergencyRules = configs.rules?.emergencyCredit;
  if (emergencyRules?.enabled && state.cash < 0 && availableCredit > 0) {
    const minDraw = emergencyRules.minDraw || 0;
    const percent = emergencyRules.drawPercent || 0;
    const target = Math.max(minDraw, effectiveRecurring * percent);
    const emergencyDraw = Math.min(availableCredit, Math.max(0, Math.round(target)));
    if (emergencyDraw > 0) {
      state.cash = Math.round(state.cash + emergencyDraw);
      state.debt = Math.round(state.debt + emergencyDraw);
      availableCredit = creditLimit - state.debt;
      netWorth = computeNetWorth(state, configs);
    }
  }

  const metrics = {
    passiveIncome,
    livingCost: state.livingCost || 0,
    recurringExpenses: effectiveRecurring,
    netWorth,
    cash: state.cash,
    availableCredit,
    monthlyCashFlow: salary + passiveIncome - effectiveRecurring,
    debtDelta: debtInterest,
    debt: state.debt,
  };
  const goalState = evaluateGoals(
    { rules: configs.rules, trackers: state.trackers },
    metrics,
  );
  state.trackers = goalState.trackers;
  state.winCondition = state.winCondition || goalState.win;
  state.loseCondition = state.loseCondition || goalState.lose;
  state.lastTurn = {
    salary,
    passiveIncome,
    recurringExpenses: effectiveRecurring,
    debtInterest,
  };
};

const applyAggressiveCredit = (state, configs, rng) => {
  const instrumentMap = getInstrumentMap(configs);
  const income = estimateMonthlyIncome(state, configs, instrumentMap);
  const effectiveRecurring = getEffectiveRecurring(state, configs.rules, income.salary);
  const netWorth = computeNetWorth(state, configs);
  const creditLimit = computeCreditLimit({
    profession: state.profession,
    netWorth,
    salary: state.profession?.salaryMonthly || 0,
    rules: configs.rules,
  });
  const available = Math.max(0, creditLimit - state.debt);
  if (available <= 0) return;
  if (rng() > 0.98) return;
  const draw = Math.round(available);
  if (draw <= 0) return;
  state.cash = Math.round(state.cash + draw);
  state.debt = Math.round(state.debt + draw);
};

const simulatePolicy = (policy, configs, runs, seedBase) => {
  const outcomes = [];
  const rng = createRng(seedBase);
  for (let i = 0; i < runs; i += 1) {
    const runSeed = Math.floor(rng() * 0xffffffff);
    const runRng = createRng(runSeed);
    const professionId = pickProfessionId(configs, runRng);
    if (!professionId) {
      outcomes.push({ win: false, lose: true, turn: 0, netWorth: 0, sustained: false });
      continue;
    }
    const profession = (configs.professions?.professions || [])
      .find((item) => item.id === professionId);
    if (!profession) {
      outcomes.push({ win: false, lose: true, turn: 0, netWorth: 0, sustained: false });
      continue;
    }
    const state = buildInitialState(profession, configs, runRng);
    let sustainedPositive = false;
    let positiveStreak = 0;
    let winTurn = null;
    let loseTurn = null;
    for (let turn = 0; turn < TURNS; turn += 1) {
      if (policy === 'aggressive') {
        applyAggressiveCredit(state, configs, runRng);
      }
      const availableActions = rollMonthlyActions(
        runRng,
        configs.homeActions?.actions || [],
        configs.homeActions || {},
      );
      const actionId = selectHomeAction(policy, availableActions, state, configs, runRng);
      if (actionId) {
        const action = (configs.homeActions?.actions || []).find((item) => item.id === actionId);
        applyHomeAction(action, state, configs, runRng);
      }
      const deal = pickDeal(policy, state, configs, runRng);
      if (deal) {
        if (state.cash >= (deal.entryCost || 0)) {
          state.cash = Math.round(state.cash - (deal.entryCost || 0));
          state.dealParticipations.push({
            participationId: `${deal.id}-${turn}-${runSeed}`,
            dealId: deal.id,
            title: deal.title,
            invested: deal.entryCost,
            monthlyPayout: deal.monthlyPayout || 0,
            durationMonths: deal.durationMonths || 1,
            elapsedMonths: 0,
            completed: false,
          });
        }
      }
      applyInvestments(policy, state, configs);
      advanceMonth(state, configs, runRng);
      if (state.winCondition && winTurn == null) {
        winTurn = turn + 1;
      }
      if (state.loseCondition && loseTurn == null) {
        loseTurn = turn + 1;
      }
      if (state.lastTurn) {
        const cashFlow = Math.round(
          (state.lastTurn.salary || 0)
          + (state.lastTurn.passiveIncome || 0)
          - (state.lastTurn.recurringExpenses || 0),
        );
        if (cashFlow > 0) {
          positiveStreak += 1;
          if (positiveStreak >= 5) {
            sustainedPositive = true;
          }
        } else {
          positiveStreak = 0;
        }
      }
      if (winTurn != null || loseTurn != null) {
        break;
      }
    }
    const netWorth = computeNetWorth(state, configs);
    outcomes.push({
      win: winTurn != null,
      lose: loseTurn != null,
      winTurn,
      loseTurn,
      netWorth,
      sustained: sustainedPositive,
    });
  }
  return outcomes;
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
};

const rate = (list, predicate) => {
  if (!list.length) return 0;
  const count = list.filter(predicate).length;
  return count / list.length;
};

const checkCriteria = (results) => {
  const balanced = results.balanced;
  const aggressive = results.aggressive;
  const conservative = results.conservative;
  const speedrunWin = rate(
    [...balanced, ...aggressive, ...conservative],
    (r) => r.win && r.winTurn != null && r.winTurn <= SHORT_TURNS,
  );
  const unfairLose = rate(
    balanced,
    (r) => r.lose && r.loseTurn != null && r.loseTurn <= SHORT_TURNS,
  );
  const balancedBankruptcy = rate(balanced, (r) => r.lose);
  const aggressiveBankruptcy = rate(aggressive, (r) => r.lose);
  const conservativeBankruptcy = rate(conservative, (r) => r.lose);
  const balancedSustain = rate(balanced, (r) => r.sustained);
  const medianBalanced = median(balanced.map((r) => r.netWorth));
  const medianAggressive = median(aggressive.map((r) => r.netWorth));
  const medianConservative = median(conservative.map((r) => r.netWorth));
  const strategyGap = Math.min(
    Math.abs(medianAggressive - medianBalanced),
    Math.abs(medianBalanced - medianConservative),
  );
  const acceptable = (
    speedrunWin < 0.01
    && unfairLose < 0.01
    && balancedBankruptcy < 0.1
    && balancedSustain >= 0.4
    && balancedSustain <= 0.8
    && aggressiveBankruptcy >= 0.1
    && aggressiveBankruptcy <= 0.25
    && conservativeBankruptcy < 0.05
    && medianAggressive > medianBalanced
    && medianBalanced > medianConservative
    && strategyGap > Math.max(1000, Math.abs(medianBalanced) * 0.05)
  );
  return {
    acceptable,
    metrics: {
      speedrunWin,
      unfairLose,
      balancedBankruptcy,
      aggressiveBankruptcy,
      conservativeBankruptcy,
      balancedSustain,
      medianBalanced,
      medianAggressive,
      medianConservative,
      strategyGap,
    },
  };
};

const main = async () => {
  const configs = {
    rules: await readJson('game_rules.json'),
    homeActions: await readJson('home_actions.json'),
    instruments: await readJson('instruments.json'),
    markets: await readJson('markets.json'),
    professions: await readJson('professions.json'),
    randomEvents: await readJson('random_events.json'),
  };
  const balanced = simulatePolicy('balanced', configs, RUNS, BASE_SEED + 1);
  const aggressive = simulatePolicy('aggressive', configs, RUNS, BASE_SEED + 2);
  const conservative = simulatePolicy('conservative', configs, RUNS, BASE_SEED + 3);
  const { acceptable, metrics } = checkCriteria({ balanced, aggressive, conservative });
  if (!acceptable) {
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
