import { useMemo, useState, useEffect } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import Slider from '../components/Slider';
import SparkLine from '../components/SparkLine';
import styles from './Investments.module.css';
import { spriteStyle, getTypeIcon } from '../utils/iconSprite';

const LOT_STEP = 100;

const clampAmount = (value, max) => {
  if (max < LOT_STEP) return 0;
  const safeMax = Math.floor(max / LOT_STEP) * LOT_STEP;
  if (safeMax < LOT_STEP) return 0;
  const next = Number.isFinite(value) ? value : LOT_STEP;
  const clamped = Math.min(Math.max(next, LOT_STEP), safeMax);
  return Math.round(clamped / LOT_STEP) * LOT_STEP;
};

function InstrumentCard({ instrument, priceInfo, holding, cash, onBuy, onSell }) {
  const rawPrice = priceInfo?.price || instrument.initialPrice;
  const changePct = Math.round((priceInfo?.lastReturn || 0) * 100);
  const price = Math.round(rawPrice);
  const holdingUnits = holding?.units || 0;
  const holdingValue = Math.round(holdingUnits * rawPrice);
  const iconKey = getTypeIcon(instrument.type);
  const buyMax = Math.floor(Math.max(0, cash) / LOT_STEP) * LOT_STEP;
  const sellMax = Math.floor(Math.max(0, holdingValue) / LOT_STEP) * LOT_STEP;
  const [buyAmount, setBuyAmount] = useState(LOT_STEP);
  const [sellAmount, setSellAmount] = useState(LOT_STEP);
  const [panelMode, setPanelMode] = useState(null);

  useEffect(() => {
    setBuyAmount((prev) => clampAmount(prev, buyMax));
  }, [buyMax]);

  useEffect(() => {
    setSellAmount((prev) => clampAmount(prev, sellMax));
  }, [sellMax]);

  const buyDisabled = buyMax < LOT_STEP;
  const hasPosition = sellMax >= LOT_STEP;
  const sellValue = Math.round(holdingUnits * rawPrice);
  const sellProfit = holding
    ? Math.round((rawPrice - (holding.costBasis || rawPrice)) * holdingUnits)
    : 0;
  const sellLabel = hasPosition
    ? `Продать $${sellValue.toLocaleString('en-US')} (${sellProfit >= 0 ? '+' : '-'}$${Math.abs(sellProfit).toLocaleString('en-US')})`
    : '';

  const lotsFromAmount = (amount) => Math.max(1, Math.round(amount / LOT_STEP));

  const togglePanel = (mode) => {
    if (mode === 'sell' && !hasPosition) return;
    setPanelMode((prev) => (prev === mode ? null : mode));
  };

  const renderPanel = () => {
    if (!panelMode) return null;
    const isBuy = panelMode === 'buy';
    if (!isBuy && !hasPosition) return null;
    const max = isBuy ? buyMax : sellMax;
    const amount = isBuy ? buyAmount : sellAmount;
    const setAmount = isBuy ? setBuyAmount : setSellAmount;
    const disabled = isBuy ? buyDisabled : !hasPosition;
    const lots = lotsFromAmount(amount || LOT_STEP);
    return (
      <div className={styles.tradePanel}>
        <div className={styles.tradeValue}>
          <span>{isBuy ? 'Сумма покупки' : 'Сумма продажи'}</span>
          <strong>${(amount || LOT_STEP).toLocaleString('en-US')}</strong>
        </div>
        {disabled ? (
          <p className={styles.tradeHint}>
            {isBuy ? 'Недостаточно средств для входа.' : 'Нет доступных лотов для продажи.'}
          </p>
        ) : (
          <Slider
            min={LOT_STEP}
            max={Math.max(LOT_STEP, max)}
            step={LOT_STEP}
            value={Math.min(amount || LOT_STEP, Math.max(LOT_STEP, max))}
            onChange={(val) => setAmount(Math.round(val / LOT_STEP) * LOT_STEP)}
            label="Шаг ×$100"
          />
        )}
        <div className={styles.tradePanelActions}>
          <Button
            variant={isBuy ? 'primary' : 'ghost'}
            onClick={() => {
              if (isBuy) {
                onBuy(amount || LOT_STEP);
              } else {
                onSell(amount || LOT_STEP);
              }
              setPanelMode(null);
            }}
            disabled={disabled}
          >
            {isBuy ? `Купить ${lots} лотов` : `Продать ${lots} лотов`}
          </Button>
          <Button variant="secondary" onClick={() => setPanelMode(null)}>
            Отмена
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className={styles.instrumentCard}>
      <div className={styles.instrumentHeader}>
        <div className={styles.instrumentIcon} style={spriteStyle(iconKey)} />
        <div>
          <h3>{instrument.title}</h3>
        </div>
        <div className={styles.priceBlock}>
          <strong>${price.toLocaleString('en-US')}</strong>
          <span className={changePct >= 0 ? styles.positive : styles.negative}>
            {changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct)}%
          </span>
        </div>
      </div>
      <div className={styles.sparkline}>
        <SparkLine data={priceInfo?.history || []} />
      </div>
      <div className={styles.actions}>
        {hasPosition && (
          <Button
            variant="secondary"
            onClick={() => togglePanel('sell')}
            className={`${styles.sellButton} ${sellProfit >= 0 ? styles.sellPositive : styles.sellNegative}`}
          >
            {sellLabel}
          </Button>
        )}
        <Button variant="primary" onClick={() => togglePanel('buy')} disabled={buyDisabled}>
          Купить
        </Button>
      </div>
      {renderPanel()}
    </Card>
  );
}

function Investments() {
  const instruments = useGameStore(
    (state) => state.configs?.instruments?.instruments || [],
  );
  const priceState = useGameStore((state) => state.priceState);
  const holdings = useGameStore((state) => state.investments);
  const cash = useGameStore((state) => state.cash);
  const buyInstrument = useGameStore((state) => state.buyInstrument);
  const sellInstrument = useGameStore((state) => state.sellInstrument);
  const drawCredit = useGameStore((state) => state.drawCredit);
  const serviceDebt = useGameStore((state) => state.serviceDebt);
  const debt = useGameStore((state) => state.debt);
  const availableCredit = useGameStore((state) => state.availableCredit);
  const [leverage, setLeverage] = useState(1.5);
  const [feedback, setFeedback] = useState(null);
  const creditAmount = useMemo(() => Math.round(600 * leverage), [leverage]);
  const filteredInstruments = useMemo(
    () => instruments.filter((instrument) => instrument.type !== 'bonds'),
    [instruments],
  );

  const handleBuy = (instrument, amount) => {
    if (!amount || amount <= 0) return;
    buyInstrument(instrument.id, amount);
    setFeedback({
      text: `Покупка ${instrument.title} на $${Math.round(amount).toLocaleString('en-US')}`,
      positive: false,
    });
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleSell = (instrument, amount) => {
    if (!amount || amount <= 0) return;
    sellInstrument(instrument.id, amount);
    setFeedback({
      text: `Продажа ${instrument.title} на $${Math.round(amount).toLocaleString('en-US')}`,
      positive: true,
    });
    setTimeout(() => setFeedback(null), 2000);
  };

  const cards = useMemo(
    () =>
      filteredInstruments.map((instrument) => ({
        instrument,
        priceInfo: priceState[instrument.id],
        holding: holdings[instrument.id],
      })),
    [filteredInstruments, priceState, holdings],
  );

  return (
    <div className={styles.screen}>
      <header>
        <h2>Банк и портфель</h2>
      </header>
      {feedback && (
        <div
          className={`${styles.feedback} ${
            feedback.positive ? styles.feedbackPositive : styles.feedbackNegative
          }`}
        >
          {feedback.text}
        </div>
      )}
      <div className={styles.list}>
        {cards.map((card) => (
          <InstrumentCard
            key={card.instrument.id}
            instrument={card.instrument}
            priceInfo={card.priceInfo}
            holding={card.holding}
            cash={cash}
            onBuy={(amount) => handleBuy(card.instrument, amount)}
            onSell={(amount) => handleSell(card.instrument, amount)}
          />
        ))}
      </div>
      <Card className={styles.creditCard}>
        <div className={styles.creditRows}>
          <div>
            <span>Текущий долг</span>
            <strong>${Math.round(debt).toLocaleString('en-US')}</strong>
          </div>
          <div>
            <span>Доступный лимит</span>
            <strong>${Math.round(Math.max(availableCredit, 0)).toLocaleString('en-US')}</strong>
          </div>
        </div>
        <Slider
          min={1}
          max={4}
          step={0.5}
          value={leverage}
          onChange={setLeverage}
          label={`Плечо ×${leverage.toFixed(1)}`}
        />
        <div className={styles.creditActions}>
          <Button
            variant="primary"
            onClick={() => drawCredit(creditAmount)}
            disabled={availableCredit <= 0}
          >
            Взять ${creditAmount}
          </Button>
          <Button
            variant="danger"
            onClick={() => serviceDebt(creditAmount)}
            disabled={debt <= 0 || cash <= 0}
          >
            Погасить ${creditAmount}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default Investments;
