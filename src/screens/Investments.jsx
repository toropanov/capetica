import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import Slider from '../components/Slider';
import styles from './Investments.module.css';

const formatUSD = (value) => `$${Math.round(value || 0).toLocaleString('en-US')}`;
const formatPercent = (value) => {
  if (typeof value !== 'number') return null;
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
};

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
};

const CREDIT_DRAW_DEFAULT_LABEL = 'Кредитная линия';

const getCreditSliderStep = (min, max) => {
  const range = Math.max(0, Math.round(max - min));
  if (range === 0) {
    return Math.max(1, Math.round(max || min || 1));
  }
  const rawStep = Math.max(10, Math.round(max / 12)) || 10;
  const normalized = gcd(range, rawStep);
  return Math.max(1, normalized);
};

function Investments() {
  const instruments = useGameStore((state) => state.configs?.instruments?.instruments || []);
  const priceState = useGameStore((state) => state.priceState || {});
  const holdings = useGameStore((state) => state.investments || {});
  const dealParticipations = useGameStore((state) => state.dealParticipations || []);
  const cash = useGameStore((state) => state.cash);
  const drawCredit = useGameStore((state) => state.drawCredit);
  const serviceDebt = useGameStore((state) => state.serviceDebt);
  const debt = useGameStore((state) => state.debt);
  const availableCredit = useGameStore((state) => state.availableCredit);
  const creditDraws = useGameStore((state) => state.creditDraws || []);
  const lastPurchases = useGameStore((state) => state.lastPurchases || {});
  const month = useGameStore((state) => state.month);
  const loanRules = useGameStore((state) => state.configs?.rules?.loans);
  const navigate = useNavigate();
  const [creditAmount, setCreditAmount] = useState(1000);
  const [creditConfirm, setCreditConfirm] = useState(null);
  const creditConfirmRef = useRef(null);
  const [repayingDrawId, setRepayingDrawId] = useState(null);
  const repayAnimationRef = useRef(null);
  const aprLabel = loanRules?.apr != null ? formatPercent(loanRules.apr) : null;
  const minTerm = loanRules?.minTermMonths || loanRules?.maxTermMonths || 0;
  const maxTerm = loanRules?.maxTermMonths || loanRules?.minTermMonths || 0;
  const termLabel = minTerm && maxTerm ? `${minTerm}–${maxTerm} мес.` : minTerm ? `${minTerm} мес.` : '—';

  useEffect(() => {
    const maxDraw = Math.round(Math.max(availableCredit, 0));
    if (creditAmount > maxDraw) {
      setCreditAmount(maxDraw);
    }
  }, [availableCredit, creditAmount]);

  useEffect(
    () => () => {
      if (creditConfirmRef.current) {
        clearTimeout(creditConfirmRef.current);
      }
      if (repayAnimationRef.current) {
        clearTimeout(repayAnimationRef.current);
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
    if (amount <= 0) return;
    drawCredit(amount);
    flashCreditConfirm('draw');
  };

  const flashRepayAnimation = (drawId) => {
    setRepayingDrawId(drawId || 'all');
    if (repayAnimationRef.current) {
      clearTimeout(repayAnimationRef.current);
    }
    repayAnimationRef.current = setTimeout(() => setRepayingDrawId(null), 900);
  };

  const handleRepay = (options = {}) => {
    const targetAmount = options.amount ?? creditAmount;
    if (targetAmount <= 0 || debt <= 0 || cash <= 0) return;
    serviceDebt(targetAmount, { drawId: options.drawId });
    flashRepayAnimation(options.drawId || 'all');
  };

  const totalCreditBalance = useMemo(() => {
    const sumDraws = creditDraws.reduce((sum, draw) => sum + Math.max(draw.balance || 0, 0), 0);
    if (sumDraws > 0) return sumDraws;
    return Math.max(debt, 0);
  }, [creditDraws, debt]);

  const plannedCreditDraw = useMemo(() => {
    if (availableCredit <= 0) return 0;
    const capped = Math.min(Math.round(creditAmount || 0), Math.round(Math.max(availableCredit, 0)));
    return Math.max(0, capped);
  }, [availableCredit, creditAmount]);

  const calculateMonthlyPayment = useCallback(
    (principal) => {
      if (!loanRules) return null;
      const amount = Math.max(0, Math.round(principal || 0));
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
    },
    [loanRules],
  );

  const currentMonthlyPayment = useMemo(
    () => calculateMonthlyPayment(totalCreditBalance),
    [calculateMonthlyPayment, totalCreditBalance],
  );
  const previewMonthlyPayment = useMemo(
    () => calculateMonthlyPayment(totalCreditBalance + plannedCreditDraw),
    [calculateMonthlyPayment, totalCreditBalance, plannedCreditDraw],
  );
  const paymentValue = previewMonthlyPayment ?? currentMonthlyPayment;
  const paymentChanged =
    currentMonthlyPayment != null &&
    previewMonthlyPayment != null &&
    Math.round(previewMonthlyPayment) !== Math.round(currentMonthlyPayment);

  const holdingsList = useMemo(() => {
    return instruments
      .filter((instrument) => ['stocks', 'crypto'].includes(instrument.type))
      .map((instrument) => {
        const holding = holdings[instrument.id];
        if (!holding || (holding.units || 0) <= 0) return null;
        const price = priceState[instrument.id]?.price ?? instrument.initialPrice ?? 0;
        const value = (holding.units || 0) * price;
        const changeRaw = Math.round((priceState[instrument.id]?.lastReturn || 0) * 100);
        const purchaseMeta = lastPurchases[instrument.id];
        const isFresh = purchaseMeta && purchaseMeta.turn === month;
        const changePct = isFresh ? null : changeRaw;
        return {
          instrument,
          holding,
          price,
          value,
          changePct,
        };
      })
      .filter(Boolean);
  }, [instruments, holdings, priceState, lastPurchases, month]);

  const activeDeals = useMemo(
    () => dealParticipations.filter((deal) => !deal.completed),
    [dealParticipations],
  );

  return (
    <div className={styles.screen}>
      <Card className={`${styles.blockCard} ${styles.creditCard}`}>
        <header className={styles.sectionHeader}>
          <h2>Кредитная линия</h2>
          <p>
            {loanRules
              ? `Выдаётся под ${aprLabel || '—'} на срок ${termLabel}. Лимит растёт вместе с чистым капиталом.`
              : 'Условия выдачи подтягиваются из конфигурации.'}
          </p>
        </header>
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
            const sliderMin = 0;
            const sliderMax = Math.max(sliderMin, maxAvailable);
            const sliderStep = getCreditSliderStep(sliderMin, sliderMax);
            return (
              <Slider
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={Math.min(creditAmount, sliderMax)}
                onChange={(value) => setCreditAmount(Math.round(value))}
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
              disabled={availableCredit <= 0}
              className={creditConfirm === 'draw' ? styles.creditTakenButton : ''}
            >
              {creditConfirm === 'draw'
                ? 'Готово'
                : `Взять ${formatUSD(plannedCreditDraw)}`}
            </Button>
          </div>
        </div>
        {creditDraws.length > 0 && (
          <div className={styles.creditDrawList}>
            {creditDraws.map((draw) => {
              const isRepaying = repayingDrawId && (repayingDrawId === draw.id || repayingDrawId === 'all');
              return (
                <div
                  key={draw.id}
                  className={`${styles.creditDrawRow} ${isRepaying ? styles.creditDrawRowRepaying : ''}`}
                >
                  <div>
                    {draw.label && draw.label !== CREDIT_DRAW_DEFAULT_LABEL && <span>{draw.label}</span>}
                    <strong>{formatUSD(draw.balance)}</strong>
                  </div>
                  <button
                    type="button"
                    className={`${styles.creditDrawButton} ${isRepaying ? styles.creditDrawButtonRepaying : ''}`}
                    onClick={() => handleRepay({ amount: draw.balance, drawId: draw.id })}
                    disabled={cash <= 0}
                  >
                    Погасить
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {paymentValue != null && (
          <div className={styles.totalPaymentHint}>
            <small className={styles.paymentHint}>
              {paymentChanged
                ? `Платёж по кредитам: ${formatUSD(Math.round(currentMonthlyPayment || 0))} → ${formatUSD(Math.round(previewMonthlyPayment || 0))}/мес`
                : `Платёж по кредитам: ${formatUSD(Math.round(paymentValue))}/мес`}
            </small>
          </div>
        )}
      </Card>

      {holdingsList.length === 0 && activeDeals.length === 0 ? (
        <Card className={styles.emptyPortfolioCard}>
          <div className={styles.emptyIllustration}>
            <span role="img" aria-label="spark">✨</span>
          </div>
          <h2>Портфель ждёт первых активов</h2>
          <p>Жди карточку актива и прямо во время хода решай: покупать или фиксировать прибыль.</p>
        </Card>
      ) : (
        <>
          <div className={styles.listCompact}>
            <Card className={styles.blockCard}>
              <header className={styles.sectionHeader}>
                <h2>Акции и криптовалюта</h2>
                <p>Текущие инструменты в портфеле. Покупка и их продажа возможны только по карточкам событий хода.</p>
              </header>
              {holdingsList.length ? (
                holdingsList.map((item) => (
                  <div key={item.instrument.id} className={styles.instrumentRow}>
                    <div className={styles.instrumentHeader}>
                      <div>
                        <span>{item.instrument.title}</span>
                        <p>{item.instrument.type === 'crypto' ? 'Криптовалюта' : 'Акция'}</p>
                      </div>
                      <div className={styles.priceBlock}>
                        <strong>{formatUSD(item.price)}</strong>
                        {item.changePct === null ? (
                          <span className={styles.neutral}>—</span>
                        ) : (
                          <span className={item.changePct >= 0 ? styles.positive : styles.negative}>
                            {item.changePct >= 0 ? '+' : ''}
                            {item.changePct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.assetStats}>
                      <div>
                        <span>Позиция</span>
                        <strong>{formatUSD(item.value)}</strong>
                      </div>
                      <div>
                        <span>Лоты</span>
                        <strong>{item.holding.units.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyDeals}>
                  <p>Активы появляются волнами — жди ход с карточкой и сразу входи, пока окно не закрылось.</p>
                </div>
              )}
            </Card>
          </div>

          <div className={styles.listWithBottom}>
            <Card className={styles.blockCard}>
              <header className={styles.sectionHeader}>
                <h2>Контракты</h2>
                <p>Текущие участия и выплаты</p>
              </header>
              {activeDeals.length ? (
                activeDeals.map((deal) => {
                  const remaining = Math.max(0, (deal.durationMonths || 0) - (deal.elapsedMonths || 0));
                  return (
                    <div key={deal.participationId} className={styles.instrumentRow}>
                      <div className={styles.dealHeader}>
                        <div>
                          <span>{deal.title}</span>
                          <p>В работе</p>
                        </div>
                        <strong>{formatUSD(deal.invested)}</strong>
                      </div>
                      <div className={styles.assetStats}>
                        <div>
                          <span>Пассивно</span>
                          <strong>{formatUSD(deal.monthlyPayout)}/мес</strong>
                        </div>
                        <div>
                          <span>Осталось</span>
                          <strong>{remaining} мес.</strong>
                        </div>
                        <div>
                          <span>Получено</span>
                          <strong>{formatUSD(deal.profitEarned || 0)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyDeals}>
                  <p>Нужные контракты выстреливают во время ходов. Держи кэш под рукой и реагируй, когда игра подкинет шанс.</p>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default Investments;
