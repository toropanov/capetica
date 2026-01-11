import { useMemo } from 'react';
import useGameStore, { homeActions } from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './Home.module.css';
import { spriteStyle } from '../utils/iconSprite';

function ActionCard({ action, onSelect, cash }) {
  const disabled = action.cost ? cash < action.cost : false;
  const buttonLabel = action.buttonText
    ? action.buttonText
    : action.cost
      ? `Оплатить $${action.cost}`
      : 'Активировать';
  return (
    <Card className={styles.actionCard}>
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

function LastTurn({ data, showReturns, summary }) {
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
    const avgReturn =
      showReturns && Object.keys(data.returns || {}).length
        ? Math.round(
            (Object.values(data.returns).reduce((acc, value) => acc + value, 0) /
              Object.keys(data.returns).length) *
              100,
          )
        : null;
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
        <div className={styles.lastRow}>
          <span>Доходность инвестиций</span>
          <strong className={avgReturn >= 0 ? styles.valuePositive : styles.valueNegative}>
            {avgReturn !== null ? `${avgReturn}%` : '—'}
          </strong>
        </div>
        <div className={styles.netRow}>
          <span>Итог месяца</span>
          <strong className={net >= 0 ? styles.valuePositive : styles.valueNegative}>
            {net >= 0 ? `+$${Math.abs(net).toLocaleString('en-US')}` : `-$${Math.abs(net).toLocaleString('en-US')}`}
          </strong>
        </div>
      </>
    );
  };
  return (
    <div className={styles.lastTurn}>
      <div className={styles.balanceBlock}>
        <div>
          <span>Баланс</span>
          <strong>{formatter(summary.netWorth)}</strong>
        </div>
        <div className={styles.balanceStats}>
          <div>
            <span>Наличные</span>
            <strong>{formatter(summary.cash)}</strong>
          </div>
          <div>
            <span>Пассивно</span>
            <strong>{passiveLabel}</strong>
          </div>
          <div>
            <span>Долг</span>
            <strong>{formatter(summary.debt)}</strong>
          </div>
        </div>
      </div>
      {renderBody()}
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
  const monthlyOffers = (availableActions || []).slice(0, 2);
  const summary = {
    netWorth,
    cash,
    passiveIncome: passiveIncomeVal,
    debt,
  };

  return (
    <div className={styles.screen}>
      <Card className={styles.card}>
        <LastTurn data={lastTurn} showReturns={hasInvestments} summary={summary} />
      </Card>
      {currentEvent && (
        <Card className={styles.eventCard}>
          <div className={styles.eventHeader}>
            <div className={styles.iconSprite} style={spriteStyle(currentEvent.icon || 'iconCoins')} />
            <div>
              <p className={styles.eventTitle}>{currentEvent.title}</p>
              <span>{currentEvent.message || currentEvent.description}</span>
            </div>
          </div>
        </Card>
      )}
      <section>
        <div className={styles.sectionHeader}>
          <span>Месячное предложение</span>
          <p>До двух действий, которые дают буст именно сейчас.</p>
        </div>
        <div className={styles.offerGrid}>
          {monthlyOffers.length ? (
            monthlyOffers.map((action) => (
              <ActionCard key={action.id} action={action} onSelect={applyHomeAction} cash={cash} />
            ))
          ) : (
            <Card className={styles.actionPlaceholder}>
              <p>Нет доступных предложений в этом месяце.</p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

export default Home;
