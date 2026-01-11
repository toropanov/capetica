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

const RNG_STORAGE_KEY = 'finstrategy_rng_seed';
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const hydratedStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? noopStorage : window.localStorage,
);

const HOME_ACTIONS = [
  {
    id: 'side_hustle',
    title: 'Франшиза кофе',
    description: 'Оплата наставника → +$250 к зарплате со следующего месяца.',
    cost: 250,
    effect: 'salary_up',
    value: 250,
    icon: 'iconWallet',
  },
  {
    id: 'debt_payment',
    title: 'Погашение долга',
    description: 'Закрыть до 30% долга — облегчает будущие проценты.',
    effect: 'debt_down',
    icon: 'iconCard',
  },
  {
    id: 'skill_invest',
    title: 'Интенсив навыков',
    description: 'Платное обучение → +$400 к зарплате ежемесячно.',
    cost: 600,
    effect: 'salary_up',
    value: 400,
    icon: 'iconOwl',
  },
  {
    id: 'optimize_expenses',
    title: 'Анти-подписки',
    description: 'За один вечер отменяешь лишнее — расходы падают на $120/мес.',
    cost: 320,
    effect: 'expense_down',
    value: 120,
    icon: 'iconCalculator',
  },
  {
    id: 'health_plan',
    title: 'Премиум страховка',
    description: 'Платишь фиксированно и избегаешь медсчётов.',
    cost: 350,
    effect: 'protection',
    protectionKey: 'healthPlan',
    icon: 'iconStethoscope',
  },
  {
    id: 'wellness',
    title: 'Mind&Body выходные',
    description: 'Минус стресс, траты становятся ниже на $80.',
    cost: 180,
    effect: 'cost_down',
    value: 80,
    icon: 'iconSmile',
  },
  {
    id: 'legal_consult',
    title: 'Финансовый юрист',
    description: 'Разовый платёж → защита от проверок.',
    cost: 280,
    effect: 'protection',
    protectionKey: 'legalShield',
    icon: 'iconGrowth',
  },
  {
    id: 'equipment_plan',
    title: 'Сервис гаджетов',
    description: 'Ежемесячное ТО техники — защищает от поломок.',
    cost: 220,
    effect: 'protection',
    protectionKey: 'techShield',
    icon: 'iconHardhat',
  },
  {
    id: 'credit_draw',
    title: 'Забрать кредит',
    description: 'Используешь часть лимита и пополняешь кэш.',
    effect: 'take_credit',
    value: 1500,
    buttonText: 'Получить $1500',
    icon: 'iconPiggy',
  },
  {
    id: 'event_pitch',
    title: 'Венчурное мероприятие',
    description: 'Покупаешь билет: шанс сорвать $2200, либо потерять вложение.',
    cost: 500,
    type: 'chance',
    chanceSuccess: 0.4,
    success: { cashDelta: 2200 },
    fail: { cashDelta: -600 },
    icon: 'iconGift',
  },
];

const RANDOM_EVENTS = [
  {
    id: 'dividend_boost',
    title: 'Крипто-вознаграждение',
    description: 'Платформа начислила стейкинг-бонус.',
    effect: { cashDelta: 320 },
    type: 'positive',
    chance: 0.35,
    icon: 'iconCoins',
  },
  {
    id: 'tax_review',
    title: 'Налоговая проверка',
    description: 'Нужно срочно оплатить консультацию.',
    effect: { cashDelta: -480 },
    type: 'negative',
    chance: 0.25,
    protectionKey: 'legalShield',
    icon: 'iconCard',
  },
  {
    id: 'portfolio_award',
    title: 'Премия за лид-магнит',
    description: 'Выплата за лучшее решение месяца.',
    effect: { cashDelta: 650, salaryBonusDelta: 120 },
    type: 'positive',
    chance: 0.2,
    icon: 'iconGift',
  },
  {
    id: 'hardware_failure',
    title: 'Поломка оборудования',
    description: 'Ремонт за твой счёт.',
    effect: { cashDelta: -550 },
    type: 'negative',
    chance: 0.3,
    protectionKey: 'techShield',
    icon: 'iconHardhat',
  },
  {
    id: 'clinic_invoice',
    title: 'Счёт из клиники',
    description: 'Без страховки дорого лечиться.',
    effect: { cashDelta: -620 },
    type: 'negative',
    chance: 0.3,
    protectionKey: 'healthPlan',
    icon: 'iconStethoscope',
  },
  {
    id: 'mentor_call',
    title: 'Совет ментора',
    description: 'Знания повышают доход.',
    effect: { salaryBonusDelta: 180 },
    type: 'positive',
    chance: 0.25,
    icon: 'iconBulb',
  },
  {
    id: 'utility_spike',
    title: 'Коммунальный скачок',
    description: 'Расходы выросли на месяц.',
    effect: { cashDelta: -300 },
    type: 'negative',
    chance: 0.2,
    icon: 'iconCart',
  },
  {
    id: 'low_utilities',
    title: 'Скидки на энергорынке',
    description: 'Постоянно снижаешь фиксированные расходы.',
    effect: { recurringDelta: -60 },
    type: 'positive',
    chance: 0.15,
    icon: 'iconPlant',
  },
  {
    id: 'job_loss',
    title: 'Сокращение отдела',
    description: 'Направление закрыли — остаёшься без зарплаты на несколько месяцев.',
    effect: { joblessMonths: 3 },
    type: 'negative',
    chance: 0.08,
    icon: 'iconHardhat',
  },
  {
    id: 'salary_cut',
    title: 'Антикризисное снижение',
    description: 'Компания урезает зарплату, пока рынок не стабилизируется.',
    effect: { salaryCutMonths: 3, salaryCutAmount: 400 },
    type: 'negative',
    chance: 0.12,
    icon: 'iconWallet',
  },
];


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

function rollMonthlyActions(seed, count = 4) {
  const pool = HOME_ACTIONS.map((item) => item.id);
  let cursor = seed ?? ensureSeed();
  const picked = new Set();
  while (picked.size < Math.min(count, pool.length)) {
    const roll = uniformFromSeed(cursor);
    cursor = roll.seed;
    const index = Math.min(pool.length - 1, Math.floor(roll.value * pool.length));
    picked.add(pool[index]);
  }
  const actions = HOME_ACTIONS.filter((item) => picked.has(item.id));
  return { actions, seed: cursor };
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

function rollRandomEvent(state, seed) {
  if (!RANDOM_EVENTS.length) {
    return { event: null, seed, patch: {}, message: null };
  }
  let cursorSeed = seed;
  const rollChance = uniformFromSeed(cursorSeed);
  cursorSeed = rollChance.seed;
  if (rollChance.value > 0.55) {
    return { event: null, seed: cursorSeed, patch: {}, message: null };
  }
  const pickRoll = uniformFromSeed(cursorSeed);
  cursorSeed = pickRoll.seed;
  const index = Math.min(
    RANDOM_EVENTS.length - 1,
    Math.floor(pickRoll.value * RANDOM_EVENTS.length),
  );
  const event = RANDOM_EVENTS[index];
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
    availableActions: HOME_ACTIONS.slice(0, 4),
    activeMonthlyOffers: [],
    dealParticipations: [],
    monthlyOfferUsed: false,
    joblessMonths: 0,
    salaryCutMonths: 0,
    salaryCutAmount: 0,
  };
}

function clampHistory(arr = [], cap = 120) {
  if (arr.length <= cap) return arr;
  return arr.slice(arr.length - cap);
}

function handleHomeAction(actionId, state, seed) {
  const action = HOME_ACTIONS.find((item) => item.id === actionId);
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
      availableActions: HOME_ACTIONS.slice(0, 4),
      activeMonthlyOffers: [],
      dealParticipations: [],
      monthlyOfferUsed: false,
      joblessMonths: 0,
      salaryCutMonths: 0,
      salaryCutAmount: 0,
      bootstrapFromConfigs: (bundle) =>
        set((state) => {
          const rngSeed = state.rngSeed ?? ensureStoredSeed();
          const priceState =
            Object.keys(state.priceState || {}).length > 0
              ? state.priceState
              : seedPriceState(bundle?.instruments?.instruments, rngSeed);
          return {
            configs: bundle,
            configsReady: true,
            rngSeed,
            priceState,
            availableActions: state.availableActions?.length
              ? state.availableActions
              : HOME_ACTIONS.slice(0, 4),
          };
        }),
      selectProfession: (professionId) =>
        set((state) => {
          if (!state.configsReady) return {};
          const profession = getProfessionById(
            state.configs.professions,
            professionId,
          );
          if (!profession) return {};
          const actionRoll = rollMonthlyActions(state.rngSeed || ensureStoredSeed());
          const base = buildProfessionState(state, profession);
          return {
            ...base,
            availableActions: actionRoll.actions,
            rngSeed: actionRoll.seed,
          };
        }),
      randomProfession: () =>
        set((state) => {
          const list = state.configs?.professions?.professions || [];
          if (!list.length) return {};
          const roll = uniformFromSeed(state.rngSeed || ensureStoredSeed());
          const index = Math.min(
            list.length - 1,
            Math.floor(roll.value * list.length),
          );
          const profession = list[index];
          const actionRoll = rollMonthlyActions(roll.seed);
          return {
            ...buildProfessionState(state, profession),
            availableActions: actionRoll.actions,
            rngSeed: actionRoll.seed,
          };
        }),
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
          let salaryBase = state.profession.salaryMonthly || 0;
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
          const livingCost = Math.max(
            0,
            roundMoney((state.baseLivingCost || 0) + state.lifestyleModifier),
          );
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
          const eventRoll = rollRandomEvent({ ...state, cash, debt }, rngSeed);
          const actionsRoll = rollMonthlyActions(eventRoll.seed);
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
            };
            recentLog = [entry, ...recentLog].slice(0, 5);
          }
          stopLossWarnings.forEach((warning) => {
            const entry = {
              id: `stoploss-${Date.now()}-${Math.random()}`,
              month: state.month + 1,
              text: warning,
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
            rngSeed: actionsRoll.seed,
            shockState,
            livingCost,
            currentEvent: eventRoll.event
              ? { ...eventRoll.event, message: eventRoll.message }
              : null,
            availableActions: actionsRoll.actions,
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
          return {
            investments: nextInvestments,
            cash: state.cash - (spend + fee),
            creditBucket,
            recentLog,
          };
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
          const logEntry = {
            id: `sell-${instrumentId}-${Date.now()}`,
            month: state.month,
            text: `Продано ${instrument.title} на $${Math.round(netProceeds).toLocaleString('en-US')}`,
          };
          const recentLog = [logEntry, ...(state.recentLog || [])].slice(0, 5);
          return {
            investments: nextInvestments,
            cash: state.cash + netProceeds,
            recentLog,
          };
        }),
      participateInDeal: (dealMeta) => {
        const state = get();
        const entryCost = roundMoney(dealMeta.entryCost || 0);
        if (!dealMeta?.id) {
          return { error: 'Нет данных по сделке.' };
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
        }));
        return { ok: true };
      },
      drawCredit: (amount = 1200) =>
        set((state) => {
          const available = Math.max(0, state.creditLimit - state.debt);
          const draw = Math.min(roundMoney(amount), available);
          if (draw <= 0) return {};
          return {
            cash: roundMoney(state.cash + draw),
            debt: roundMoney(state.debt + draw),
            creditBucket: roundMoney((state.creditBucket || 0) + draw),
          };
        }),
      serviceDebt: (amount = 600) =>
        set((state) => {
          if (state.debt <= 0 || state.cash <= 0) return {};
          const payment = Math.min(roundMoney(amount), state.cash, state.debt);
          if (payment <= 0) return {};
          const fee = Math.min(state.cash - payment, Math.round(payment * 0.08));
          return {
            cash: roundMoney(state.cash - payment - fee),
            debt: roundMoney(state.debt - payment),
          };
        }),
      applyHomeAction: (actionId, options = {}) =>
        set((state) => {
          const currentSeed = state.rngSeed || ensureStoredSeed();
          const { patch, message, nextSeed } = handleHomeAction(actionId, state, currentSeed);
          const updates = {
            ...patch,
            rngSeed: nextSeed ?? currentSeed,
          };
          const success = Object.keys(patch || {}).length > 0;
          if (success) {
            const actionMeta =
              (state.availableActions || []).find((action) => action.id === actionId) ||
              HOME_ACTIONS.find((action) => action.id === actionId);
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
          if (!state.profession) return {};
          const base = buildProfessionState(state, state.profession);
          const roll = rollMonthlyActions(state.rngSeed || ensureStoredSeed());
          return {
            ...state,
            ...base,
            availableActions: roll.actions,
            rngSeed: roll.seed,
            configs: state.configs,
            configsReady: state.configsReady,
          };
        }),
    }),
    {
      name: 'finstrategy-store',
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
        joblessMonths: state.joblessMonths,
        salaryCutMonths: state.salaryCutMonths,
        salaryCutAmount: state.salaryCutAmount,
        creditBucket: state.creditBucket,
        monthlyOfferUsed: state.monthlyOfferUsed,
      }),
    },
  ),
);

export const homeActions = HOME_ACTIONS;

export default useGameStore;
