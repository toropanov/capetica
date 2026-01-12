import { useMemo } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './Home.module.css';
import { spriteStyle } from '../utils/iconSprite';
import teacherImg from '../assets/proffesions/teacher.png';
import devImg from '../assets/proffesions/dev.png';
import lawyerImg from '../assets/proffesions/low.png';
import doctorImg from '../assets/proffesions/doctor.png';
import fireImg from '../assets/proffesions/fire.png';
import managerImg from '../assets/proffesions/manager.png';

const PASSIVE_MULTIPLIERS = {
  bonds: 0.0022,
  stocks: 0.0015,
  crypto: 0.003,
};

const FORECAST_TURNS = 6;
const PROFESSION_IMAGES = {
  teacher: teacherImg,
  programmer: devImg,
  lawyer: lawyerImg,
  dentist: doctorImg,
  firefighter: fireImg,
  sales_manager: managerImg,
};

function formatUSD(value) {
  const rounded = Math.round(value || 0);
  const prefix = rounded < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(rounded).toLocaleString('en-US')}`;
}

function describeGoal(rule) {
  switch (rule.type) {
    case 'passive_income_cover_costs':
      return {
        title: 'Пассивный доход > фикс. расходов',
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
      list.push({ icon: '🧱', text: `Фикс. расходы -$${action.value || 0}` });
      break;
    case 'cost_down':
      list.push({ icon: '💰', text: `Бытовые траты -$${action.value || 0}` });
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
      {isMonthly && <span className={styles.monthlyBadge}>Месячное предложение</span>}
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
      <Button variant="primary" onClick={() => onSelect(action.id)} disabled={disabled}>
        {buttonLabel}
      </Button>
      {disabled && <span className={styles.hint}>Нужно ${action.cost}</span>}
    </Card>
  );
}

function LastTurn({ data, summary, passiveBreakdown = [] }) {
  const formatter = (value) => formatUSD(value);
  const net =
    data
      ? Math.round(
          data.salary +
            data.passiveIncome -
            data.livingCost -
            (data.recurringExpenses || 0) -
            (data.debtInterest || 0),
        )
      : Math.round(summary.passiveIncome - summary.recurringExpenses);
  const netForecast = summary.netWorth + net * FORECAST_TURNS;
  const cashForecast = summary.cash + net * 3;
  const passiveGap = summary.passiveIncome - summary.recurringExpenses;
  const creditLimit = Math.max(0, (summary.availableCredit || 0) + summary.debt);
  const incomeRows = useMemo(
    () => [{ id: 'salary-base', label: 'Зарплата', amount: summary.salary || 0 }, ...passiveBreakdown],
    [summary.salary, passiveBreakdown],
  );
  const totalMonthlyIncome = incomeRows.reduce((sum, item) => sum + (item.amount || 0), 0);
  const expenseRows = useMemo(() => {
    if (data) {
      return [
        { id: 'fixed', label: 'Бытовые', amount: data.recurringExpenses || 0 },
        { id: 'interest', label: 'Проценты по долгу', amount: data.debtInterest || 0 },
      ].filter((item) => (item.amount || 0) > 0);
    }
    if (summary.recurringExpenses) {
      return [{ id: 'fixed', label: 'Бытовые', amount: summary.recurringExpenses }];
    }
    return [];
  }, [data, summary.recurringExpenses]);
  const totalMonthlyExpenses = expenseRows.reduce((sum, item) => sum + (item.amount || 0), 0);
  const renderBody = () => {
    if (!data) {
      return (
        <div className={styles.placeholder}>
          <p>Совершай действия и переходи к следующему месяцу, чтобы увидеть динамику.</p>
        </div>
      );
    }
    return (
      <>
        <div className={styles.netRow}>
          <span>Итог месяца</span>
          <div className={styles.netBlock}>
            <strong className={net >= 0 ? styles.valuePositive : styles.valueNegative}>
              {net >= 0 ? `+$${Math.abs(net).toLocaleString('en-US')}` : `-$${Math.abs(net).toLocaleString('en-US')}`}
            </strong>
            <small>{`Прогноз через ${FORECAST_TURNS} ходов: ~${formatUSD(netForecast)}`}</small>
          </div>
        </div>
      </>
    );
  };
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
            <strong>{formatter(summary.cash)}</strong>
            <small>{`Прогноз 3 хода: ${formatUSD(cashForecast)}`}</small>
          </div>
          <div>
            <span>Кредитный лимит</span>
            <strong>{formatter(creditLimit)}</strong>
            <small>{`Доступно: ${formatter(Math.max(0, summary.availableCredit || 0))}`}</small>
          </div>
        </div>
      </div>
      <div className={`${styles.infoSection} ${styles.infoPositive}`}>
        <div className={styles.infoHeader}>
          <span>Месячные доходы</span>
          <strong>{`+$${Math.round(totalMonthlyIncome).toLocaleString('en-US')}`}</strong>
        </div>
        <p className={styles.infoHint}>
          {passiveGap >= 0
            ? 'Перекрывает фикс. расходы'
            : `Нужно ещё ${formatter(Math.abs(passiveGap))}/мес`}
        </p>
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
          <span>Месячные расходы</span>
          <strong>{`-$${Math.round(totalMonthlyExpenses).toLocaleString('en-US')}`}</strong>
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
              <span>Бытовые</span>
              <strong>-$0</strong>
            </div>
          )}
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

function Home() {
  const applyHomeAction = useGameStore((state) => state.applyHomeAction);
  const lastTurn = useGameStore((state) => state.lastTurn);
  const cash = useGameStore((state) => state.cash);
  const currentEvent = useGameStore((state) => state.currentEvent);
  const availableActions = useGameStore((state) => state.availableActions || []);
  const debt = useGameStore((state) => state.debt);
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
  const monthlyOffers = useMemo(() => {
    if (monthlyOfferUsed) return [];
    const pool = (availableActions || []).filter((action) => !activeOfferIds.has(action.id));
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
  }, [availableActions, activeOfferIds, month, monthlyOfferUsed]);
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
      const amount = value * (PASSIVE_MULTIPLIERS[info.type] || 0.001);
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
  const summary = {
    netWorth,
    cash,
    passiveIncome: passiveIncomeEffective,
    salary: currentSalary,
    debt,
    recurringExpenses,
    availableCredit,
  };
  const winRules = configs?.rules?.win || [];
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const difficulty = useGameStore((state) => state.difficulty || 'normal');
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

  return (
    <div className={styles.screen}>
      {currentEvent && (
        <Card
          className={`${styles.eventCard} ${
            currentEvent.type === 'positive'
              ? styles.eventPositive
              : currentEvent.type === 'negative'
                ? styles.eventNegative
                : ''
          }`}
        >
          <div className={styles.eventHeader}>
            <div className={styles.iconSprite} style={spriteStyle(currentEvent.icon || 'iconCoins')} />
            <div>
              <p className={styles.eventTitle}>{currentEvent.title}</p>
              <span>{currentEvent.message || currentEvent.description}</span>
            </div>
          </div>
        </Card>
      )}
      <Card className={styles.card}>
        <LastTurn data={lastTurn} summary={summary} passiveBreakdown={passiveBreakdown} />
        {salaryProgression && (
          <div className={styles.professionGrowth}>
            <div>
              <span>Профессия</span>
              <strong>{profession?.title}</strong>
            </div>
            <div>
              <span>Рост дохода</span>
              <strong>
                {`+${Math.round((salaryProgression.percent || 0) * 100)}% каждые ${pluralizeTurns(
                  salaryProgression.stepMonths || 1,
                )}`}
              </strong>
              <small>
                {`Следующее повышение через ${pluralizeTurns(
                  salaryProgression.monthsUntilStep || salaryProgression.stepMonths || 1,
                )} · Потолок ${formatUSD(salaryProgression.cap || profession?.salaryMonthly || 0)}`}
              </small>
            </div>
          </div>
        )}
      </Card>
      {goalRows.length > 0 && (
        <Card className={styles.goalCard}>
          <div className={styles.goalHeader}>
            <span>Прогресс партии</span>
            <small>Сложность: {difficultyLabels[difficulty] || difficulty}</small>
          </div>
          <ul className={styles.goalList}>
            {goalRows.map((goal) => (
              <li key={goal.id} className={goal.active ? styles.goalItemActive : ''}>
                <div>
                  <strong>{goal.title}</strong>
                  {goal.detail && <span>{goal.detail}</span>}
                </div>
                <div className={styles.goalMeter}>
                  <div>
                    <div style={{ width: `${Math.round((goal.progress / goal.target) * 100)}%` }} />
                  </div>
                  <small>
                    {goal.progress}/{goal.target}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
          <div className={styles.activeOffersHeader}>Активные предложения</div>
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
  );
}

export default Home;
