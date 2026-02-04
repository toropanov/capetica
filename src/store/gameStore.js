import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { seedPriceState, simulateMarkets } from '../domain/marketSimulator';
import {
  getProfessionById,
  computeLivingCost,
  computeCreditLimit,
  calculateHoldingsValue,
  calculatePassiveIncome,
  evaluateGoals,
} from '../domain/finance';
import { ensureSeed, uniformFromSeed } from '../domain/rng';
import { DEAL_WINDOW_RULES } from '../domain/deals';

const RNG_STORAGE_KEY = 'capetica_rng_seed';
const DEFAULT_DIFFICULTY = 'normal';
const DIFFICULTY_PRESETS = {
  easy: { eventChance: 0.65 },
  normal: { eventChance: 0.55 },
  hard: { eventChance: 0.45 },
};
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const hydratedStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? noopStorage : window.localStorage,
);

const DEFAULT_HOME_ACTION_COUNT = 4;

const getHomeActions = (configs) => configs?.homeActions?.actions || [];

const getRandomEvents = (configs) => configs?.randomEvents?.events || [];

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

const roundMoney = (value) => Math.round(value ?? 0);

function describeEffect(effect = {}) {
  const parts = [];
  if (typeof effect.cashDelta === 'number' && effect.cashDelta !== 0) {
    parts.push(`${effect.cashDelta > 0 ? '+' : '-'}$${Math.abs(Math.round(effect.cashDelta))}`);
  }
  if (typeof effect.salaryBonusDelta === 'number' && effect.salaryBonusDelta !== 0) {
    parts.push(
      `зарплата ${effect.salaryBonusDelta > 0 ? '+' : '-'}$${Math.abs(
        Math.round(effect.salaryBonusDelta),
      )}`,
    );
  }
  if (typeof effect.recurringDelta === 'number' && effect.recurringDelta !== 0) {
    parts.push(
      `фикс.расходы ${effect.recurringDelta > 0 ? '+' : '-'}$${Math.abs(
        Math.round(effect.recurringDelta),
      )}`,
    );
  }
  if (typeof effect.joblessMonths === 'number' && effect.joblessMonths > 0) {
    parts.push(`без работы ${effect.joblessMonths} мес`);
  }
  if (typeof effect.salaryCutMonths === 'number' && effect.salaryCutMonths > 0) {
    const cut = Math.abs(Math.round(effect.salaryCutAmount || 0));
    parts.push(`зарплата -$${cut} на ${effect.salaryCutMonths} мес`);
  }
  return parts.length ? parts.join(', ') : null;
}

function rollMonthlyActions(seed, actions = [], count = DEFAULT_HOME_ACTION_COUNT) {
  let cursor = seed ?? ensureSeed();
  const pool = actions.map((item) => item.id);
  const limit = Math.min(count, pool.length);
  if (!limit) {
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
    return { event: null, seed, patch: {}, message: null };
  }
  let cursorSeed = seed;
  const difficultyKey = state.difficulty || DEFAULT_DIFFICULTY;
  const eventThreshold =
    DIFFICULTY_PRESETS[difficultyKey]?.eventChance ?? DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY].eventChance;
  const rollChance = uniformFromSeed(cursorSeed);
  cursorSeed = rollChance.seed;
  if (rollChance.value > eventThreshold) {
    return { event: null, seed: cursorSeed, patch: {}, message: null };
  }
  const pickRoll = uniformFromSeed(cursorSeed);
  cursorSeed = pickRoll.seed;
  const index = Math.min(events.length - 1, Math.floor(pickRoll.value * events.length));
  const event = events[index];
  const confirm = uniformFromSeed(cursorSeed);
  cursorSeed = confirm.seed;
  if (confirm.value > (event.chance ?? 0.5)) {
    return { event: null, seed: cursorSeed, patch: {}, message: null };
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
      message: `${event.title}: защита сработала`,
      protections,
    };
  }
  const patch = applyOutcomeToState(state, event.effect);
  const effectText = describeEffect(event.effect);
  const base =
    event.type === 'positive'
      ? `${event.title}: ${event.description}`
      : `⚠ ${event.title}: ${event.description}`;
  const message = effectText ? `${base} (${effectText})` : base;
  return {
    event,
    seed: cursorSeed,
    patch,
    message,
    protections: null,
  };
}

function getInstrumentMap(configs) {
  const list = configs?.instruments?.instruments || [];
  return list.reduce((acc, instrument) => {
    acc[instrument.id] = instrument;
    return acc;
  }, {});
}

function ensureStoredSeed() {
  if (typeof window === 'undefined') {
    return ensureSeed();
  }
  const existing = window.localStorage.getItem(RNG_STORAGE_KEY);
  if (existing) {
    return ensureSeed(Number(existing));
  }
  const generated = ensureSeed(Math.floor(Math.random() * 0xffffffff));
  window.localStorage.setItem(RNG_STORAGE_KEY, `${generated}`);
  return generated;
}

function buildProfessionState(baseState, profession) {
  if (!profession) return {};
  const instrumentList = baseState.configs?.instruments?.instruments || [];
  const seededPrices = seedPriceState(
    instrumentList,
    baseState.rngSeed ?? ensureStoredSeed(),
  );
  const holdings = {};
  Object.entries(profession.startingPortfolio || {}).forEach(([instrumentId, units]) => {
    holdings[instrumentId] = {
      units,
      costBasis: (seededPrices[instrumentId]?.price || 0) * units,
    };
  });
  const livingBase = computeLivingCost(profession.id, baseState.configs?.rules);
  const cash = profession.startingMoney || 0;
  const debt = profession.startingDebt || 0;
  const holdingsValue = calculateHoldingsValue(holdings, seededPrices);
  const netWorth = cash + holdingsValue - debt;
  const salary = profession.salaryMonthly || 0;
  const recurringExpenses = Math.max(0, Math.round(profession.monthlyExpenses || livingBase * 0.4));
  const creditLimit = computeCreditLimit({
    profession,
    netWorth,
    salary,
    rules: baseState.configs?.rules,
  });
  const dealWindows = initDealWindows(baseState.rngSeed ?? ensureStoredSeed());
  const salaryProgression = profession.salaryProgression
    ? {
        ...profession.salaryProgression,
        monthsUntilStep: profession.salaryProgression.stepMonths || 1,
        currentBase: profession.salaryMonthly || 0,
      }
    : null;
  const defaultActions = getHomeActions(baseState.configs).slice(0, DEFAULT_HOME_ACTION_COUNT);
  const selectedGoalId =
    baseState.selectedGoalId || baseState.configs?.rules?.win?.[0]?.id || null;
  const difficulty = baseState.difficulty || DEFAULT_DIFFICULTY;
  return {
    profession,
    professionId: profession.id,
    month: 0,
    cash,
    debt,
    baseLivingCost: livingBase,
    lifestyleModifier: 0,
    livingCost: livingBase,
    salaryBonus: 0,
    recurringExpenses,
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
    history: {
      netWorth: [{ month: 0, value: netWorth }],
      cashFlow: [],
      passiveIncome: [],
    },
    creditLimit,
    availableCredit: creditLimit - debt,
    creditBucket: 0,
    lastTurn: null,
    recentLog: [],
    currentEvent: null,
    availableActions: defaultActions,
    activeMonthlyOffers: [],
    dealParticipations: [],
    actionsThisTurn: 0,
    badgeActionsThisTurn: 0,
    lastTradeAction: null,
    monthlyOfferUsed: false,
    joblessMonths: 0,
    salaryCutMonths: 0,
    salaryCutAmount: 0,
    dealWindows,
    salaryProgression,
    selectedGoalId,
    difficulty,
  };
}

function clampHistory(arr = [], cap = 120) {
  if (arr.length <= cap) return arr;
  return arr.slice(arr.length - cap);
}

function handleHomeAction(actionId, state, seed, actions = []) {
  const action = actions.find((item) => item.id === actionId);
  if (!action) return { patch: {}, message: '' };
  if (action.id === 'debt_payment') {
    if (state.debt <= 0 || state.cash <= 100) {
      return { patch: {}, message: 'Нечего гасить.' };
    }
    const budget = Math.min(Math.round(state.cash * 0.3), state.cash);
    const payment = Math.min(budget, state.debt);
    const nextCash = roundMoney(state.cash - payment);
    const nextDebt = Math.max(0, roundMoney(state.debt - payment));
    return {
      patch: { cash: nextCash, debt: nextDebt },
      message: `Закрыто $${payment.toFixed(0)} долга`,
    };
  }
  if (action.cost && state.cash < action.cost) {
    return { patch: {}, message: `Нужно $${action.cost}` };
  }
  let patch = {};
  if (action.cost) {
    patch.cash = roundMoney(state.cash - action.cost);
  }
  let message = '';
  let nextSeed = seed;
  switch (action.effect) {
    case 'salary_up': {
      const delta = action.value || 0;
      patch.salaryBonus = roundMoney(state.salaryBonus + delta);
      message = `Зарплата вырастет на $${delta}`;
      break;
    }
    case 'expense_down': {
      const drop = action.value || 0;
      const nextRecurring = Math.max(
        0,
        roundMoney((patch.recurringExpenses ?? state.recurringExpenses) - drop),
      );
      patch.recurringExpenses = nextRecurring;
      message = `Фикс.расходы -$${drop}`;
      break;
    }
    case 'cost_down': {
      const relief = action.value || 0;
      const nextModifier = Math.max(0, state.lifestyleModifier - relief);
      patch.lifestyleModifier = nextModifier;
      patch.livingCost = state.baseLivingCost + nextModifier;
      message = 'Стресс снят — расходы ниже.';
      break;
    }
    case 'protection': {
      patch.protections = {
        ...state.protections,
        [action.protectionKey]: true,
      };
      message = 'Защита активирована.';
      break;
    }
    case 'take_credit': {
      const available = Math.max(0, state.creditLimit - state.debt);
      const draw = Math.min(action.value || 1000, available);
      if (draw <= 0) {
        return { patch: {}, message: 'Нет доступного лимита.' };
      }
      patch.cash = roundMoney(state.cash + draw);
      patch.debt = roundMoney(state.debt + draw);
      message = `Получено $${draw} кредита`;
      break;
    }
    default:
      break;
  }
  if (action.type === 'chance') {
    if (action.cost && state.cash < action.cost) {
      return { patch: {}, message: `Нужно $${action.cost}`, nextSeed };
    }
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
    const effectSummary = describeEffect(outcomeEffect);
    message = success
      ? `Мероприятие выстрелило${effectSummary ? ` (${effectSummary})` : ''}`
      : `Провал мероприятия${effectSummary ? ` (${effectSummary})` : ''}`;
  }
  if (!message) {
    message = 'Улучшение применено.';
  }
  return { patch, message, nextSeed };
}

const useGameStore = create(
  persist(
    (set, get) => ({
      configs: null,
      configsReady: false,
      rngSeed: null,
      profession: null,
      professionId: null,
      month: 0,
      cash: 0,
      debt: 0,
      baseLivingCost: 0,
      livingCost: 0,
      lifestyleModifier: 0,
      salaryBonus: 0,
      recurringExpenses: 0,
      protections: { healthPlan: false, legalShield: false, techShield: false },
      investments: {},
      priceState: {},
      shockState: {},
      history: { netWorth: [], cashFlow: [], passiveIncome: [] },
      trackers: { win: {}, lose: {} },
      winCondition: null,
      loseCondition: null,
      creditLimit: 0,
      availableCredit: 0,
      creditBucket: 0,
      lastTurn: null,
      recentLog: [],
      currentEvent: null,
      availableActions: [],
      activeMonthlyOffers: [],
      dealParticipations: [],
      actionsThisTurn: 0,
      badgeActionsThisTurn: 0,
      lastTradeAction: null,
      lastPurchases: {},
      lastSales: {},
      tradeLocks: {},
      creditLockedMonth: null,
      monthlyOfferUsed: false,
      selectedGoalId: null,
      difficulty: DEFAULT_DIFFICULTY,
      settingsDirty: false,
      hideContinueAfterSettings: false,
      suppressGoalCard: false,
      transitionState: 'idle',
      transitionMessage: '',
      transitionState: 'idle',
      joblessMonths: 0,
      salaryCutMonths: 0,
      salaryCutAmount: 0,
      dealWindows: {},
      acknowledgeOutcome: () => set(() => ({ winCondition: null, loseCondition: null })),
      salaryProgression: null,
      bootstrapFromConfigs: (bundle) =>
        set((state) => {
          const rngSeed = state.rngSeed ?? ensureStoredSeed();
          const priceState =
            Object.keys(state.priceState || {}).length > 0
              ? state.priceState
              : seedPriceState(bundle?.instruments?.instruments, rngSeed);
          const defaultActions = getHomeActions(bundle).slice(0, DEFAULT_HOME_ACTION_COUNT);
          const defaultGoal = state.selectedGoalId || bundle?.rules?.win?.[0]?.id || null;
          const difficulty = state.difficulty || DEFAULT_DIFFICULTY;
          return {
            configs: bundle,
            configsReady: true,
            rngSeed,
            priceState,
            availableActions: state.availableActions?.length
              ? state.availableActions
              : defaultActions,
            selectedGoalId: defaultGoal,
            difficulty,
          };
        }),
      selectProfession: (professionId, prefs = {}) =>
        set((state) => {
          if (!state.configsReady) return {};
          const profession = getProfessionById(
            state.configs.professions,
            professionId,
          );
          if (!profession) return {};
          const goalList = state.configs?.rules?.win || [];
          const nextGoalId = prefs.goalId || state.selectedGoalId || goalList[0]?.id || null;
          const nextDifficulty = prefs.difficulty || state.difficulty || DEFAULT_DIFFICULTY;
          const homeActionList = getHomeActions(state.configs);
          const actionRoll = rollMonthlyActions(
            state.rngSeed || ensureStoredSeed(),
            homeActionList,
          );
          const base = buildProfessionState(
            { ...state, selectedGoalId: nextGoalId, difficulty: nextDifficulty },
            profession,
          );
          return {
            ...base,
            settingsDirty: false,
            hideContinueAfterSettings: true,
            availableActions: actionRoll.actions,
            rngSeed: actionRoll.seed,
            selectedGoalId: nextGoalId,
            difficulty: nextDifficulty,
            actionsThisTurn: 0,
            badgeActionsThisTurn: 0,
            lastTradeAction: null,
            lastPurchases: {},
            lastSales: {},
            tradeLocks: {},
            creditLockedMonth: null,
            suppressGoalCard: false,
          };
        }),
      randomProfession: (prefs = {}) =>
        set((state) => {
          const list = state.configs?.professions?.professions || [];
          if (!list.length) return {};
          const roll = uniformFromSeed(state.rngSeed || ensureStoredSeed());
          const index = Math.min(
            list.length - 1,
            Math.floor(roll.value * list.length),
          );
          const profession = list[index];
          const homeActionList = getHomeActions(state.configs);
          const actionRoll = rollMonthlyActions(roll.seed, homeActionList);
          const goalList = state.configs?.rules?.win || [];
          const nextGoalId = prefs.goalId || state.selectedGoalId || goalList[0]?.id || null;
          const nextDifficulty = prefs.difficulty || state.difficulty || DEFAULT_DIFFICULTY;
          return {
            ...buildProfessionState(
              { ...state, selectedGoalId: nextGoalId, difficulty: nextDifficulty },
              profession,
            ),
            settingsDirty: false,
            hideContinueAfterSettings: false,
            availableActions: actionRoll.actions,
            rngSeed: actionRoll.seed,
            selectedGoalId: nextGoalId,
            difficulty: nextDifficulty,
            actionsThisTurn: 0,
            badgeActionsThisTurn: 0,
            lastTradeAction: null,
            lastPurchases: {},
            lastSales: {},
            tradeLocks: {},
            creditLockedMonth: null,
            suppressGoalCard: false,
          };
        }),
      setSelectedGoal: (goalId) => set(() => ({ selectedGoalId: goalId })),
      setDifficulty: (level = DEFAULT_DIFFICULTY) =>
        set(() => ({ difficulty: level || DEFAULT_DIFFICULTY })),
      markSettingsDirty: () => set(() => ({ settingsDirty: true })),
      clearSettingsDirty: () => set(() => ({ settingsDirty: false })),
      suppressGoalCard: () => set(() => ({ suppressGoalCard: true })),
      resetGoalCardSuppression: () => set(() => ({ suppressGoalCard: false })),
      beginTransition: (message = '') =>
        set(() => ({ transitionState: 'running', transitionMessage: message })),
      completeTransition: () => set(() => ({ transitionState: 'complete' })),
      resetTransition: () => set(() => ({ transitionState: 'idle', transitionMessage: '' })),
      advanceMonth: () =>
        set((state) => {
          if (!state.profession || !state.configsReady) return {};
          const instrumentList = state.configs.instruments.instruments || [];
          const simResult = simulateMarkets({
            month: state.month,
            priceState: state.priceState,
            instruments: instrumentList,
            marketsConfig: state.configs.markets,
            rngSeed: state.rngSeed,
            shockState: state.shockState,
          });
          const priceState = simResult.priceState;
          const rngSeed = simResult.rngSeed;
          const shockState = simResult.shockState;
          const instrumentMap = getInstrumentMap(state.configs);
          const baseInvestments = Object.entries(state.investments || {}).reduce((acc, [instrumentId, holding]) => {
            acc[instrumentId] = { ...holding };
            return acc;
          }, {});
          let autoLiquidation = 0;
          const stopLossWarnings = [];
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
              stopLossWarnings.push(
                `Стоп-лосс по ${info.title}: продано ${leveragedUnits.toFixed(2)} лотов.`,
              );
            }
          });
          const holdingsValue = calculateHoldingsValue(
            baseInvestments,
            priceState,
          );
          const passiveIncomeRaw = calculatePassiveIncome(
            baseInvestments,
            priceState,
            instrumentMap,
          );
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
                currentBase = Math.min(
                  cap,
                  Math.round(currentBase * (1 + percent)),
                );
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
          const livingCost = 0;
          const recurringExpenses = roundMoney(state.recurringExpenses || 0);
          const monthlyRate =
            (state.configs.rules?.loans?.apr || 0) / 12;
          const debtInterest = roundMoney(state.debt * monthlyRate);
          const debt = Math.max(0, roundMoney(state.debt + debtInterest));
          const cash = roundMoney(
            state.cash + salary + passiveIncome - livingCost - recurringExpenses + autoLiquidation,
          );
          const netHistoryBase = clampHistory([
            ...(state.history.netWorth || []),
            { month: state.month + 1, value: cash + holdingsValue - debt },
          ]);
          const passiveHistory = clampHistory([
            ...(state.history.passiveIncome || []),
            { month: state.month + 1, value: passiveIncome },
          ]);
          const updatedDeals = (state.dealParticipations || []).map((deal) => {
            if (deal.completed) {
              return deal;
            }
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
          const homeActionList = getHomeActions(state.configs);
          const eventPool = getRandomEvents(state.configs);
          const eventRoll = rollRandomEvent({ ...state, cash, debt }, rngSeed, eventPool);
          const actionsRoll = rollMonthlyActions(eventRoll.seed, homeActionList);
          const dealWindowRoll = advanceDealWindows(state.dealWindows, actionsRoll.seed);
          const patchedCash = eventRoll.patch.cash ?? cash;
          const patchedDebt = eventRoll.patch.debt ?? debt;
          const patchedSalaryBonus = eventRoll.patch.salaryBonus ?? state.salaryBonus;
          const patchedRecurring = eventRoll.patch.recurringExpenses ?? state.recurringExpenses;
          const patchedProtections = eventRoll.protections || state.protections;
          const netWorth = patchedCash + holdingsValue - patchedDebt;
          const creditLimit = computeCreditLimit({
            profession: state.profession,
            netWorth,
            salary: (state.profession.salaryMonthly || 0) + patchedSalaryBonus,
            rules: state.configs.rules,
          });
          const dropThreshold = (state.configs.markets?.global?.significantDrop || -0.15);
          const riseThreshold = state.configs.markets?.global?.significantRise || 0.15;
          const marketWarnings = Object.entries(simResult.returns || {}).reduce((acc, [instrumentId, ret]) => {
            const info = instrumentMap[instrumentId];
            if (!info) return acc;
            if (ret <= dropThreshold) {
              const label = info.type === 'crypto' ? 'Криптовалюта' : 'Акции';
              const verb = info.type === 'crypto' ? 'просела' : 'просели';
              acc.push(`${label} ${verb} на ${Math.round(Math.abs(ret) * 100)}%`);
            } else if (ret >= riseThreshold) {
              const label = info.type === 'crypto' ? 'Криптовалюта' : 'Акции';
              const verb = info.type === 'crypto' ? 'выросла' : 'выросли';
              acc.push(`${label} ${verb} на ${Math.round(ret * 100)}%`);
            }
            return acc;
          }, []);
          const cashFlowHistory = clampHistory([
            ...(state.history.cashFlow || []),
            {
              month: state.month + 1,
              value: salary + passiveIncome - livingCost - patchedRecurring,
            },
          ]);
          const availableCredit = creditLimit - patchedDebt;
          const metrics = {
            passiveIncome,
            livingCost,
            recurringExpenses: patchedRecurring,
            netWorth,
            cash: patchedCash,
            availableCredit,
            monthlyCashFlow: salary + passiveIncome - livingCost - patchedRecurring,
            debtDelta: debtInterest,
            debt: patchedDebt,
          };
          const goalState = evaluateGoals(
            { rules: state.configs.rules, trackers: state.trackers },
            metrics,
          );
          const netHistory = netHistoryBase.length
            ? [
                ...netHistoryBase.slice(0, netHistoryBase.length - 1),
                { month: state.month + 1, value: netWorth },
              ]
            : [{ month: state.month + 1, value: netWorth }];
          let recentLog = state.recentLog || [];
          if (eventRoll.message) {
            const entry = {
              id: `event-${Date.now()}`,
              month: state.month + 1,
              text: eventRoll.message,
              amount:
                eventRoll.event?.effect?.cashDelta ??
                Math.round(eventRoll.patch?.cashDelta ?? 0),
            };
            recentLog = [entry, ...recentLog].slice(0, 5);
          }
          stopLossWarnings.forEach((warning) => {
            const entry = {
              id: `stoploss-${Date.now()}-${Math.random()}`,
              month: state.month + 1,
              text: warning,
              type: 'stoploss',
            };
            recentLog = [entry, ...recentLog].slice(0, 5);
          });
          marketWarnings.forEach((warning) => {
            const entry = {
              id: `market-${Date.now()}-${Math.random()}`,
              month: state.month + 1,
              text: warning,
              type: 'market',
            };
            recentLog = [entry, ...recentLog].slice(0, 5);
          });
          return {
            month: state.month + 1,
            cash: patchedCash,
            debt: patchedDebt,
            salaryBonus: patchedSalaryBonus,
            recurringExpenses: patchedRecurring,
            priceState,
            rngSeed: dealWindowRoll.seed,
            shockState,
            livingCost,
            currentEvent: eventRoll.event
              ? { ...eventRoll.event, message: eventRoll.message }
              : null,
            availableActions: actionsRoll.actions,
            dealWindows: dealWindowRoll.state,
            protections: patchedProtections,
            history: {
              netWorth: netHistory,
              cashFlow: cashFlowHistory,
              passiveIncome: passiveHistory,
            },
            creditLimit,
            availableCredit,
            trackers: goalState.trackers,
            winCondition: state.winCondition || goalState.win,
            loseCondition: state.loseCondition || goalState.lose,
            activeMonthlyOffers: (state.activeMonthlyOffers || []).filter(
              (offer) => offer.expiresMonth > state.month + 1,
            ),
            dealParticipations: updatedDeals,
            joblessMonths,
            salaryCutMonths,
            salaryCutAmount,
            investments: baseInvestments,
            monthlyOfferUsed: false,
            salaryProgression,
            actionsThisTurn: 0,
            badgeActionsThisTurn: 0,
            lastTradeAction: null,
            lastSales: {},
            lastPurchases: {},
            tradeLocks: {},
            creditLockedMonth: null,
            lastTurn: {
              salary,
              passiveIncome,
              livingCost,
              recurringExpenses,
              debtInterest,
              returns: simResult.returns,
              stopLossWarnings,
            },
            recentLog,
          };
        }),
      buyInstrument: (instrumentId, desiredAmount) =>
        set((state) => {
          const instrument =
            getInstrumentMap(state.configs)[instrumentId];
          const price = state.priceState[instrumentId]?.price;
          if (!instrument || !price || desiredAmount <= 0) {
            return {};
          }
          const locks = state.tradeLocks || {};
          const isLockable =
            instrument.type && ['stocks', 'crypto'].includes(instrument.type);
          const lockedThisTurn =
            isLockable && locks[instrumentId] === state.month;
          if (lockedThisTurn) {
            return {};
          }
          const feePct = instrument.trading?.buyFeePct || 0;
          const minOrder = instrument.trading?.minOrder || 0;
          const maxSpendable = Math.min(desiredAmount, state.cash / (1 + feePct));
          if (maxSpendable < minOrder) {
            return {};
          }
          const spend = Math.max(minOrder, maxSpendable);
          if (spend <= 0) {
            return {};
          }
          const fee = spend * feePct;
          if (spend + fee > state.cash + 1e-3) {
            return {};
          }
          const units = spend / price;
          if (units <= 0) return {};
          const nextInvestments = { ...state.investments };
          const existing = nextInvestments[instrumentId] || {
            units: 0,
            costBasis: 0,
            leveragedUnits: 0,
            leveragedCost: 0,
          };
          const newUnits = existing.units + units;
          const totalCost =
            existing.costBasis * existing.units + spend;
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
          nextInvestments[instrumentId] = {
            units: newUnits,
            costBasis: totalCost / newUnits,
            leveragedUnits,
            leveragedCost,
          };
          const logEntry = {
            id: `buy-${instrumentId}-${Date.now()}`,
            month: state.month,
            text: `Куплено ${instrument.title} на $${Math.round(spend).toLocaleString('en-US')}`,
          };
          const recentLog = [logEntry, ...(state.recentLog || [])].slice(0, 5);
          const updates = {
            investments: nextInvestments,
            cash: state.cash - (spend + fee),
            creditBucket,
            recentLog,
            actionsThisTurn: (state.actionsThisTurn || 0) + 1,
            lastTradeAction: {
              type: 'buy',
              instrumentId,
              turn: state.month,
            },
            lastPurchases: {
              ...(state.lastPurchases || {}),
              [instrumentId]: {
                turn: state.month,
                amount: Math.round(spend),
              },
            },
          };
          if (isLockable) {
            updates.tradeLocks = { ...locks, [instrumentId]: state.month };
          }
          return updates;
        }),
      sellInstrument: (instrumentId, desiredAmount) =>
        set((state) => {
          const instrument =
            getInstrumentMap(state.configs)[instrumentId];
          const holding = state.investments[instrumentId];
          const price = state.priceState[instrumentId]?.price;
          if (!instrument || !holding || !price || desiredAmount <= 0) {
            return {};
          }
          const locks = state.tradeLocks || {};
          const isLockable =
            instrument.type && ['stocks', 'crypto'].includes(instrument.type);
          const lockedThisTurn =
            isLockable && locks[instrumentId] === state.month;
          if (lockedThisTurn) {
            return {};
          }
          const maxValue = holding.units * price;
          if (maxValue <= 0) return {};
          const gross = Math.min(desiredAmount, maxValue);
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
            delete nextInvestments[instrumentId];
          } else {
            const totalCost = holding.costBasis * holding.units;
            const remainingCost = Math.max(0, totalCost - holding.costBasis * unitsToSell);
            nextInvestments[instrumentId] = {
              ...holding,
              units: remainingUnits,
              costBasis: remainingCost / remainingUnits || 0,
              leveragedUnits,
              leveragedCost,
            };
          }
          const soldCost = (holding.costBasis || 0) * unitsToSell;
          const profit = Math.round(netProceeds - soldCost);
          const roundedProceeds = Math.round(netProceeds);
          const logEntry = {
            id: `sell-${instrumentId}-${Date.now()}`,
            month: state.month,
            text: `Продано ${instrument.title} на $${roundedProceeds.toLocaleString('en-US')}`,
          };
          const recentLog = [logEntry, ...(state.recentLog || [])].slice(0, 5);
          const updates = {
            investments: nextInvestments,
            cash: state.cash + netProceeds,
            recentLog,
            actionsThisTurn: (state.actionsThisTurn || 0) + 1,
            lastTradeAction: {
              type: 'sell',
              instrumentId,
              turn: state.month,
              amount: roundedProceeds,
              profit,
            },
            lastSales: {
              ...(state.lastSales || {}),
              [instrumentId]: {
                turn: state.month,
                amount: roundedProceeds,
                profit,
              },
            },
          };
          if (isLockable) {
            updates.tradeLocks = { ...locks, [instrumentId]: state.month };
          }
          return updates;
        }),
      participateInDeal: (dealMeta) => {
        const state = get();
        const entryCost = roundMoney(dealMeta.entryCost || 0);
        if (!dealMeta?.id) {
          return { error: 'Нет данных по сделке.' };
        }
        const window = state.dealWindows?.[dealMeta.id];
        if (!window || window.expiresIn <= 0) {
          return { error: 'Сделка закрылась.' };
        }
        if ((window.slotsLeft ?? 0) <= 0) {
          return { error: 'Слоты закончились.' };
        }
        if (entryCost <= 0) {
          return { error: 'Неверная стоимость входа.' };
        }
        if (state.cash < entryCost) {
          return { error: `Нужно $${entryCost}` };
        }
        const participation = {
          participationId: `${dealMeta.id}-${Date.now()}`,
          dealId: dealMeta.id,
          title: dealMeta.title,
          invested: entryCost,
          monthlyPayout: dealMeta.monthlyPayout || 0,
          durationMonths: dealMeta.durationMonths || 1,
          elapsedMonths: 0,
          profitEarned: 0,
          completed: false,
          risk: dealMeta.risk,
        };
        set((prev) => ({
          cash: roundMoney(prev.cash - entryCost),
          dealParticipations: [...(prev.dealParticipations || []), participation],
          dealWindows: {
            ...(prev.dealWindows || {}),
            [dealMeta.id]: {
              ...(prev.dealWindows?.[dealMeta.id] || {}),
              slotsLeft: Math.max(0, (prev.dealWindows?.[dealMeta.id]?.slotsLeft ?? 1) - 1),
            },
          },
          actionsThisTurn: (prev.actionsThisTurn || 0) + 1,
        }));
        return { ok: true };
      },
      drawCredit: (amount = 1200) =>
        set((state) => {
          if (state.creditLockedMonth === state.month) {
            return {};
          }
          const available = Math.max(0, state.creditLimit - state.debt);
          const draw = Math.min(roundMoney(amount), available);
          if (draw <= 0) return {};
          return {
            cash: roundMoney(state.cash + draw),
            debt: roundMoney(state.debt + draw),
            creditBucket: roundMoney((state.creditBucket || 0) + draw),
            creditLockedMonth: state.month,
            actionsThisTurn: (state.actionsThisTurn || 0) + 1,
            badgeActionsThisTurn: (state.badgeActionsThisTurn || 0) + 1,
          };
        }),
      serviceDebt: (amount = 600) =>
        set((state) => {
          if (state.creditLockedMonth === state.month) {
            return {};
          }
          if (state.debt <= 0 || state.cash <= 0) return {};
          const payment = Math.min(roundMoney(amount), state.cash, state.debt);
          if (payment <= 0) return {};
          const fee = Math.min(state.cash - payment, Math.round(payment * 0.08));
          return {
            cash: roundMoney(state.cash - payment - fee),
            debt: roundMoney(state.debt - payment),
            creditLockedMonth: state.month,
            actionsThisTurn: (state.actionsThisTurn || 0) + 1,
            badgeActionsThisTurn: (state.badgeActionsThisTurn || 0) + 1,
          };
        }),
      applyHomeAction: (actionId, options = {}) =>
        set((state) => {
          const currentSeed = state.rngSeed || ensureStoredSeed();
          const homeActionList = getHomeActions(state.configs);
          const { patch, message, nextSeed } = handleHomeAction(
            actionId,
            state,
            currentSeed,
            homeActionList,
          );
          const updates = {
            ...patch,
            rngSeed: nextSeed ?? currentSeed,
          };
          const success = Object.keys(patch || {}).length > 0;
          if (success) {
            const actionMeta =
              (state.availableActions || []).find((action) => action.id === actionId) ||
              homeActionList.find((action) => action.id === actionId);
            if (actionMeta) {
              const remaining = (state.activeMonthlyOffers || []).filter((offer) => offer.id !== actionMeta.id);
              updates.activeMonthlyOffers = [
                ...remaining,
                {
                  id: actionMeta.id,
                  title: actionMeta.title,
                  expiresMonth: state.month + 12,
                },
              ];
            }
            if (options.fromMonthly) {
              updates.monthlyOfferUsed = true;
            }
            updates.actionsThisTurn = (state.actionsThisTurn || 0) + 1;
            if (actionMeta && ['protection', 'take_credit'].includes(actionMeta.effect)) {
              updates.badgeActionsThisTurn = (state.badgeActionsThisTurn || 0) + 1;
            }
          }
          if (!message) {
            return updates;
          }
          const logEntry = {
            id: `${actionId}-${Date.now()}`,
            text: message,
            month: state.month,
          };
          const recentLog = [logEntry, ...(state.recentLog || [])].slice(0, 5);
          return { ...updates, recentLog };
        }),
      resetGame: () =>
        set((state) => {
          let profession = state.profession;
          if (
            !profession &&
            state.professionId &&
            state.configs?.professions
          ) {
            profession = getProfessionById(
              state.configs.professions,
              state.professionId,
            );
          }
          if (!profession) {
            const list = state.configs?.professions?.professions || [];
            if (!list.length) {
              return {};
            }
            profession = list[0];
          }
          const base = buildProfessionState(state, profession);
          const homeActionList = getHomeActions(state.configs);
          const roll = rollMonthlyActions(state.rngSeed || ensureStoredSeed(), homeActionList);
          return {
            ...state,
            ...base,
            settingsDirty: false,
            hideContinueAfterSettings: false,
            availableActions: roll.actions,
            rngSeed: roll.seed,
            configs: state.configs,
            configsReady: state.configsReady,
            selectedGoalId: state.selectedGoalId,
            difficulty: state.difficulty || DEFAULT_DIFFICULTY,
            actionsThisTurn: 0,
            badgeActionsThisTurn: 0,
            lastTradeAction: null,
            lastSales: {},
            tradeLocks: {},
            creditLockedMonth: null,
          };
        }),
    }),
    {
      name: 'capetica-store',
      storage: hydratedStorage,
      partialize: (state) => ({
        configs: state.configs,
        configsReady: state.configsReady,
        rngSeed: state.rngSeed,
        profession: state.profession,
        professionId: state.professionId,
        month: state.month,
        cash: state.cash,
        debt: state.debt,
        baseLivingCost: state.baseLivingCost,
        livingCost: state.livingCost,
        lifestyleModifier: state.lifestyleModifier,
        salaryBonus: state.salaryBonus,
        recurringExpenses: state.recurringExpenses,
        protections: state.protections,
        investments: state.investments,
        priceState: state.priceState,
        shockState: state.shockState,
        history: state.history,
        trackers: state.trackers,
        winCondition: state.winCondition,
        loseCondition: state.loseCondition,
        creditLimit: state.creditLimit,
        availableCredit: state.availableCredit,
        lastTurn: state.lastTurn,
        recentLog: state.recentLog,
        currentEvent: state.currentEvent,
        availableActions: state.availableActions,
        activeMonthlyOffers: state.activeMonthlyOffers,
        dealParticipations: state.dealParticipations,
        dealWindows: state.dealWindows,
        salaryProgression: state.salaryProgression,
        actionsThisTurn: state.actionsThisTurn,
        badgeActionsThisTurn: state.badgeActionsThisTurn,
        lastTradeAction: state.lastTradeAction,
        lastSales: state.lastSales,
        lastPurchases: state.lastPurchases,
        tradeLocks: state.tradeLocks,
        creditLockedMonth: state.creditLockedMonth,
        selectedGoalId: state.selectedGoalId,
        difficulty: state.difficulty,
        joblessMonths: state.joblessMonths,
        salaryCutMonths: state.salaryCutMonths,
        salaryCutAmount: state.salaryCutAmount,
        creditBucket: state.creditBucket,
        monthlyOfferUsed: state.monthlyOfferUsed,
        settingsDirty: state.settingsDirty,
        hideContinueAfterSettings: state.hideContinueAfterSettings,
      }),
    },
  ),
);


export default useGameStore;
