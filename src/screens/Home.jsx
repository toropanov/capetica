import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import {
  calculateHoldingsValue,
  calculatePassiveIncome,
  getPassiveMultiplier,
  estimateMonthlyDebtInterest,
  sumExpenseBreakdown,
} from '../domain/finance';
import styles from './Home.module.css';
import { spriteStyle } from '../utils/iconSprite';
import teacherImg from '../assets/proffesions/teacher.png';
import devImg from '../assets/proffesions/dev.png';
import lawyerImg from '../assets/proffesions/low.png';
import doctorImg from '../assets/proffesions/doctor.png';
import fireImg from '../assets/proffesions/fire.png';
import managerImg from '../assets/proffesions/manager.png';

const FORECAST_TURNS = 6;
const PROFESSION_IMAGES = {
  teacher: teacherImg,
  programmer: devImg,
  lawyer: lawyerImg,
  dentist: doctorImg,
  firefighter: fireImg,
  sales_manager: managerImg,
};

const METRIC_SUFFIXES = {
  cash: '',
  incomes: '/мес',
  expenses: '/мес',
  passiveIncome: '/мес',
};
const EXPENSE_LABELS = {
  education: 'Образование',
  food: 'Питание',
  entertainment: 'Развлечения',
  housing: 'Жилье',
  health: 'Здоровье',
  insurance: 'Страховка',
};
const EXPENSE_KEYS = ['education', 'food', 'entertainment', 'housing', 'health', 'insurance'];

function formatUSD(value) {
  const rounded = Math.round(value || 0);
  const prefix = rounded < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(rounded).toLocaleString('en-US')}`;
}

function describeGoal(rule) {
  switch (rule.type) {
    case 'passive_income_cover_costs':
      return {
        title: 'Пассивный доход > месячных расходов',
        detail: `Держи ${rule.requiredStreakMonths || 1} мес. подряд`,
        mode: 'Выживание',
      };
    case 'net_worth_reach': {
      const target = formatUSD(rule.target || 0);
      const mode = (rule.target || 0) >= 500000 ? 'Империя' : 'Рост';
      return {
        title: `Чистый капитал > ${target}`,
        detail: 'Догони план и удержи несколько месяцев',
        mode,
      };
    }
    default:
      return { title: rule.id, detail: '', mode: 'Рост' };
  }
}

function goalConditionMet(rule, metrics) {
  switch (rule.type) {
    case 'passive_income_cover_costs':
      return metrics.passiveIncome >= metrics.recurringExpenses;
    case 'net_worth_reach':
      return metrics.netWorth >= (rule.target || 0);
    default:
      return false;
  }
}

function pluralizeTurns(value) {
  const number = Math.max(0, Math.round(value));
  const abs = Math.abs(number) % 100;
  const last = abs % 10;
  let suffix = 'ходов';
  if (abs > 10 && abs < 20) {
    suffix = 'ходов';
  } else if (last === 1) {
    suffix = 'ход';
  } else if (last >= 2 && last <= 4) {
    suffix = 'хода';
  }
  return `${number} ${suffix}`;
}

function describeActionConsequences(action) {
  const list = [];
  if (action.id === 'debt_payment') {
    list.push({ icon: '⚡', text: 'Снижает обязательства' });
  }
  switch (action.effect) {
    case 'salary_up':
      list.push({ icon: '📈', text: `Доход +$${action.value || 0}/мес.` });
      break;
    case 'expense_down':
      list.push({ icon: '🧱', text: `Месячные расходы -$${action.value || 0}` });
      break;
    case 'cost_down':
      list.push({ icon: '💰', text: `Месячные расходы -$${action.value || 0}` });
      break;
    case 'protection':
      list.push({ icon: '⚡', text: 'Добавляет защиту' });
      break;
    case 'take_credit':
      list.push({ icon: '💰', text: `Свободный кэш +$${action.value || 0}` });
      list.push({ icon: '⚡', text: 'Обязательства растут' });
      break;
    default:
      break;
  }
  if (action.type === 'chance') {
    list.push({ icon: '⚡', text: 'Шанс провала сделки' });
    if (action.success?.cashDelta) {
      list.push({ icon: '📈', text: `Удача: +$${Math.round(action.success.cashDelta)}` });
    }
    if (action.fail?.cashDelta) {
      list.push({ icon: '⚡', text: `Провал: -$${Math.abs(Math.round(action.fail.cashDelta))}` });
    }
  }
  if (!list.length && action.description) {
    list.push({ icon: '💡', text: action.description });
  }
  return list;
}

function ActionCard({ action, onSelect, cash, compact = false, variant = 'default', hideIcon = false }) {
  const isMonthly = variant === 'monthly';
  const disabled = action.cost ? cash < action.cost : false;
  const buttonLabel = action.buttonText
    ? action.buttonText
    : action.cost
      ? `Оплатить $${action.cost}`
      : 'Активировать';
  const consequences = describeActionConsequences(action);
  return (
    <Card
      className={`${styles.actionCard} ${compact ? styles.compactCard : ''} ${isMonthly ? styles.monthlyActionCard : ''}`}
      glow={!isMonthly}
      flat={isMonthly}
    >
      {!hideIcon && <div className={styles.iconSprite} style={spriteStyle(action.icon)} />}
      <h3>{action.title}</h3>
      <p>{action.description}</p>
      {consequences.length > 0 && (
        <div className={styles.actionConsequences}>
          {consequences.map((item) => (
            <span key={`${action.id}-${item.text}`}>
              <em>{item.icon}</em>
              {item.text}
            </span>
          ))}
        </div>
      )}
      <Button
        variant="primary"
        onClick={() => onSelect(action.id)}
        disabled={disabled}
        className={isMonthly ? styles.monthlyButton : ''}
      >
        {buttonLabel}
      </Button>
      {disabled && <span className={styles.hint}>Нужно ${action.cost}</span>}
    </Card>
  );
}

function LastTurn({ data, summary, passiveBreakdown = [], expenseBreakdown = [], metricPulse }) {
  const formatter = (value) => formatUSD(value);
  const metricValues = metricPulse?.current || null;
  const metricAnimation = metricPulse?.animation || null;
  const getMetricValue = (key, fallback) => {
    if (metricValues && typeof metricValues[key] === 'number') {
      return metricValues[key];
    }
    return fallback;
  };
  const formatMonthlyValue = (value, suffix = '', forceNegative = false) => {
    const rounded = Math.round(value || 0);
    const effective = forceNegative ? -Math.abs(rounded) : rounded;
    const sign = effective >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(Math.round(effective)).toLocaleString('en-US')}${suffix}`;
  };
  const formatPulseDelta = (value, suffix = '') => {
    const rounded = Math.round(Math.abs(value) || 0);
    if (!rounded) return null;
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${rounded.toLocaleString('en-US')}${suffix}`;
  };
  const getMetricDelta = (key) => {
    if (!metricAnimation || !metricValues) return null;
    const target = metricAnimation.next?.[key];
    const baseline = metricAnimation.prev?.[key];
    if (typeof target !== 'number' || typeof baseline !== 'number') {
      return null;
    }
    if (Math.round(target) === Math.round(baseline)) {
      return null;
    }
    const currentValue = typeof metricValues[key] === 'number' ? metricValues[key] : target;
    const remaining = target - currentValue;
    if (Math.abs(Math.round(remaining)) === 0) {
      return null;
    }
    const label = formatPulseDelta(remaining, METRIC_SUFFIXES[key] || '');
    if (!label) return null;
    return { value: remaining, label };
  };
  const incomeRows = useMemo(
    () => [{ id: 'salary-base', label: 'Зарплата', amount: summary.salary || 0 }, ...passiveBreakdown],
    [summary.salary, passiveBreakdown],
  );
  const totalMonthlyIncome = incomeRows.reduce((sum, item) => sum + (item.amount || 0), 0);
  const expenseRows = useMemo(() => {
    const rows = [];
    const fixedAmount =
      typeof data?.recurringExpenses === 'number' ? data.recurringExpenses : summary.recurringExpenses || 0;
    if (expenseBreakdown.length > 0) {
      rows.push(...expenseBreakdown);
    } else if (fixedAmount > 0) {
      rows.push({ id: 'fixed', label: 'Месячные расходы', amount: fixedAmount });
    }
    const interestAmount =
      typeof data?.debtInterest === 'number' ? data.debtInterest : summary.debtInterest || 0;
    if (summary.debt > 0 || interestAmount > 0) {
      rows.push({ id: 'interest', label: 'Проценты по долгу', amount: interestAmount });
    }
    return rows;
  }, [data, expenseBreakdown, summary.recurringExpenses, summary.debtInterest, summary.debt]);
  const totalMonthlyExpenses = expenseRows.reduce((sum, item) => sum + (item.amount || 0), 0);
  const net = Math.round(totalMonthlyIncome - totalMonthlyExpenses);
  const netForecast = summary.netWorth + net * FORECAST_TURNS;
  const cashForecast = summary.cash + net * 3;
  const passiveGap =
    summary.passiveIncome - summary.recurringExpenses - summary.debtInterest;
  const creditLimit = Math.max(0, (summary.availableCredit || 0) + summary.debt);
  const cashValue = getMetricValue('cash', summary.cash);
  const incomesValue = getMetricValue('incomes', totalMonthlyIncome);
  const expensesValue = getMetricValue('expenses', totalMonthlyExpenses);
  const cashDelta = getMetricDelta('cash');
  const renderDelta = (delta) => {
    if (!delta) return null;
    return (
      <em
        className={`${styles.metricPulseDelta} ${
          delta.value >= 0 ? styles.metricPulsePositive : styles.metricPulseNegative
        }`}
      >
        {delta.label}
      </em>
    );
  };
  const renderBody = () => (
    <div className={styles.netRow}>
      <span>Итог месяца</span>
      <div className={styles.netBlock}>
        <strong className={net >= 0 ? styles.valuePositive : styles.valueNegative}>
          {net >= 0 ? `+$${Math.abs(net).toLocaleString('en-US')}` : `-$${Math.abs(net).toLocaleString('en-US')}`}
        </strong>
      </div>
    </div>
  );
  return (
    <div className={styles.lastTurn}>
      <div className={styles.balanceBlock}>
      <div className={styles.balanceStats}>
        <div>
          <span>Чистый капитал</span>
          <strong>{formatter(summary.netWorth)}</strong>
          <small>{`Прогноз ${FORECAST_TURNS} ходов: ~${formatUSD(netForecast)}`}</small>
        </div>
        <div>
          <span>Наличные</span>
          <div className={styles.metricPulseValue}>
            <strong>{formatter(cashValue)}</strong>
            {renderDelta(cashDelta)}
          </div>
          <small>{`Прогноз 3 хода: ${formatUSD(cashForecast)}`}</small>
        </div>
        <div>
          <span>Кредитный лимит</span>
          <strong>{formatter(creditLimit)}</strong>
          </div>
        </div>
      </div>
      <div className={styles.analyticsGrid}>
        <div className={`${styles.infoSection} ${styles.infoPositive}`}>
          <div className={styles.infoHeader}>
            <div className={styles.infoHeaderLeft}>
              <span>Месячные доходы</span>
            </div>
            <div className={styles.metricPulseValue}>
              <strong>{formatMonthlyValue(incomesValue)}</strong>
            </div>
          </div>
          <div className={styles.infoList}>
            {incomeRows.map((item) => {
              const amount = Math.round(item.amount || 0);
              const sign = amount >= 0 ? '+' : '-';
              return (
                <div key={item.id}>
                  <span>{item.label}</span>
                  <strong>{`${sign}$${Math.abs(amount).toLocaleString('en-US')}`}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div className={`${styles.infoSection} ${styles.infoNeutral}`}>
          <div className={styles.infoHeader}>
            <div className={styles.infoHeaderLeft}>
              <span>Месячные расходы</span>
            </div>
            <div className={styles.metricPulseValue}>
              <strong>{formatMonthlyValue(expensesValue, '', true)}</strong>
            </div>
          </div>
          <div className={styles.infoList}>
            {expenseRows.length > 0 ? (
              expenseRows.map((item) => (
                <div key={item.id}>
                  <span>{item.label}</span>
                  <strong>{`-$${Math.round(item.amount).toLocaleString('en-US')}`}</strong>
                </div>
              ))
            ) : (
              <div>
                <span>Месячные расходы</span>
                <strong>-$0</strong>
              </div>
            )}
          </div>
        </div>
      </div>
      {renderBody()}
      {data?.stopLossWarnings?.length ? (
        <div className={styles.stopLossBlock}>
          <span>Авто-стоп-лосс</span>
          <ul>
            {data.stopLossWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatDelta(value) {
  const rounded = Math.round(Math.abs(value) || 0).toLocaleString('en-US');
  return `${value >= 0 ? '+' : '-'}$${rounded}`;
}

function TurnHighlightOverlay({ data, active, onDismiss }) {
  if (!data) return null;
  const monthLabel = typeof data.month === 'number' ? data.month + 1 : '';
  return (
    <div className={`${styles.turnHighlight} ${active ? styles.turnHighlightVisible : styles.turnHighlightHidden}`}>
      <div className={styles.turnHighlightHead}>
        <div>
          <span>Изменения после хода</span>
          {monthLabel ? <strong>Ход #{monthLabel}</strong> : null}
        </div>
        <button type="button" onClick={onDismiss} className={styles.turnHighlightClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <div className={styles.turnHighlightMetrics}>
        {data.metrics?.map((metric) => (
          <div key={metric.key} className={styles.turnHighlightMetric}>
            <span>{metric.label}</span>
            <strong>{formatUSD(metric.next)}</strong>
            {metric.delta !== 0 && (
              <em className={metric.delta >= 0 ? styles.turnHighlightDeltaPositive : styles.turnHighlightDeltaNegative}>
                {formatDelta(metric.delta)}
              </em>
            )}
          </div>
        ))}
      </div>
      {data.acquisitions?.length ? (
        <div className={styles.turnHighlightGroup}>
          <span>Новые активы</span>
          <div className={styles.turnHighlightBadges}>
            {data.acquisitions.map((asset) => (
              <span key={asset.id}>
                {asset.title}
                {asset.passiveGain ? (
                  <small>{`≈ +${formatUSD(asset.passiveGain)}/мес`}</small>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {data.deals?.length ? (
        <div className={styles.turnHighlightGroup}>
          <span>Контракты</span>
          <div className={styles.turnHighlightBadges}>
            {data.deals.map((deal) => (
              <span key={deal.id}>
                {deal.title}
                {deal.payout ? <small>{`${formatUSD(deal.payout)}/мес`}</small> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.turnHighlightFooter}>
        <Button variant="secondary" onClick={onDismiss} className={styles.turnHighlightButton}>
          Отлично
        </Button>
      </div>
    </div>
  );
}

function Home() {
  const outletContext = useOutletContext();
  const metricPulse = outletContext?.metricPulse || null;
  const applyHomeAction = useGameStore((state) => state.applyHomeAction);
  const lastTurn = useGameStore((state) => state.lastTurn);
  const cash = useGameStore((state) => state.cash);
  const availableActions = useGameStore((state) => state.availableActions || []);
  const debt = useGameStore((state) => state.debt);
  const livingCost = useGameStore((state) => state.livingCost || 0);
  const priceState = useGameStore((state) => state.priceState);
  const investments = useGameStore((state) => state.investments);
  const configs = useGameStore((state) => state.configs);
  const month = useGameStore((state) => state.month);
  const activeMonthlyOffers = useGameStore((state) => state.activeMonthlyOffers || []);
  const monthlyOfferUsed = useGameStore((state) => state.monthlyOfferUsed);
  const dealParticipations = useGameStore((state) => state.dealParticipations || []);
  const availableCredit = useGameStore((state) => state.availableCredit || 0);
  const trackers = useGameStore((state) => state.trackers || { win: {}, lose: {} });
  const salaryProgression = useGameStore((state) => state.salaryProgression);
  const salaryBonus = useGameStore((state) => state.salaryBonus || 0);
  const joblessMonths = useGameStore((state) => state.joblessMonths || 0);
  const salaryCutMonths = useGameStore((state) => state.salaryCutMonths || 0);
  const salaryCutAmount = useGameStore((state) => state.salaryCutAmount || 0);
  const profession = useGameStore((state) => state.profession);
  const turnHighlight = useGameStore((state) => state.turnHighlight);
  const turnHighlightArmed = useGameStore((state) => state.turnHighlightArmed);
  const acknowledgeTurnHighlight = useGameStore((state) => state.acknowledgeTurnHighlight);
  const [highlightData, setHighlightData] = useState(null);
  const [highlightActive, setHighlightActive] = useState(false);
  const highlightTimerRef = useRef(null);
  const instrumentMap = useMemo(() => {
    const list = configs?.instruments?.instruments || [];
    return list.reduce((acc, instrument) => {
      acc[instrument.id] = instrument;
      return acc;
    }, {});
  }, [configs]);
  const holdingsValue = useMemo(
    () => calculateHoldingsValue(investments, priceState),
    [investments, priceState],
  );
  const passiveIncomeVal = useMemo(
    () => calculatePassiveIncome(investments, priceState, instrumentMap),
    [investments, priceState, instrumentMap],
  );
  const netWorth = useMemo(() => cash + holdingsValue - debt, [cash, holdingsValue, debt]);
  const activeOfferIds = useMemo(
    () =>
      new Set(
        (activeMonthlyOffers || [])
          .filter((offer) => offer.expiresMonth > month)
          .map((offer) => offer.id),
      ),
    [activeMonthlyOffers, month],
  );

  const getNextSeed = (seed) => (seed * 1664525 + 1013904223) % 4294967296;
  const insuranceActions = useMemo(
    () => (availableActions || []).filter((action) => action.effect === 'protection'),
    [availableActions],
  );
  const insuranceActionIds = useMemo(
    () => new Set(insuranceActions.map((action) => action.id)),
    [insuranceActions],
  );
  const monthlyOffers = useMemo(() => {
    if (monthlyOfferUsed) return [];
    const pool = insuranceActions.filter((action) => !activeOfferIds.has(action.id));
    if (!pool.length) return [];
    let seed = (month + 1) * 9301 + 17;
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      seed = getNextSeed(seed);
      const j = Math.floor((seed / 4294967296) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    seed = getNextSeed(seed);
    const showChance = seed / 4294967296;
    if (showChance < 0.25) {
      return [];
    }
    return shuffled.slice(0, 1);
  }, [insuranceActions, activeOfferIds, month, monthlyOfferUsed]);
  const visibleActiveOffers = (activeMonthlyOffers || []).filter((offer) => offer.expiresMonth > month);
  const dealIncomeVal = useMemo(
    () =>
      (dealParticipations || []).reduce((sum, deal) => {
        if (deal.completed) return sum;
        return sum + (deal.monthlyPayout || 0);
      }, 0),
    [dealParticipations],
  );

  const positions = useMemo(() => {
    const entries = {};
    Object.entries(investments || {}).forEach(([instrumentId, holding]) => {
      const price = priceState[instrumentId]?.price || instrumentMap[instrumentId]?.initialPrice || 0;
      const units = holding?.units || 0;
      entries[instrumentId] = {
        currentValue: units * price,
        costBasis: (holding?.costBasis || 0) * units,
      };
    });
    return entries;
  }, [investments, priceState, instrumentMap]);

  const totalHolding = Object.values(positions).reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
  const totalCostBasis = Object.values(positions).reduce((sum, pos) => sum + (pos.costBasis || 0), 0);
  const passiveIncomeEffective = passiveIncomeVal + dealIncomeVal;
  const salaryBase = (salaryProgression?.currentBase ?? profession?.salaryMonthly) || 0;
  const salaryCutActive = salaryCutMonths > 0 ? salaryCutAmount : 0;
  const currentSalary =
    joblessMonths > 0 ? 0 : Math.max(0, Math.round(salaryBase + salaryBonus - salaryCutActive));

  const passiveBreakdown = useMemo(() => {
    const rows = [];
    Object.entries(investments || {}).forEach(([instrumentId, holding]) => {
      const info = instrumentMap[instrumentId];
      if (!info) return;
      const price = priceState[instrumentId]?.price || info.initialPrice || 0;
      const units = holding?.units || 0;
      const value = units * price;
      const amount = value * getPassiveMultiplier(info.type);
      if (amount > 0.01) {
        rows.push({ id: `inv-${instrumentId}`, label: info.title, amount });
      }
    });
    (dealParticipations || [])
      .filter((deal) => !deal.completed && deal.monthlyPayout > 0)
      .forEach((deal) => {
        rows.push({ id: deal.participationId, label: `Сделка: ${deal.title}`, amount: deal.monthlyPayout });
      });
    const total = rows.reduce((sum, item) => sum + item.amount, 0);
    const diff = passiveIncomeEffective - total;
    if (Math.abs(diff) > 0.5) {
      rows.push({ id: 'other', label: 'Прочее', amount: diff });
    }
    return rows;
  }, [investments, priceState, instrumentMap, dealParticipations, passiveIncomeEffective]);

  const recurringExpenses = useGameStore((state) => state.recurringExpenses || 0);
  const expenseBreakdown = useMemo(() => {
    const raw = profession?.monthlyExpenseBreakdown || {};
    const baseTotal = sumExpenseBreakdown(raw);
    const ratio = baseTotal > 0 && recurringExpenses > 0 ? recurringExpenses / baseTotal : 0;
    const rows = EXPENSE_KEYS.map((key) => ({
      id: key,
      label: EXPENSE_LABELS[key] || key,
      amount: Math.round((Number(raw[key]) || 0) * ratio),
    }));
    const total = rows.reduce((sum, item) => sum + (item.amount || 0), 0);
    const diff = Math.round((recurringExpenses || 0) - total);
    if (rows.length && diff !== 0 && baseTotal > 0) {
      rows[rows.length - 1] = {
        ...rows[rows.length - 1],
        amount: rows[rows.length - 1].amount + diff,
      };
    }
    return rows;
  }, [profession, recurringExpenses]);
  const debtInterestEstimate = useMemo(
    () =>
      estimateMonthlyDebtInterest({
        debt,
        apr: configs?.rules?.loans?.apr || 0,
        lastTurnInterest: lastTurn?.debtInterest,
        preferLastTurn: false,
      }),
    [configs, debt, lastTurn],
  );
  const summary = {
    netWorth,
    cash,
    passiveIncome: passiveIncomeEffective,
    salary: currentSalary,
    debt,
    recurringExpenses,
    availableCredit,
    debtInterest: debtInterestEstimate,
    livingCost,
  };
  const winRules = configs?.rules?.win || [];
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const difficulty = useGameStore((state) => state.difficulty || 'normal');
  const hideGoalCard = useGameStore((state) => state.suppressGoalCard);
  const difficultyLabels = {
    easy: 'Лёгкий',
    normal: 'Стандарт',
    hard: 'Сложный',
  };
  const goalMetrics = useMemo(
    () => ({
      passiveIncome: passiveIncomeEffective,
      recurringExpenses,
      netWorth,
    }),
    [passiveIncomeEffective, recurringExpenses, netWorth],
  );
  const filteredGoals = useMemo(
    () => {
      if (selectedGoalId) {
        return winRules.filter((rule) => rule.id === selectedGoalId);
      }
      return winRules;
    },
    [winRules, selectedGoalId],
  );

  const goalRows = useMemo(
    () =>
      filteredGoals.map((rule) => {
        const descriptor = describeGoal(rule);
        const target = Math.max(1, rule.requiredStreakMonths || 1);
        const progress = Math.min(target, trackers?.win?.[rule.id] || 0);
        return {
          id: rule.id,
          ...descriptor,
          target,
          progress,
          active: goalConditionMet(rule, goalMetrics),
        };
      }),
    [filteredGoals, trackers, goalMetrics],
  );
  const primaryGoalProgress = useMemo(() => {
    if (!goalRows.length) return null;
    const primary = goalRows[0];
    const percent = Math.min(100, Math.round((primary.progress / primary.target) * 100));
    const status = primary.active ? 'Готово!' : null;
    return {
      title: primary.title,
      detail: primary.detail,
      progress: primary.progress,
      target: primary.target,
      percent,
      status,
    };
  }, [goalRows]);

  useEffect(() => {
    if (turnHighlight && turnHighlightArmed) {
      setHighlightData(turnHighlight);
      setHighlightActive(true);
    }
  }, [turnHighlight, turnHighlightArmed]);

  useEffect(() => () => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  const dismissHighlight = useCallback(() => {
    setHighlightActive(false);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightData(null);
      acknowledgeTurnHighlight();
      highlightTimerRef.current = null;
    }, 260);
  }, [acknowledgeTurnHighlight]);

  useEffect(() => {
    if (!highlightData || !highlightActive) return undefined;
    const timer = setTimeout(() => dismissHighlight(), 6500);
    return () => clearTimeout(timer);
  }, [highlightData, highlightActive, dismissHighlight]);

  return (
    <div className={styles.screen}>
      {highlightData && (
        <TurnHighlightOverlay data={highlightData} active={highlightActive} onDismiss={dismissHighlight} />
      )}
      <Card className={styles.card}>
        <LastTurn
          data={lastTurn}
          summary={summary}
          passiveBreakdown={passiveBreakdown}
          expenseBreakdown={expenseBreakdown}
          metricPulse={metricPulse}
        />
      {salaryProgression && (
          <div className={styles.professionGrowth}>
            <span className={styles.professionGrowthLabel}>Рост дохода</span>
            <strong className={styles.professionGrowthValue}>
              {`+${Math.round((salaryProgression.percent || 0) * 100)}% каждые ${pluralizeTurns(
                salaryProgression.stepMonths || 1,
              )}`}
            </strong>
            <small className={styles.professionGrowthHint}>
              {`Потолок ${formatUSD(salaryProgression.cap || profession?.salaryMonthly || 0)}`}
            </small>
          </div>
        )}
      </Card>
      {primaryGoalProgress ? (
        <div className={styles.goalProgressBlock}>
          {primaryGoalProgress.status ? (
            <div className={styles.goalProgressHead}>
              <em>{primaryGoalProgress.status}</em>
            </div>
          ) : null}
          <strong className={styles.goalProgressTitle}>{primaryGoalProgress.title}</strong>
          {primaryGoalProgress.detail ? (
            <p className={styles.goalProgressDetail}>{primaryGoalProgress.detail}</p>
          ) : null}
          <div className={styles.goalProgressMeter}>
            <div>
              <div style={{ width: `${primaryGoalProgress.percent}%` }} />
            </div>
            <small>
              {primaryGoalProgress.progress}/{primaryGoalProgress.target} ходов
            </small>
          </div>
        </div>
      ) : null}
      {(monthlyOffers[0] || visibleActiveOffers.length > 0) && (
        <div className={styles.monthlySection}>
          {monthlyOffers[0] && (
            <div className={styles.monthlyOffer}>
              <ActionCard
                action={monthlyOffers[0]}
                cash={cash}
                compact
                variant="monthly"
                onSelect={(id) => applyHomeAction(id, { fromMonthly: true })}
                hideIcon
              />
            </div>
          )}
          {visibleActiveOffers.length > 0 && (
            <div className={styles.activeOffers}>
              <div className={styles.activeOfferList}>
                {visibleActiveOffers.map((offer) => (
                  <span key={offer.id}>
                    {offer.title}
                    <small>ещё {Math.max(0, offer.expiresMonth - month)} мес.</small>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
