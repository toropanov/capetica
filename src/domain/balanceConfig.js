export const BALANCE_DEFAULTS = {
  defaultDifficulty: 'normal',
  difficultyPresets: {
    easy: { eventChance: 0.65 },
    normal: { eventChance: 0.38 },
    hard: { eventChance: 0.45 },
  },
  homeAction: {
    defaultCount: 4,
    defaultShowChance: 0.55,
  },
  creditLimit: {
    netWorthMultiplier: 0.25,
    salaryMultiplier: 1.0,
    capMultiplier: 4.0,
  },
  creditDrawMinBalance: 5,
  creditDrawLabel: 'Кредитная линия',
};

export const PASSIVE_MULTIPLIERS = {
  bonds: 0.0015,
  stocks: 0.006,
  crypto: 0.012,
};
