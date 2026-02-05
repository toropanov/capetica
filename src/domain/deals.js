export const DEAL_TEMPLATES = [
  {
    id: 'venture',
    title: 'Венчурный пул ИИ‑стартапа',
    description: 'Минимальный взнос даёт слот в пуле вместе с лид‑инвестором.',
    icon: 'iconGrowth',
    entryCost: 2000,
    monthlyPayout: 200,
    durationMonths: 6,
    riskNote: 'Высокий — при провале потеряешь всю ставку.',
    features: ['Вход: $2 000 → берём 1 лот', 'Пассивно: +$200/мес. пока в пуле', 'Выход x3 через 6 мес.'],
    riskMeter: 5,
    liquidityMeter: 1,
    lockMonths: 6,
    effects: [
      { icon: '⚡', text: 'Риск потери взноса' },
      { icon: '📈', text: 'Потенциал x3 через 6 мес.' },
      { icon: '💰', text: '+$200/мес.' },
    ],
    window: { minTurns: 2, maxTurns: 3, slots: 1 },
  },
  {
    id: 'equity',
    title: 'Доля в частной клинике',
    description: 'Покупаете часть прибыли и получаете фиксированный buy-back.',
    icon: 'iconCard',
    entryCost: 2000,
    monthlyPayout: 180,
    durationMonths: 12,
    riskNote: 'Средний риск — возможна задержка выплат 1-2 месяца.',
    features: ['Вход: $2 000', 'Дивиденд: +$180/мес.', 'Выкуп по $4 400 через 12 мес.'],
    riskMeter: 3,
    liquidityMeter: 3,
    lockMonths: 12,
    effects: [
      { icon: '🧱', text: 'Фикс. выплаты по buy-back' },
      { icon: '💰', text: '+$180/мес.' },
      { icon: '⚡', text: 'Задержки возможны' },
    ],
    window: { minTurns: 2, maxTurns: 4, slots: 2 },
  },
  {
    id: 'real_estate',
    title: 'Дом у океана под 4,1%',
    description: 'Взнос резервирует смарт-дом с готовым арендным потоком.',
    icon: 'iconHardhat',
    entryCost: 2000,
    monthlyPayout: 250,
    durationMonths: 18,
    riskNote: 'Низкий — доход защищён контрактом, но деньги застрянут до выкупа.',
    features: ['Вход: $2 000', 'Кеш-флоу: +$250/мес.', 'Опция продажи застройщику'],
    riskMeter: 2,
    liquidityMeter: 1,
    lockMonths: 18,
    effects: [
      { icon: '💰', text: '+$250/мес.' },
      { icon: '🧱', text: 'Месячные расходы +$120 (содержание)' },
      { icon: '⚡', text: 'Долгая заморозка капитала' },
    ],
    window: { minTurns: 3, maxTurns: 5, slots: 2 },
  },
  {
    id: 'auto',
    title: 'Электрокар с дисконтом 18%',
    description: 'Берём предзаказ на машину с обратным выкупом.',
    icon: 'iconPiggy',
    entryCost: 2000,
    monthlyPayout: 120,
    durationMonths: 8,
    riskNote: 'Средний риск — возможен перенос выкупа на пару месяцев.',
    features: ['Вход: $2 000', 'Экономия: +$120/мес.', 'Возврат выкупа через 8 мес.'],
    riskMeter: 3,
    liquidityMeter: 4,
    lockMonths: 8,
    effects: [
      { icon: '💰', text: '+$120/мес.' },
      { icon: '📈', text: 'Выкуп с дисконтом' },
      { icon: '⚡', text: 'Возможен сдвиг срока' },
    ],
    window: { minTurns: 1, maxTurns: 2, slots: 1 },
  },
];

export const DEAL_WINDOW_RULES = DEAL_TEMPLATES.reduce((acc, deal) => {
  acc[deal.id] = {
    minTurns: deal.window?.minTurns ?? 2,
    maxTurns: deal.window?.maxTurns ?? deal.window?.minTurns ?? 2,
    slots: deal.window?.slots ?? 1,
  };
  return acc;
}, {});

export function getDealTemplateById(id) {
  return DEAL_TEMPLATES.find((deal) => deal.id === id);
}
