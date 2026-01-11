import { useMemo } from 'react';
import useGameStore, { homeActions } from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './Home.module.css';
import { spriteStyle } from '../utils/iconSprite';

const PASSIVE_MULTIPLIERS = {
  bonds: 0.0022,
  stocks: 0.0015,
  crypto: 0.003,
};

function ActionCard({ action, onSelect, cash, compact = false }) {
  const disabled = action.cost ? cash < action.cost : false;
  const buttonLabel = action.buttonText
    ? action.buttonText
    : action.cost
      ? `Оплатить $${action.cost}`
      : 'Активировать';
  return (
    <Card className={`${styles.actionCard} ${compact ? styles.compactCard : ''}`}>
      <div className={styles.iconSprite} style={spriteStyle(action.icon)} />
      <h3>{action.title}</h3>
      <p>{action.description}</p>
      <Button variant="primary" onClick={() => onSelect(action.id)} disabled={disabled}>
        {buttonLabel}
      </Button>
      {disabled && <span className={styles.hint}>Нужно ${action.cost}</span>}
    </Card>
  );
}

function LastTurn({ data, showReturns, summary, investmentDelta, passiveBreakdown = [] }) {
  const formatter = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  const passiveLabel = `${formatter(summary.passiveIncome)}/мес`;
  const renderBody = () => {
    if (!data) {
      return (
        <div className={styles.placeholder}>
          <p>Совершай действия и переходи к следующему месяцу, чтобы увидеть динамику.</p>
        </div>
      );
    }
    const recurring = data.recurringExpenses || 0;
    const debtInterest = data.debtInterest || 0;
    const totalIncome = Math.round(data.salary + data.passiveIncome);
    const totalExpenses = Math.round(data.livingCost + recurring + debtInterest);
    const net = Math.round(totalIncome - totalExpenses);
    return (
      <>
        <div className={styles.resultsLabel}>Результат хода</div>
        <div className={styles.lastRow}>
          <span>Доходы</span>
          <strong className={styles.valuePositive}>{formatter(totalIncome)}</strong>
        </div>
        <div className={styles.lastRow}>
          <span>Расходы</span>
          <strong className={styles.valueNegative}>{formatter(totalExpenses)}</strong>
        </div>
        <div className={styles.netRow}>
          <span>Итог месяца</span>
          <strong className={net >= 0 ? styles.valuePositive : styles.valueNegative}>
            {net >= 0 ? `+$${Math.abs(net).toLocaleString('en-US')}` : `-$${Math.abs(net).toLocaleString('en-US')}`}
          </strong>
        </div>
        {showReturns && (
          <div className={styles.investDeltaRow}>
            <span>Текущая доходность портфеля</span>
            <strong className={investmentDelta >= 0 ? styles.valuePositive : styles.valueNegative}>
              {Number.isFinite(investmentDelta)
                ? investmentDelta >= 0
                  ? `+$${Math.round(investmentDelta).toLocaleString('en-US')}`
                  : `-$${Math.abs(Math.round(investmentDelta)).toLocaleString('en-US')}`
                : '—'}
            </strong>
          </div>
        )}
      </>
    );
  };
  return (
    <div className={styles.lastTurn}>
      <div className={styles.balanceBlock}>
        <div className={styles.netStat}>
          <span>Баланс</span>
          <strong>{formatter(summary.netWorth)}</strong>
        </div>
        <div className={styles.balanceStats}>
          <div>
            <span>Наличные</span>
            <strong>{formatter(summary.cash)}</strong>
          </div>
          <div>
            <span>Долг</span>
            <strong>{formatter(summary.debt)}</strong>
          </div>
          <div>
            <span>Пассивный доход</span>
            <strong>{passiveLabel}</strong>
          </div>
          <div>
            <span>Фикс. расходы</span>
            <strong>{formatter(summary.recurringExpenses)}/мес</strong>
          </div>
        </div>
      </div>
      {passiveBreakdown.length > 0 && (
        <details className={styles.detailBlock}>
          <summary>
            <span>Пассивные доходы</span>
            <strong>{`+$${Math.round(summary.passiveIncome).toLocaleString('en-US')}/мес`}</strong>
          </summary>
          <ul>
            {passiveBreakdown.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <strong>{`+$${Math.round(item.amount).toLocaleString('en-US')}/мес`}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data && (
        <details className={styles.detailBlock}>
          <summary>
            <span>Расходы</span>
            <strong>
              {`-$${Math.round(data.livingCost + (data.recurringExpenses || 0) + (data.debtInterest || 0)).toLocaleString('en-US')}/мес`}
            </strong>
          </summary>
          <ul>
            {[{ label: 'Бытовые', amount: data.livingCost }, { label: 'Фиксированные', amount: data.recurringExpenses || 0 }, { label: 'Проценты по долгу', amount: data.debtInterest || 0 }]
              .filter((item) => item.amount > 0)
              .map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{`-$${Math.round(item.amount).toLocaleString('en-US')}`}</strong>
                </li>
              ))}
          </ul>
        </details>
      )}
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
  const availableActions = useGameStore((state) => state.availableActions || homeActions);
  const hasInvestments = useGameStore((state) => Object.keys(state.investments || {}).length > 0);
  const debt = useGameStore((state) => state.debt);
  const priceState = useGameStore((state) => state.priceState);
  const investments = useGameStore((state) => state.investments);
  const configs = useGameStore((state) => state.configs);
  const month = useGameStore((state) => state.month);
  const activeMonthlyOffers = useGameStore((state) => state.activeMonthlyOffers || []);
  const monthlyOfferUsed = useGameStore((state) => state.monthlyOfferUsed);
  const dealParticipations = useGameStore((state) => state.dealParticipations || []);
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
    const desiredCount = shuffled.length === 1 ? 1 : seed / 4294967296 < 0.5 ? 1 : 2;
    return shuffled.slice(0, Math.min(desiredCount, shuffled.length));
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
  const investmentDelta = totalHolding && totalCostBasis ? totalHolding - totalCostBasis : 0;
  const passiveIncomeEffective = passiveIncomeVal + dealIncomeVal;

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
  const showPortfolioDelta = Object.values(positions).some((pos) => (pos.currentValue || 0) > 0.01);
  const summary = {
    netWorth,
    cash,
    passiveIncome: passiveIncomeEffective,
    debt,
    recurringExpenses,
  };

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
        <LastTurn
          data={lastTurn}
          showReturns={showPortfolioDelta}
          summary={summary}
          investmentDelta={investmentDelta}
          passiveBreakdown={passiveBreakdown}
        />
      </Card>
      {monthlyOffers.length > 0 && (
        <section>
          <div className={styles.sectionHeader}>
            <span>Месячное предложение</span>
            <p>Появляются случайно, успей выбрать одно из доступных.</p>
          </div>
          <div className={styles.offerCarousel}>
            {monthlyOffers.map((action) => (
              <div key={action.id} className={styles.offerItem}>
                <ActionCard
                  action={action}
                  cash={cash}
                  compact
                  onSelect={(id) => applyHomeAction(id, { fromMonthly: true })}
                />
              </div>
            ))}
          </div>
        </section>
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
