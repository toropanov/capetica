import { useMemo, useState, useEffect, useRef } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import Slider from '../components/Slider';
import SparkLine from '../components/SparkLine';
import AssetsSectionSwitch from '../components/AssetsSectionSwitch';
import styles from './Investments.module.css';

const LOT_STEP = 100;
const SLIDER_STEP = 10;
const formatUSD = (value) => `$${Math.round(value || 0).toLocaleString('en-US')}`;
const formatPercent = (value) => {
  if (typeof value !== 'number') return null;
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
};

const clampAmount = (value, max) => {
  if (max <= 0) return 0;
  const limit = Math.max(LOT_STEP, Math.round(max));
  const next = Number.isFinite(value) ? Math.round(value) : LOT_STEP;
  return Math.min(Math.max(next, LOT_STEP), limit);
};

function InstrumentCard({
  instrument,
  priceInfo,
  holding,
  cash,
  onBuy,
  onSell,
  currentMonth,
  tradeLocks = {},
  saleData,
  purchaseData,
}) {
  const rawPrice = priceInfo?.price || instrument.initialPrice;
  const changePct = Math.round((priceInfo?.lastReturn || 0) * 100);
  const price = Math.round(rawPrice);
  const holdingUnits = holding?.units || 0;
  const holdingValue = Math.round(holdingUnits * rawPrice);
  const buyMax = Math.round(Math.max(0, cash));
  const sellMax = Math.round(Math.max(0, holdingValue));
  const [buyAmount, setBuyAmount] = useState(LOT_STEP);
  const [sellAmount, setSellAmount] = useState(LOT_STEP);
  const [panelMode, setPanelMode] = useState(null);
  const [buyConfirmed, setBuyConfirmed] = useState(false);
  const [lastBuyAmount, setLastBuyAmount] = useState(null);
  const buyConfirmTimeout = useRef(null);

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
  const tradeLocked = tradeLocks[instrument.id] === currentMonth;
  const sellLocked = tradeLocked;
  const buyLocked = tradeLocked;

  const defaultSellLabel = hasPosition
    ? `Продать $${sellValue.toLocaleString('en-US')} (${sellProfit >= 0 ? '+' : '-'}$${Math.abs(sellProfit).toLocaleString('en-US')})`
    : '';
  const purchaseAmount = purchaseData?.turn === currentMonth ? purchaseData.amount : null;
  const displayedPurchaseAmount = lastBuyAmount || purchaseAmount;
  const showingPurchaseLabel = buyLocked && displayedPurchaseAmount;
  const sellLabel =
    showingPurchaseLabel
      ? `Куплено на $${Math.round(displayedPurchaseAmount).toLocaleString('en-US')}`
      : defaultSellLabel;
  const sellClassName = showingPurchaseLabel
    ? styles.sellPositive
    : sellProfit >= 0
      ? styles.sellPositive
      : styles.sellNegative;
  const hasSaleNotice = saleData?.turn === currentMonth;
  useEffect(
    () => () => {
      if (buyConfirmTimeout.current) {
        clearTimeout(buyConfirmTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!buyLocked) {
      setLastBuyAmount(null);
    }
  }, [buyLocked]);

  const togglePanel = (mode) => {
    if (mode === 'sell' && (!hasPosition || sellLocked)) return;
    if (mode === 'buy' && buyLocked) return;
    setPanelMode((prev) => (prev === mode ? null : mode));
  };

  const showBuyConfirmation = () => {
    setBuyConfirmed(true);
    if (buyConfirmTimeout.current) {
      clearTimeout(buyConfirmTimeout.current);
    }
    buyConfirmTimeout.current = setTimeout(() => {
      setBuyConfirmed(false);
      setPanelMode(null);
    }, 300);
  };

  const formatProfitLabel = (value) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString('en-US')}`;

  const renderPanel = () => {
    if (!panelMode) return null;
    const isBuy = panelMode === 'buy';
    if (!isBuy && !hasPosition) return null;
    const max = isBuy ? buyMax : sellMax;
    const amount = isBuy ? buyAmount : sellAmount;
    const setAmount = isBuy ? setBuyAmount : setSellAmount;
    const disabled = isBuy ? buyDisabled : !hasPosition;
    const displayAmount = amount || LOT_STEP;
    return (
        <div className={styles.tradePanel}>
        <div className={styles.tradeValue}>
          <span>{isBuy ? 'Сумма покупки' : 'Сумма продажи'}</span>
          <strong>${displayAmount.toLocaleString('en-US')}</strong>
        </div>
        {disabled ? (
          <p className={styles.tradeHint}>
            {isBuy ? 'Недостаточно средств для входа.' : 'Нет доступных лотов для продажи.'}
          </p>
        ) : (
          <Slider
            min={LOT_STEP}
            max={Math.max(LOT_STEP, max)}
            step={SLIDER_STEP}
            value={Math.min(displayAmount, Math.max(LOT_STEP, max))}
            onChange={(val) => setAmount(Math.round(val))}
          />
        )}
        <div className={styles.tradePanelActions}>
          <Button
            variant={isBuy ? 'primary' : 'ghost'}
            onClick={() => {
              if (isBuy) {
                const spent = amount || LOT_STEP;
                onBuy(spent);
                setLastBuyAmount(spent);
                showBuyConfirmation();
              } else {
                onSell(amount || LOT_STEP);
                setPanelMode(null);
              }
            }}
            disabled={disabled || buyConfirmed}
            className={`${styles.tradeActionButton} ${buyConfirmed && isBuy ? styles.buyComplete : ''} ${!isBuy ? styles.tradeSellConfirm : ''}`}
          >
            {isBuy
              ? buyConfirmed
                ? 'Готово'
                : 'Купить'
              : `Продать ${formatUSD(displayAmount)}`}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPanelMode(null)}
            className={styles.tradeActionButton}
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className={styles.instrumentCard}>
      <div className={styles.instrumentHeader}>
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
        {hasSaleNotice ? (
          <Button
            variant="primary"
            className={styles.saleNotice}
            onClick={(event) => event.preventDefault()}
          >
            {`Продано $${(saleData?.amount || 0).toLocaleString('en-US')} (${formatProfitLabel(
              saleData?.profit || 0,
            )})`}
          </Button>
        ) : (
          hasPosition &&
          panelMode !== 'buy' &&
          panelMode !== 'sell' && (
            <Button
              variant="secondary"
              onClick={() => togglePanel('sell')}
              className={`${styles.sellButton} ${sellClassName}`}
              disabled={sellLocked}
            >
              {sellLabel}
            </Button>
          )
        )}
        {panelMode !== 'buy' && panelMode !== 'sell' && !buyLocked && (
          buyDisabled ? (
            <div className={styles.tradeBadge}>Недостаточно средств</div>
          ) : (
            <Button variant="primary" onClick={() => togglePanel('buy')}>
              Купить
            </Button>
          )
        )}
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
  const loanRules = useGameStore((state) => state.configs?.rules?.loans);
  const [creditAmount, setCreditAmount] = useState(1000);
  const [creditConfirm, setCreditConfirm] = useState(null);
  const [lastDrawAmount, setLastDrawAmount] = useState(null);
  const creditConfirmRef = useRef(null);
  const month = useGameStore((state) => state.month);
  const tradeLocks = useGameStore((state) => state.tradeLocks || {});
  const creditLocked = useGameStore((state) => state.creditLockedMonth === state.month);
  const filteredInstruments = useMemo(
    () => instruments.filter((instrument) => instrument.type !== 'bonds'),
    [instruments],
  );
  const aprLabel = loanRules?.apr != null ? formatPercent(loanRules.apr) : null;
  const minTerm = loanRules?.minTermMonths || loanRules?.maxTermMonths || 0;
  const maxTerm = loanRules?.maxTermMonths || loanRules?.minTermMonths || 0;
  const termLabel = minTerm && maxTerm ? `${minTerm}–${maxTerm} мес.` : minTerm ? `${minTerm} мес.` : '—';

  const handleBuy = (instrument, amount) => {
    if (!amount || amount <= 0) return;
    buyInstrument(instrument.id, amount);
  };

  const handleSell = (instrument, amount) => {
    if (!amount || amount <= 0) return;
    sellInstrument(instrument.id, amount);
  };

  const lastSales = useGameStore((state) => state.lastSales || {});
  const lastPurchases = useGameStore((state) => state.lastPurchases || {});
  const cards = useMemo(
    () =>
      filteredInstruments.map((instrument) => ({
        instrument,
        priceInfo: priceState[instrument.id],
        holding: holdings[instrument.id],
      })),
    [filteredInstruments, priceState, holdings],
  );

  useEffect(() => {
    const maxDraw = Math.max(500, Math.round(Math.max(availableCredit, 0)));
    if (creditAmount > maxDraw) {
      setCreditAmount(maxDraw);
    }
  }, [availableCredit, creditAmount]);

  useEffect(
    () => () => {
      if (creditConfirmRef.current) {
        clearTimeout(creditConfirmRef.current);
      }
    },
    [],
  );

  const flashCreditConfirm = (type) => {
    setCreditConfirm(type);
    if (creditConfirmRef.current) {
      clearTimeout(creditConfirmRef.current);
    }
    creditConfirmRef.current = setTimeout(() => setCreditConfirm(null), 900);
  };

  const handleDrawCredit = () => {
    const amount = Math.min(creditAmount, Math.max(availableCredit, 0));
    if (amount <= 0 || creditLocked) return;
    drawCredit(amount);
    setLastDrawAmount(amount);
    flashCreditConfirm('draw');
  };

  const handleRepay = () => {
    if (creditAmount <= 0 || creditLocked || debt <= 0 || cash <= 0) return;
    serviceDebt(creditAmount);
    flashCreditConfirm('repay');
  };

  const estimatedPayment = useMemo(() => {
    if (!loanRules) return null;
    const amount = Math.max(0, Math.round(creditAmount || 0));
    if (amount <= 0) return null;
    const term = loanRules.maxTermMonths || loanRules.minTermMonths || 12;
    if (!term) return null;
    const apr = loanRules.apr || 0;
    const monthlyRate = apr > 0 ? apr / 12 : 0;
    if (!monthlyRate) {
      return amount / term;
    }
    const factor = Math.pow(1 + monthlyRate, -term);
    return (amount * monthlyRate) / (1 - factor);
  }, [creditAmount, loanRules]);

  return (
    <div className={styles.screen}>
      <AssetsSectionSwitch active="investments" />
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
            currentMonth={month}
            tradeLocks={tradeLocks}
            saleData={lastSales[card.instrument.id]}
            purchaseData={lastPurchases[card.instrument.id]}
          />
        ))}
      </div>
      <Card className={styles.creditCard}>
        <div className={styles.creditHeader}>
          <span>Кредитная линия</span>
          <p>
            {loanRules
              ? `Выдаётся под ${aprLabel || '—'} на срок ${termLabel}. Лимит растёт вместе с чистым капиталом.`
              : 'Условия выдачи подтягиваются из конфигурации.'}
          </p>
        </div>
        <div className={styles.creditTerms}>
          <div>
            <span>Ставка</span>
            <strong>{aprLabel || '—'}</strong>
          </div>
          <div>
            <span>Срок</span>
            <strong>{termLabel}</strong>
          </div>
          <div>
            <span>Доступно</span>
            <strong>{formatUSD(Math.max(availableCredit, 0))}</strong>
          </div>
        </div>
        {availableCredit > 0 ? (
          (() => {
            const maxAvailable = Math.round(Math.max(availableCredit, 0));
            const sliderMin = Math.min(500, maxAvailable);
            const sliderMax = Math.max(sliderMin, maxAvailable);
            const sliderStep = Math.max(10, Math.round(sliderMax / 12)) || 10;
            return (
              <Slider
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={Math.min(creditAmount, sliderMax)}
                onChange={(value) => setCreditAmount(Math.round(value))}
                disabled={creditLocked}
              />
            );
          })()
        ) : (
          <Slider min={0} max={0} step={1} value={0} onChange={() => {}} disabled />
        )}
        <div className={styles.creditActions}>
          <div className={styles.creditActionColumn}>
            <Button
              variant="primary"
              onClick={handleDrawCredit}
              disabled={availableCredit <= 0 || creditLocked}
              className={creditLocked && lastDrawAmount ? styles.creditTakenButton : ''}
            >
              {creditConfirm === 'draw'
                ? 'Готово'
                : creditLocked && lastDrawAmount
                ? `Взято ${formatUSD(lastDrawAmount)}`
                : `Взять ${formatUSD(creditAmount)}`}
            </Button>
            {estimatedPayment && (
              <small className={styles.paymentHint}>
                Платёж ≈ {formatUSD(Math.round(estimatedPayment))}/мес
              </small>
            )}
          </div>
          {debt > 0 && !creditLocked && (
            <div className={styles.creditActionColumn}>
              <Button
                variant="danger"
                onClick={handleRepay}
                disabled={cash <= 0 || creditLocked}
              >
                {creditConfirm === 'repay' ? 'Готово' : `Погасить ${formatUSD(creditAmount)}`}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default Investments;
