export const DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Лёгкий', description: 'Реже негативные события.' },
  { id: 'normal', label: 'Стандарт', description: 'Баланс риска и наград.' },
  { id: 'hard', label: 'Сложный', description: 'Больше стрессов и испытаний.' },
];

export function summarizeGoal(rule) {
  if (!rule) {
    return { title: rule?.id || '', detail: '' };
  }
  if (rule.type === 'passive_income_cover_costs') {
    return {
      title: 'Пассивный > расходов',
      detail: `Удержать ${rule.requiredStreakMonths || 1} ходов`,
    };
  }
  if (rule.type === 'net_worth_reach') {
    const target = `$${(rule.target || 0).toLocaleString('en-US')}`;
    return {
      title: `Чистый капитал ${target}`,
      detail: `Финализируй ${rule.requiredStreakMonths || 1} ходов`,
    };
  }
  return { title: rule.id, detail: '' };
}
