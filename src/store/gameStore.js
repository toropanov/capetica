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
    title: 'Сайд-проект',
    description: 'Выходные с ноутбуком +$350, но немного усталость.',
    effect: 'cash_up',
  },
  {
    id: 'debt_payment',
    title: 'Платёж по кредиту',
    description: 'Автоматически гасит до 30% долга.',
    effect: 'debt_down',
  },
  {
    id: 'skill_invest',
    title: 'Прокачка навыков',
    description: 'Инвестируй $450 → зарплата растёт.',
    effect: 'salary_up',
  },
  {
    id: 'wellness',
    title: 'День восстановления',
    description: 'Минус стресс: снижает расходы на $120 в этом месяце.',
    effect: 'cost_down',
  },
];

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
  const seededPrices = seedPriceState(instrumentList);
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
    lastTurn: null,
    recentLog: [],
  };
}

function clampHistory(arr = [], cap = 120) {
  if (arr.length <= cap) return arr;
  return arr.slice(arr.length - cap);
}

function handleHomeAction(actionId, state) {
  switch (actionId) {
    case 'side_hustle': {
      const gain = 350;
      const fatigue = 25;
      const lifestyleModifier = state.lifestyleModifier + fatigue;
      return {
        patch: {
          cash: state.cash + gain,
          lifestyleModifier,
          livingCost: state.baseLivingCost + lifestyleModifier,
        },
        message: `Сайд-проект +$${gain.toLocaleString('en-US')}`,
      };
    }
    case 'debt_payment': {
      if (state.debt <= 0 || state.cash <= 100) {
        return {
          patch: {},
          message: 'Долг уже закрыт.',
        };
      }
      const budget = state.cash * 0.3;
      const payment = Math.min(budget, state.debt);
      return {
        patch: {
          cash: state.cash - payment,
          debt: state.debt - payment,
        },
        message: `Платёж по долгу -$${payment.toFixed(0)}`,
      };
    }
    case 'skill_invest': {
      const cost = 450;
      if (state.cash < cost) {
        return {
          patch: {},
          message: 'Нужно больше наличных для прокачки.',
        };
      }
      return {
        patch: {
          cash: state.cash - cost,
          salaryBonus: state.salaryBonus + 120,
        },
        message: 'Навыки выросли: +$120 к зарплате.',
      };
    }
    case 'wellness': {
      const relief = 120;
      const nextModifier = Math.max(state.lifestyleModifier - relief, 0);
      return {
        patch: {
          lifestyleModifier: nextModifier,
          livingCost: state.baseLivingCost + nextModifier,
        },
        message: 'Перезагрузка: траты спокойнее.',
      };
    }
    default:
      return { patch: {}, message: '' };
  }
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
      investments: {},
      priceState: {},
      shockState: {},
      history: { netWorth: [], cashFlow: [], passiveIncome: [] },
      trackers: { win: {}, lose: {} },
      winCondition: null,
      loseCondition: null,
      creditLimit: 0,
      availableCredit: 0,
      lastTurn: null,
      recentLog: [],
      bootstrapFromConfigs: (bundle) =>
        set((state) => {
          const rngSeed = state.rngSeed ?? ensureStoredSeed();
          const priceState =
            Object.keys(state.priceState || {}).length > 0
              ? state.priceState
              : seedPriceState(bundle?.instruments?.instruments);
          return {
            configs: bundle,
            configsReady: true,
            rngSeed,
            priceState,
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
          return buildProfessionState(state, profession);
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
          return {
            ...buildProfessionState(state, profession),
            rngSeed: roll.seed,
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
          const holdingsValue = calculateHoldingsValue(
            state.investments,
            priceState,
          );
          const passiveIncome = calculatePassiveIncome(
            state.investments,
            priceState,
            instrumentMap,
          );
          const salary = (state.profession.salaryMonthly || 0) + state.salaryBonus;
          const livingCost = Math.max(
            0,
            (state.baseLivingCost || 0) + state.lifestyleModifier,
          );
          const monthlyRate =
            (state.configs.rules?.loans?.apr || 0) / 12;
          const debtInterest = state.debt * monthlyRate;
          const debt = state.debt + debtInterest;
          const cash = state.cash + salary + passiveIncome - livingCost;
          const netWorth = cash + holdingsValue - debt;
          const creditLimit = computeCreditLimit({
            profession: state.profession,
            netWorth,
            salary,
            rules: state.configs.rules,
          });
          const availableCredit = creditLimit - debt;
          const metrics = {
            passiveIncome,
            livingCost,
            netWorth,
            cash,
            availableCredit,
            monthlyCashFlow: salary + passiveIncome - livingCost,
            debtDelta: debtInterest,
            debt,
          };
          const goalState = evaluateGoals(
            { rules: state.configs.rules, trackers: state.trackers },
            metrics,
          );
          const netHistory = clampHistory([
            ...(state.history.netWorth || []),
            { month: state.month + 1, value: netWorth },
          ]);
          const cashFlowHistory = clampHistory([
            ...(state.history.cashFlow || []),
            { month: state.month + 1, value: metrics.monthlyCashFlow },
          ]);
          const passiveHistory = clampHistory([
            ...(state.history.passiveIncome || []),
            { month: state.month + 1, value: passiveIncome },
          ]);
          return {
            month: state.month + 1,
            cash,
            debt,
            priceState,
            rngSeed,
            shockState,
            livingCost,
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
            lastTurn: {
              salary,
              passiveIncome,
              livingCost,
              debtInterest,
              returns: simResult.returns,
            },
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
          };
          const newUnits = existing.units + units;
          const totalCost =
            existing.costBasis * existing.units + spend;
          nextInvestments[instrumentId] = {
            units: newUnits,
            costBasis: totalCost / newUnits,
          };
          return {
            investments: nextInvestments,
            cash: state.cash - (spend + fee),
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
          if (remainingUnits <= 0.0001) {
            delete nextInvestments[instrumentId];
          } else {
            nextInvestments[instrumentId] = {
              ...holding,
              units: remainingUnits,
            };
          }
          return {
            investments: nextInvestments,
            cash: state.cash + netProceeds,
          };
        }),
      applyHomeAction: (actionId) =>
        set((state) => {
          const { patch, message } = handleHomeAction(actionId, state);
          if (!message) {
            return { ...patch };
          }
          const logEntry = {
            id: `${actionId}-${Date.now()}`,
            text: message,
            month: state.month,
          };
          const recentLog = [logEntry, ...(state.recentLog || [])].slice(0, 5);
          return { ...patch, recentLog };
        }),
      resetGame: () =>
        set((state) => ({
          ...buildProfessionState(state, state.profession),
        })),
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
      }),
    },
  ),
);

export const homeActions = HOME_ACTIONS;

export default useGameStore;
