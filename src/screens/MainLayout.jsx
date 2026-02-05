import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../store/gameStore';
import BottomNav from '../components/BottomNav';
import Button from '../components/Button';
import Card from '../components/Card';
import Slider from '../components/Slider';
import { calculateHoldingsValue, calculatePassiveIncome, getPassiveMultiplier } from '../domain/finance';
import { DEAL_TEMPLATES } from '../domain/deals';
import styles from './MainLayout.module.css';
import { spriteStyle, getProfessionIcon } from '../utils/iconSprite';
import teacherImg from '../assets/proffesions/teacher.png';
import devImg from '../assets/proffesions/dev.png';
import lawyerImg from '../assets/proffesions/low.png';
import doctorImg from '../assets/proffesions/doctor.png';
import fireImg from '../assets/proffesions/fire.png';
import managerImg from '../assets/proffesions/manager.png';
import neutralImg from '../assets/popup_neutral.png';
import winImage from '../assets/win_ru.png';
import failImage from '../assets/fail_ru.png';
import Modal from '../components/Modal';

function getEventMessage(event = {}) {
  const raw = event.message || event.description || '';
  if (!raw) return '';
  const colon = `${event.title}:`;
  const negativePrefix = `⚠ ${colon}`;
  if (raw.startsWith(negativePrefix)) return raw.slice(negativePrefix.length).trim();
  if (raw.startsWith(colon)) return raw.slice(colon.length).trim();
  return raw;
}

const WIN_OUTCOME_MESSAGES = {
  financial_independence: 'Пассивный доход выше фикс. расходов, можешь укреплять империю или начать новую партию.',
  net_worth_1m: 'Чистый капитал превысил $1 000 000, продолжай играть или начни заново.',
};

const LOSE_OUTCOME_MESSAGES = {
  bankruptcy: 'Нет наличных и кредитной линии — долг победил. Начни новую партию.',
  insolvency: 'Отрицательный денежный поток и растущие проценты привели к поражению.',
  debt_over_networth: 'Долг превысил чистый капитал, игра закончена.',
};

const ROLL_LOADER_PREVIEW_DELAY = 260;
const ROLL_LOADER_ROLL_DURATION = 1800;
const ROLL_LOADER_RESULT_DELAY = 1000;
const ROLL_LOADER_TOTAL_DELAY =
  ROLL_LOADER_PREVIEW_DELAY + ROLL_LOADER_ROLL_DURATION + ROLL_LOADER_RESULT_DELAY;
const DICE_PIP_KEYS = ['tl', 'tr', 'ml', 'mr', 'bl', 'br', 'center'];
const DICE_FACE_MAP = {
  1: ['center'],
  2: ['tl', 'br'],
  3: ['tl', 'center', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'center', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

const clampDiceValue = (val) => {
  if (typeof val !== 'number' || Number.isNaN(val)) return 1;
  const normalized = Math.round(val);
  return Math.min(Math.max(normalized, 1), 6);
};

function TurnLoader({ message, previousValue, size = 'normal' }) {
  const initialValue = clampDiceValue(previousValue);
  const [value, setValue] = useState(initialValue);
  const [rolling, setRolling] = useState(false);
  const [finalValue, setFinalValue] = useState(initialValue);
  const timing =
    size === 'roll'
      ? {
          preview: ROLL_LOADER_PREVIEW_DELAY,
          roll: ROLL_LOADER_ROLL_DURATION,
        }
      : { preview: 160, roll: 800 };

  useEffect(() => {
    const baseValue = clampDiceValue(previousValue);
    setValue(baseValue);
    setFinalValue(baseValue);
    setRolling(false);
    let startTimer;
    let rollInterval;
    let stopTimer;

    startTimer = setTimeout(() => {
      setRolling(true);
      rollInterval = setInterval(() => {
        setValue((prev) => {
          let next = Math.floor(Math.random() * 6) + 1;
          if (next === prev) {
            next = (next % 6) + 1;
          }
          return next;
        });
      }, 180);
    }, timing.preview);

    stopTimer = setTimeout(() => {
      if (rollInterval) {
        clearInterval(rollInterval);
      }
      const target = Math.floor(Math.random() * 6) + 1;
      setFinalValue(target);
      setValue(target);
      setRolling(false);
    }, timing.preview + timing.roll);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
      if (rollInterval) {
        clearInterval(rollInterval);
      }
    };
  }, [previousValue]);

  const displayValue = rolling ? value : finalValue;
  const activeDots = DICE_FACE_MAP[displayValue] || DICE_FACE_MAP[1];

  return (
    <div className={styles.nextMoveLoader}>
      <div
        className={`${styles.nextMoveDice} ${size === 'roll' ? styles.rollDice : ''} ${
          rolling ? styles.nextMoveDiceRolling : styles.nextMoveDiceResult
        }`}
        role="img"
        aria-label={`Выбираем число ${displayValue}`}
      >
        {DICE_PIP_KEYS.map((key) => {
          const classKey = `diceDot${key.charAt(0).toUpperCase()}${key.slice(1)}`;
          const positionClass = styles[classKey] || '';
          const active = activeDots.includes(key);
          const dotClassName = `${styles.diceDot} ${positionClass} ${active ? styles.diceDotVisible : ''}`;
          return <span key={key} className={dotClassName} />;
        })}
      </div>
      <div className={styles.nextMoveProgress}>
        <span />
      </div>
      <p className={styles.nextMoveMessage}>{message}</p>
    </div>
  );
}

function SimpleLoader({ message }) {
  return (
    <div className={styles.nextMoveLoader}>
      <div className={styles.nextMoveProgress}>
        <span />
      </div>
      <p className={styles.nextMoveMessage}>{message}</p>
    </div>
  );
}

const formatUSD = (value) => `$${Math.round(value || 0).toLocaleString('en-US')}`;
const METRIC_DELTA_DEFS = [
  { key: 'cash', label: 'Наличные', suffix: '' },
  { key: 'incomes', label: 'Доходы/мес', suffix: '/мес' },
  { key: 'expenses', label: 'Расходы/мес', suffix: '/мес' },
  { key: 'passiveIncome', label: 'Пассивный доход', suffix: '/мес' },
];

function computeMetricSnapshotFromState(snapshotState) {
  if (!snapshotState) {
    return {
      incomes: 0,
      expenses: 0,
      passiveIncome: 0,
      cash: 0,
    };
  }
  const instrumentLookup = buildInstrumentLookup(snapshotState.configs);
  const passiveFromInvestments = calculatePassiveIncome(
    snapshotState.investments,
    snapshotState.priceState,
    instrumentLookup,
  );
  const passiveFromDeals = (snapshotState.dealParticipations || []).reduce((sum, deal) => {
    if (deal.completed) return sum;
    return sum + (deal.monthlyPayout || 0);
  }, 0);
  const passiveIncomeTotal = Math.round(passiveFromInvestments + passiveFromDeals);
  const salaryBase =
    (snapshotState.salaryProgression?.currentBase ?? snapshotState.profession?.salaryMonthly) || 0;
  const salaryCut = snapshotState.salaryCutMonths > 0 ? snapshotState.salaryCutAmount || 0 : 0;
  const salary =
    snapshotState.joblessMonths > 0
      ? 0
      : Math.max(0, Math.round(salaryBase + (snapshotState.salaryBonus || 0) - salaryCut));
  const incomes = Math.round(salary + passiveIncomeTotal);
  const expenses = Math.round((snapshotState.livingCost || 0) + (snapshotState.recurringExpenses || 0));
  return {
    incomes,
    expenses,
    passiveIncome: passiveIncomeTotal,
    cash: Math.round(snapshotState.cash || 0),
  };
}

function computeMetricDeltaPayload(prevSnapshot, nextSnapshot) {
  if (!prevSnapshot || !nextSnapshot) return null;
  const changed = METRIC_DELTA_DEFS.some(({ key }) => {
    const prevValue = Math.round(prevSnapshot[key] ?? 0);
    const nextValue = Math.round(nextSnapshot[key] ?? prevValue);
    return nextValue !== prevValue;
  });
  if (!changed) return null;
  return {
    prev: prevSnapshot,
    next: nextSnapshot,
  };
}

const pickFromList = (list, roll) => {
  if (!list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(roll * list.length));
  return list[index];
};

const buildInstrumentLookup = (configs) => {
  const list = configs?.instruments?.instruments || [];
  return list.reduce((acc, instrument) => {
    acc[instrument.id] = instrument;
    return acc;
  }, {});
};

function buildRollCard(state) {
  if (!state?.configs) return null;
  if (state.currentEvent) {
    return { type: 'event', event: state.currentEvent };
  }
  const instruments = state.configs.instruments?.instruments || [];
  const stockOptions = instruments.filter((item) => item.type === 'stocks').slice(0, 3);
  const cryptoOptions = instruments.filter((item) => item.type === 'crypto').slice(0, 2);
  const dealOptions = DEAL_TEMPLATES.filter((deal) => {
    const window = state.dealWindows?.[deal.id];
    return window && window.expiresIn > 0 && (window.slotsLeft ?? 0) > 0;
  });
  const categories = [];
  if (stockOptions.length) categories.push('stocks');
  if (cryptoOptions.length) categories.push('crypto');
  if (dealOptions.length) categories.push('deal');
  if (!categories.length) return null;
  const category = pickFromList(categories, Math.random());
  if (category === 'deal') {
    const deal = pickFromList(dealOptions, Math.random());
    if (!deal) return null;
    return {
      type: 'deal',
      dealId: deal.id,
    };
  }
  const list = category === 'stocks' ? stockOptions : cryptoOptions;
  const instrument = pickFromList(list, Math.random());
  if (!instrument) return null;
  const range =
    instrument.ui?.range || {
      min: Math.max(5, Math.round((instrument.initialPrice || 100) * 0.1)),
      max: Math.max(10, Math.round((instrument.initialPrice || 100) * 0.3)),
    };
  return {
    type: category,
    instrumentId: instrument.id,
    range,
  };
}

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const storeData = useGameStore(
    useShallow((state) => ({
      profession: state.profession,
      cash: state.cash,
      debt: state.debt,
      investments: state.investments,
      priceState: state.priceState,
      configs: state.configs,
      availableCredit: state.availableCredit,
      winCondition: state.winCondition,
      loseCondition: state.loseCondition,
      recurringExpenses: state.recurringExpenses,
      dealWindows: state.dealWindows,
      dealParticipations: state.dealParticipations || [],
      salaryBonus: state.salaryBonus || 0,
      salaryProgression: state.salaryProgression,
      joblessMonths: state.joblessMonths || 0,
      salaryCutMonths: state.salaryCutMonths || 0,
      salaryCutAmount: state.salaryCutAmount || 0,
      livingCost: state.livingCost || 0,
    })),
  );
  const advanceMonth = useGameStore((state) => state.advanceMonth);
  const buyInstrument = useGameStore((state) => state.buyInstrument);
  const sellInstrument = useGameStore((state) => state.sellInstrument);
  const participateInDeal = useGameStore((state) => state.participateInDeal);
  const actionsCount = useGameStore((state) => state.badgeActionsThisTurn || 0);
  const month = useGameStore((state) => state.month);
  const lastTurn = useGameStore((state) => state.lastTurn);
  const recentLog = useGameStore((state) => state.recentLog || []);
  const currentEvent = useGameStore((state) => state.currentEvent);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [pendingSummary, setPendingSummary] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);
  const [turnSummaryOpen, setTurnSummaryOpen] = useState(false);
  const [turnSummary, setTurnSummary] = useState(null);
  const [rollOverlay, setRollOverlay] = useState(false);
  const [rollCard, setRollCard] = useState(null);
  const [rollCardOpen, setRollCardOpen] = useState(false);
  const confirmButtonRef = useRef(null);
  const contentRef = useRef(null);
  const diceTimerRef = useRef(null);
  const homeTimerRef = useRef(null);
  const newGameTimerRef = useRef(null);
  const nextMoveTimerRef = useRef(null);
  const rollCloseTimerRef = useRef(null);
  const [nextMoveLoading, setNextMoveLoading] = useState(false);
  const [rollCloseLoading, setRollCloseLoading] = useState(false);
  const transitionState = useGameStore((state) => state.transitionState);
  const beginTransition = useGameStore((state) => state.beginTransition);
  const completeTransition = useGameStore((state) => state.completeTransition);
  const resetGame = useGameStore((state) => state.resetGame);
  const armTurnHighlight = useGameStore((state) => state.armTurnHighlight);
  const [rollBuyAmount, setRollBuyAmount] = useState(0);
  const [rollSellAmount, setRollSellAmount] = useState(0);
  const [rollFeedback, setRollFeedback] = useState('');
  const [pendingMetricDelta, setPendingMetricDelta] = useState(null);
  const [metricAnimation, setMetricAnimation] = useState(null);
  const [animatedMetrics, setAnimatedMetrics] = useState(null);
  const metricAnimationFrameRef = useRef(null);
  const [freezeMetrics, setFreezeMetrics] = useState(false);
  const [frozenMetrics, setFrozenMetrics] = useState(null);
  const [frozenCash, setFrozenCash] = useState(null);
  const [hideProgressCard, setHideProgressCard] = useState(false);
  const [rollTradeMode, setRollTradeMode] = useState('buy');
  const releaseFrozenMetrics = useCallback(
    ({ animate = false } = {}) => {
      const prevMetrics = frozenMetrics;
      setFreezeMetrics(false);
      setFrozenMetrics(null);
      setFrozenCash(null);
      if (animate && !pendingMetricDelta && prevMetrics) {
        const latestSnapshot = computeMetricSnapshotFromState(useGameStore.getState());
        const payload = computeMetricDeltaPayload(prevMetrics, latestSnapshot);
        if (payload) {
          setPendingMetricDelta(payload);
        }
      }
    },
    [frozenMetrics, pendingMetricDelta],
  );

  useEffect(() => () => {
    if (diceTimerRef.current) {
      clearTimeout(diceTimerRef.current);
    }
    if (homeTimerRef.current) {
      clearTimeout(homeTimerRef.current);
    }
    if (nextMoveTimerRef.current) {
      clearTimeout(nextMoveTimerRef.current);
    }
    if (rollCloseTimerRef.current) {
      clearTimeout(rollCloseTimerRef.current);
    }
    if (newGameTimerRef.current) {
      clearTimeout(newGameTimerRef.current);
    }
    if (metricAnimationFrameRef.current) {
      cancelAnimationFrame(metricAnimationFrameRef.current);
    }
    setFreezeMetrics(false);
    setFrozenMetrics(null);
    setFrozenCash(null);
  }, []);

  useEffect(() => {
    if (!confirmingFinish) return undefined;
    const handleOutside = (event) => {
      if (confirmButtonRef.current?.contains(event.target)) return;
      setConfirmingFinish(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [confirmingFinish]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  const handleAdvanceRequest = () => {
    if (diceAnimating) return;
    if (!confirmingFinish) {
      setConfirmingFinish(true);
      return;
    }
    if (location.pathname !== '/app') {
      navigate('/app');
    }
    setConfirmingFinish(false);
    setDiceAnimating(true);
    setRollOverlay(true);
    setRollCard(null);
    setRollCardOpen(false);
    if (diceTimerRef.current) {
      clearTimeout(diceTimerRef.current);
    }
    diceTimerRef.current = setTimeout(() => {
      advanceMonth();
      setPendingSummary(true);
      const latestState = useGameStore.getState();
      const nextCard = buildRollCard(latestState);
      const hasOutcome = Boolean(latestState.winCondition || latestState.loseCondition);
      setRollCard(nextCard);
      setDiceAnimating(false);
      setRollOverlay(false);
      setRollCardOpen(Boolean(nextCard) && !hasOutcome);
      if (!nextCard || hasOutcome) {
        releaseFrozenMetrics({ animate: true });
      }
    }, ROLL_LOADER_TOTAL_DELAY);
  };

  const instrumentMap = useMemo(() => {
    const list = storeData.configs?.instruments?.instruments || [];
    return list.reduce((acc, instrument) => {
      acc[instrument.id] = instrument;
      return acc;
    }, {});
  }, [storeData.configs]);

  const holdingsValue = useMemo(
    () => calculateHoldingsValue(storeData.investments, storeData.priceState),
    [storeData.investments, storeData.priceState],
  );

  const passiveIncome = useMemo(
    () => calculatePassiveIncome(storeData.investments, storeData.priceState, instrumentMap),
    [storeData.investments, storeData.priceState, instrumentMap],
  );

  const netWorth = storeData.cash + holdingsValue - storeData.debt;
  const professionImage = storeData.profession ? PROFESSION_IMAGES[storeData.profession.id] : null;

  const formatMoney = (value) => {
    const rounded = Math.round(value);
    return `${rounded < 0 ? '-$' : '$'}${Math.abs(rounded).toLocaleString('en-US')}`;
  };
  const queueMetricDelta = useCallback((prevSnapshot) => {
    if (!prevSnapshot) return;
    const nextSnapshot = computeMetricSnapshotFromState(useGameStore.getState());
    const payload = computeMetricDeltaPayload(prevSnapshot, nextSnapshot);
    if (payload) {
      setPendingMetricDelta(payload);
    }
  }, []);
  useEffect(() => {
    if (!diceAnimating || freezeMetrics) return;
    setFrozenCash(Math.round(storeData.cash || 0));
    setFrozenMetrics(computeMetricSnapshotFromState(storeData));
    setFreezeMetrics(true);
  }, [diceAnimating, freezeMetrics, storeData]);
  const currentMetrics = useMemo(
    () => {
      if (freezeMetrics && frozenMetrics) {
        return frozenMetrics;
      }
      return computeMetricSnapshotFromState(storeData);
    },
    [
      freezeMetrics,
      frozenMetrics,
      storeData.cash,
      storeData.recurringExpenses,
      storeData.investments,
      storeData.priceState,
      storeData.dealParticipations,
      storeData.salaryProgression,
      storeData.profession,
      storeData.salaryBonus,
      storeData.joblessMonths,
      storeData.salaryCutMonths,
      storeData.salaryCutAmount,
      storeData.livingCost,
      storeData.configs,
    ],
  );
  const displayedCash = (() => {
    if (typeof animatedMetrics?.cash === 'number') {
      return Math.round(animatedMetrics.cash);
    }
    if (freezeMetrics && typeof frozenCash === 'number') {
      return frozenCash;
    }
    return Math.round(storeData.cash || 0);
  })();
  const displayedMetrics = animatedMetrics || currentMetrics;
  const outletContext = useMemo(
    () => ({ metricPulse: { current: displayedMetrics, animation: metricAnimation } }),
    [displayedMetrics, metricAnimation],
  );
  const acknowledgeOutcome = useGameStore((state) => state.acknowledgeOutcome);
  const hasWin = Boolean(storeData.winCondition);
  const hasLose = Boolean(storeData.loseCondition);
  const outcomeState = hasWin ? 'win' : hasLose ? 'lose' : null;
  const outcomeImage =
    outcomeState === 'win'
      ? winImage
      : outcomeState === 'lose'
        ? failImage
        : neutralImg;
  const outcomeAlt =
    outcomeState === 'win'
      ? 'Победа'
      : outcomeState === 'lose'
        ? 'Поражение'
        : 'Ход завершён';
  const outcomeMessage = outcomeState === 'win'
    ? WIN_OUTCOME_MESSAGES[storeData.winCondition?.id] ||
      'Цель достигнута! Можешь продолжать играть или начать заново.'
    : outcomeState === 'lose'
      ? LOSE_OUTCOME_MESSAGES[storeData.loseCondition?.id] ||
        'Финансовый план провалился. Начни новую партию, чтобы попробовать снова.'
      : null;

  const rollCardData = useMemo(() => {
    if (!rollCard || !storeData.configs) return null;
    if (rollCard.type === 'event') {
      return { type: 'event', event: rollCard.event };
    }
    if (rollCard.type === 'deal') {
      const deal = DEAL_TEMPLATES.find((item) => item.id === rollCard.dealId);
      if (!deal) return null;
      const window = storeData.dealWindows?.[deal.id];
      return { type: 'deal', deal, window };
    }
    const instruments = storeData.configs.instruments?.instruments || [];
    const instrument = instruments.find((item) => item.id === rollCard.instrumentId);
    if (!instrument) return null;
    const price = storeData.priceState?.[instrument.id]?.price ?? instrument.initialPrice;
    const holding = storeData.investments?.[instrument.id];
    return {
      type: rollCard.type,
      instrument,
      price,
      range: rollCard.range,
      holding,
    };
  }, [rollCard, storeData.configs, storeData.priceState, storeData.dealWindows, storeData.investments]);
  const rollPassiveRate =
    !rollCardData || rollCardData.type === 'deal' || rollCardData.type === 'event'
      ? 0
      : getPassiveMultiplier(rollCardData.instrument.type);
  const rollHoldingValue =
    rollCardData && rollCardData.holding?.units
      ? rollCardData.holding.units * (rollCardData.price || 0)
      : 0;
  useEffect(() => {
    if (!rollCardData || rollCardData.type === 'deal' || rollCardData.type === 'event') {
      setRollTradeMode('buy');
      return;
    }
    setRollTradeMode(rollHoldingValue > 0 ? 'sell' : 'buy');
  }, [rollCardData?.type, rollCardData?.instrument?.id, rollHoldingValue]);
  const canSellHolding = rollHoldingValue > 0;
  const activeTradeMode = canSellHolding ? rollTradeMode : 'buy';
  const showBuyControls = !canSellHolding || activeTradeMode === 'buy';
  const showSellControls = canSellHolding && activeTradeMode === 'sell';

  useEffect(() => {
    setRollFeedback('');
    if (!rollCardData || rollCardData.type === 'deal' || rollCardData.type === 'event') {
      setRollBuyAmount(0);
      setRollSellAmount(0);
      return;
    }
    const minOrder = rollCardData.instrument.trading?.minOrder || 10;
    const maxSpend = Math.max(minOrder, Math.round(storeData.cash || 0));
    const initial = Math.min(maxSpend, Math.max(minOrder, Math.round(maxSpend * 0.35)));
    setRollBuyAmount(initial);
    if (rollCardData.holding && rollCardData.holding.units > 0) {
      const holdingValue = Math.max(0, rollCardData.holding.units * (rollCardData.price || 0));
      const baseSell = Math.round(Math.min(holdingValue, holdingValue * 0.5));
      setRollSellAmount(baseSell);
    } else {
      setRollSellAmount(0);
    }
  }, [rollCardData, storeData.cash]);

  useEffect(() => {
    if (!pendingSummary || !lastTurn) return;
    const summaryMonth = month - 1;
    if (summaryMonth < 0) {
      setPendingSummary(false);
      return;
    }
    const logs = (recentLog || []).filter((entry) => entry.month === summaryMonth);
    const incomes = Math.round((lastTurn.salary || 0) + (lastTurn.passiveIncome || 0));
    const expenses = Math.round(
      (lastTurn.livingCost || 0) + (lastTurn.recurringExpenses || 0) + (lastTurn.debtInterest || 0),
    );
    const net = incomes - expenses;
    setTurnSummary({
      month: summaryMonth,
      incomes,
      expenses,
      net,
      logs,
      event: currentEvent ? { ...currentEvent } : null,
    });
    setSummaryReady(true);
    setPendingSummary(false);
  }, [pendingSummary, month, lastTurn, recentLog, currentEvent]);

  useEffect(() => {
    if (rollCloseLoading || !pendingMetricDelta) return;
    setMetricAnimation(pendingMetricDelta);
    setPendingMetricDelta(null);
  }, [rollCloseLoading, pendingMetricDelta]);

  useEffect(() => {
    if (!metricAnimation) return undefined;
    const duration = 1800;
    const start = performance.now();
    setAnimatedMetrics(metricAnimation.prev);
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const frameValues = {};
      METRIC_DELTA_DEFS.forEach(({ key }) => {
        const from = metricAnimation.prev?.[key] ?? 0;
        const to = metricAnimation.next?.[key] ?? from;
        frameValues[key] = from + (to - from) * progress;
      });
      setAnimatedMetrics(frameValues);
      if (progress < 1) {
        metricAnimationFrameRef.current = requestAnimationFrame(step);
      } else {
        setAnimatedMetrics(null);
        setMetricAnimation(null);
      }
    };
    metricAnimationFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (metricAnimationFrameRef.current) {
        cancelAnimationFrame(metricAnimationFrameRef.current);
        metricAnimationFrameRef.current = null;
      }
    };
  }, [metricAnimation]);

  useEffect(() => {
    if (summaryReady && !diceAnimating && turnSummary) {
      if (outcomeState) {
        setTurnSummaryOpen(true);
      }
      setSummaryReady(false);
    }
  }, [summaryReady, diceAnimating, turnSummary, outcomeState]);

  const handleCloseSummary = () => {
    setTurnSummaryOpen(false);
    setTurnSummary(null);
  };
  const closeRollCard = () => {
    setRollCardOpen(false);
    setRollCard(null);
    setRollFeedback('');
    setRollCloseLoading(true);
    if (rollCloseTimerRef.current) {
      clearTimeout(rollCloseTimerRef.current);
    }
    rollCloseTimerRef.current = setTimeout(() => {
      setRollCloseLoading(false);
      rollCloseTimerRef.current = null;
      releaseFrozenMetrics({ animate: true });
    }, 450);
  };
  const handleRollBuy = () => {
    if (!rollCardData || !rollCardData.instrument) return;
    const minOrder = rollCardData.instrument.trading?.minOrder || 10;
    const amount = Math.min(Math.round(rollBuyAmount || 0), Math.round(storeData.cash || 0));
    if (amount < minOrder) {
      setRollFeedback('Недостаточно средств для покупки.');
      return;
    }
    const prevSnapshot =
      frozenMetrics || computeMetricSnapshotFromState(useGameStore.getState());
    buyInstrument(rollCardData.instrument.id, amount);
    queueMetricDelta(prevSnapshot);
    closeRollCard();
  };
  const handleRollSell = () => {
    if (!rollCardData || !rollCardData.instrument) return;
    const holding = rollCardData.holding;
    if (!holding || !holding.units) {
      setRollFeedback('Нет позиции для продажи.');
      return;
    }
    const maxValue = Math.round(holding.units * (rollCardData.price || 0));
    const amount = Math.min(Math.round(rollSellAmount || 0), maxValue);
    if (amount <= 0) {
      setRollFeedback('Выбери сумму продажи.');
      return;
    }
    const prevSnapshot =
      frozenMetrics || computeMetricSnapshotFromState(useGameStore.getState());
    sellInstrument(rollCardData.instrument.id, amount);
    queueMetricDelta(prevSnapshot);
    closeRollCard();
  };
  const handleRollDeal = () => {
    if (!rollCardData || rollCardData.type !== 'deal') return;
    const prevSnapshot =
      frozenMetrics || computeMetricSnapshotFromState(useGameStore.getState());
    const result = participateInDeal(rollCardData.deal);
    if (result?.error) {
      setRollFeedback(result.error);
      return;
    }
    queueMetricDelta(prevSnapshot);
    closeRollCard();
  };
  const handleTradeButtonClick = (mode) => {
    if (mode === 'sell') {
      if (canSellHolding && activeTradeMode !== 'sell') {
        setRollTradeMode('sell');
        return;
      }
      handleRollSell();
      return;
    }
    if (activeTradeMode !== 'buy') {
      setRollTradeMode('buy');
      return;
    }
    handleRollBuy();
  };
  const handleNewGameFromVictory = () => {
    if (transitionState !== 'idle') return;
    handleCloseSummary();
    beginTransition('Запускаем новую партию...');
    if (newGameTimerRef.current) {
      clearTimeout(newGameTimerRef.current);
    }
    newGameTimerRef.current = setTimeout(() => {
      resetGame();
      navigate('/app');
      completeTransition();
      newGameTimerRef.current = null;
    }, 650);
  };
  const startNextMoveLoader = (onFinish) => {
    setNextMoveLoading(true);
    if (nextMoveTimerRef.current) {
      clearTimeout(nextMoveTimerRef.current);
    }
    nextMoveTimerRef.current = setTimeout(() => {
      setNextMoveLoading(false);
      nextMoveTimerRef.current = null;
      if (typeof onFinish === 'function') {
        onFinish();
      }
    }, 400);
  };
  const handleContinue = () => {
    if (outcomeState === 'win') {
      setHideProgressCard(true);
    }
    acknowledgeOutcome();
    armTurnHighlight();
    handleCloseSummary();
    if (location.pathname !== '/app') {
      navigate('/app');
    }
    beginTransition('Переходим к следующему ходу');
    startNextMoveLoader(() => {
      completeTransition();
    });
  };
  const handleNewParty = () => {
    handleCloseSummary();
    beginTransition('Запускаем новую партию...');
    startNextMoveLoader(() => {
      completeTransition();
      resetGame();
      navigate('/');
    });
  };
  const modalFooter =
    outcomeState === 'win' ? (
      <div className={styles.outcomeFooter}>
        <Button
          variant="secondary"
          onClick={handleContinue}
          className={`${styles.summaryButton} ${styles.outcomeContinue}`}
        >
          Продолжить
        </Button>
        <Button
          variant="primary"
          onClick={handleNewGameFromVictory}
          className={`${styles.summaryButton} ${styles.outcomePrimary}`}
        >
          Новая игра
        </Button>
      </div>
    ) : outcomeState === 'lose' ? (
      <div className={styles.outcomeFooterSingle}>
        <Button
          variant="primary"
          onClick={handleNewParty}
          className={`${styles.summaryButton} ${styles.outcomePrimary}`}
        >
          Новая партия
        </Button>
      </div>
    ) : (
      <Button variant="primary" onClick={handleContinue} className={styles.nextMoveButton}>
        Кинуть кубик
      </Button>
    );
  const modalCloseHandler =
    outcomeState === 'lose' ? handleNewParty : outcomeState === 'win' ? handleContinue : handleCloseSummary;

  return (
    <div className={styles.layout}>
      <div className={styles.backdrop} />
      <header className={styles.headerBar}>
        <div className={styles.headerInfo}>
          <div className={styles.headerProfile}>
            <div className={styles.avatarWrap}>
              {professionImage ? (
                <img
                  src={professionImage}
                  alt={storeData.profession?.title || 'Профессия'}
                  className={styles.professionImage}
                />
              ) : (
                <div
                  className={styles.professionIcon}
                  style={spriteStyle(getProfessionIcon(storeData.profession))}
                />
              )}
            </div>
            <div className={styles.headerTitle}>
              <span className={styles.professionLabel}>Профессия</span>
              <strong className={styles.professionTitle}>{storeData.profession?.title || 'Профиль'}</strong>
            </div>
          </div>
          <div className={styles.headerStats}>
            <div>
              <span>Наличные</span>
              <strong>{formatMoney(displayedCash)}</strong>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.exitButton}
          onClick={() => {
            if (transitionState !== 'idle') return;
            beginTransition('Сохраняем прогресс');
            homeTimerRef.current = setTimeout(() => {
              navigate('/');
              homeTimerRef.current = null;
            }, 650);
          }}
          disabled={transitionState !== 'idle'}
          title="Домой"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 11L12 4L20 11V20H14V14H10V20H4V11Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path d="M9 20V14H15V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <main className={styles.content} ref={contentRef}>
        <Outlet context={outletContext} />
      </main>
      <BottomNav
        current={location.pathname}
        onChange={(path) => {
          setConfirmingFinish(false);
          navigate(path);
        }}
        onAdvance={handleAdvanceRequest}
        confirmingFinish={confirmingFinish}
        diceAnimating={diceAnimating}
        actionRef={confirmButtonRef}
        actionsCount={actionsCount}
      />
      <Modal
        open={turnSummaryOpen && Boolean(turnSummary)}
        onClose={modalCloseHandler}
        footer={modalFooter}
        hideOverlay
      >
        {turnSummary && (
          <>
            <div
              className={`${styles.turnIllustration} ${
                outcomeState ? styles.outcomeIllustration : ''
              }`}
            >
              <img src={outcomeImage} alt={outcomeAlt} />
            </div>
            {outcomeState ? (
              <div className={styles.outcomeContent}>
                <h3 className={styles.outcomeTitle}>{outcomeState === 'win' ? 'Победа!' : 'Поражение'}</h3>
                <p className={styles.outcomeDescription}>{outcomeMessage}</p>
              </div>
            ) : (
              <div className={styles.turnSummary}>
                <div className={styles.turnStats}>
                  <div>
                    <span>Доходы</span>
                    <strong className={styles.turnPositive}>{formatMoney(turnSummary.incomes)}</strong>
                  </div>
                  <div>
                    <span>Расходы</span>
                    <strong className={styles.turnNegative}>{formatMoney(turnSummary.expenses)}</strong>
                  </div>
                  <div>
                    <span>Итог</span>
                    <strong className={turnSummary.net >= 0 ? styles.turnPositive : styles.turnNegative}>
                      {turnSummary.net >= 0 ? '+' : '-'}${Math.abs(turnSummary.net).toLocaleString('en-US')}
                    </strong>
                  </div>
                </div>
                {turnSummary.event && (
                  (() => {
                    const eventMessage = getEventMessage(turnSummary.event);
                    const hasValue = typeof turnSummary.event.effect?.cashDelta === 'number';
                    const sanitizedText = hasValue
                      ? eventMessage.replace(/\$-?\d[\d,]*/g, '').trim()
                      : eventMessage;
                    const displayMessage = sanitizedText || eventMessage;
                    return (
                      <div className={styles.turnEvent}>
                        <strong>{turnSummary.event.title}</strong>
                        <p>{displayMessage}</p>
                        {typeof turnSummary.event.effect?.cashDelta === 'number' && (
                          <span className={styles.turnEventAmount}>
                            {formatMoney(turnSummary.event.effect.cashDelta)}
                          </span>
                        )}
                      </div>
                    );
                  })()
                )}
                <div className={styles.turnLog}>
                  <span>События хода</span>
                  <ul>
                    {turnSummary.logs.length ? (
                      turnSummary.logs.map((entry) => (
                        <li
                          key={entry.id}
                          className={entry.type === 'market' ? styles.turnLogWarning : undefined}
                        >
                          <p>{entry.text}</p>
                          {typeof entry.amount === 'number' && (
                            <span className={styles.turnEventAmount}>{formatMoney(entry.amount)}</span>
                          )}
                        </li>
                      ))
                    ) : (
                      <li className={styles.turnLogEmpty}>Ход прошёл без крупных событий.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal open={rollCardOpen && Boolean(rollCardData)} onClose={closeRollCard}>
        {rollCardData && (
          <Card className={styles.rollCard} glow={false}>
            <div className={styles.rollCardFrame}>
              <div className={styles.rollCardHeader}>
                <span className={styles.rollCardBadge}>
                {rollCardData.type === 'event'
                  ? 'Событие'
                  : rollCardData.type === 'deal'
                    ? 'Сделка'
                    : rollCardData.type === 'crypto'
                      ? 'Криптовалюта'
                      : 'Акции'}
                </span>
                <strong className={styles.rollCardTitle}>
                {rollCardData.type === 'event'
                  ? rollCardData.event?.title || 'Событие'
                  : rollCardData.type === 'deal'
                    ? rollCardData.deal.title
                    : rollCardData.instrument.title}
                </strong>
              </div>
            {rollCardData.type === 'event' ? (
              (() => {
                const message = getEventMessage(rollCardData.event);
                const cleanedMessage = (message || rollCardData.event?.description || '')
                  .replace(/\s*\([^)]*\)\s*/g, ' ')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
                const delta = rollCardData.event?.effect?.cashDelta;
                const isPositive = typeof delta === 'number' ? delta >= 0 : rollCardData.event?.type === 'positive';
                const effect = rollCardData.event?.effect || {};
                const effectEntries = [
                  typeof effect.cashDelta === 'number'
                    ? { label: 'Наличные', value: effect.cashDelta }
                    : null,
                  typeof effect.salaryBonusDelta === 'number'
                    ? { label: 'Зарплата', value: effect.salaryBonusDelta }
                    : null,
                  typeof effect.recurringDelta === 'number'
                    ? { label: 'Фикс. расходы', value: effect.recurringDelta }
                    : null,
                  typeof effect.debtDelta === 'number'
                    ? { label: 'Долг', value: effect.debtDelta }
                    : null,
                ].filter(Boolean);
                return (
                  <>
                    <p className={styles.rollCardDesc}>{cleanedMessage}</p>
                    {effectEntries.length > 0 ? (
                      <div className={styles.rollEventStats}>
                        {effectEntries.map((entry) => (
                          <div
                            key={entry.label}
                            className={`${styles.rollEventBadge} ${
                              entry.value >= 0 ? styles.rollEventPositive : styles.rollEventNegative
                            }`}
                          >
                            <span>{entry.label}</span>
                            <strong>
                              {entry.value >= 0 ? '+' : '-'}{formatUSD(Math.abs(entry.value))}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      typeof delta === 'number' && (
                        <div className={`${styles.rollCardAmount} ${isPositive ? styles.rollCardPositive : styles.rollCardNegative}`}>
                          {isPositive ? '+' : '-'}{formatUSD(Math.abs(delta))}
                        </div>
                      )
                    )}
                    <div className={`${styles.rollCardActions} ${styles.rollCardActionsSingle}`}>
                      <Button
                        variant="primary"
                        onClick={closeRollCard}
                        className={styles.rollCardPrimaryButton}
                      >
                        Ок
                      </Button>
                    </div>
                  </>
                );
              })()
            ) : rollCardData.type === 'deal' ? (
              <>
                <p className={styles.rollCardDesc}>{rollCardData.deal.description}</p>
                <div className={styles.rollCardFacts}>
                  <div>
                    <span>Вход</span>
                    <strong>{formatUSD(rollCardData.deal.entryCost)}</strong>
                  </div>
                  <div>
                    <span>Пассив</span>
                    <strong>{formatUSD(rollCardData.deal.monthlyPayout)}/мес</strong>
                  </div>
                  <div>
                    <span>Срок</span>
                    <strong>{rollCardData.deal.durationMonths} мес.</strong>
                  </div>
                </div>
                <p className={styles.rollCardHint}>{rollCardData.deal.riskNote}</p>
                {rollFeedback && <p className={styles.rollCardFeedback}>{rollFeedback}</p>}
                <div className={styles.rollCardActions}>
                  <Button
                    variant="primary"
                    onClick={handleRollDeal}
                    disabled={
                      !rollCardData.window ||
                      rollCardData.window.expiresIn <= 0 ||
                      (rollCardData.window.slotsLeft ?? 0) <= 0 ||
                      storeData.cash < rollCardData.deal.entryCost
                    }
                    className={styles.rollCardPrimaryButton}
                  >
                    Участвовать
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={closeRollCard}
                    className={`${styles.rollCardSecondaryButton} ${styles.rollCardIconButton}`}
                    ariaLabel="Отказаться"
                    title="Отказаться"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6L18 18M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.rollCardDesc}>
                  Средний диапазон: {formatUSD(rollCardData.range?.min)}–{formatUSD(rollCardData.range?.max)}
                </p>
                <div className={styles.rollCardPrice}>
                  Сейчас стоят <strong>{formatUSD(rollCardData.price)}</strong>
                </div>
                {rollCardData.holding && rollCardData.holding.units > 0 && (
                  <p className={styles.rollCardPassiveHint}>
                    В портфеле {rollCardData.holding.units.toFixed(2)} лотов ≈ {formatUSD(rollHoldingValue)}
                  </p>
                )}
                {showBuyControls && (
                  <div className={styles.rollCardSlider}>
                    <div>
                      <span>Сумма покупки</span>
                      <strong>{formatUSD(rollBuyAmount)}</strong>
                    </div>
                    {rollPassiveRate > 0 && (
                      <p className={styles.rollCardPassiveHint}>
                        Пассивный доход: {formatUSD(Math.round(rollBuyAmount * rollPassiveRate))}/мес
                      </p>
                    )}
                    <Slider
                      min={rollCardData.instrument.trading?.minOrder || 10}
                      max={Math.max(rollCardData.instrument.trading?.minOrder || 10, Math.round(storeData.cash || 0))}
                      step={1}
                      value={Math.min(rollBuyAmount, Math.max(rollCardData.instrument.trading?.minOrder || 10, Math.round(storeData.cash || 0)))}
                      onChange={(value) => setRollBuyAmount(Math.round(value))}
                      disabled={storeData.cash < (rollCardData.instrument.trading?.minOrder || 10)}
                      variant="rollCard"
                    />
                  </div>
                )}
                {showSellControls && (
                  <div className={styles.rollCardSlider}>
                    <div>
                      <span>Продать на</span>
                      <strong>{formatUSD(rollSellAmount)}</strong>
                    </div>
                    <Slider
                      min={0}
                      max={Math.max(0, Math.round(rollHoldingValue))}
                      step={1}
                      value={Math.min(rollSellAmount, Math.max(0, Math.round(rollHoldingValue)))}
                      onChange={(value) => setRollSellAmount(Math.round(value))}
                      disabled={rollHoldingValue <= 0}
                      variant="rollCard"
                    />
                  </div>
                )}
                {rollFeedback && <p className={styles.rollCardFeedback}>{rollFeedback}</p>}
                <div className={`${styles.rollCardActions} ${canSellHolding ? styles.rollCardActionsExpanded : ''}`}>
                  {canSellHolding && (
                    <Button
                      variant="secondary"
                      onClick={() => handleTradeButtonClick('sell')}
                      className={
                        activeTradeMode === 'sell'
                          ? styles.rollCardPrimaryButton
                          : styles.rollCardSecondaryButton
                      }
                    >
                      Продать
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => handleTradeButtonClick('buy')}
                    disabled={storeData.cash < (rollCardData.instrument.trading?.minOrder || 10)}
                    className={
                      activeTradeMode === 'buy'
                        ? styles.rollCardPrimaryButton
                        : styles.rollCardSecondaryButton
                    }
                  >
                    Купить
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={closeRollCard}
                    className={`${styles.rollCardSecondaryButton} ${styles.rollCardIconButton}`}
                    ariaLabel="Отказаться"
                    title="Отказаться"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6L18 18M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </Button>
                </div>
              </>
            )}
            </div>
          </Card>
        )}
      </Modal>
      {rollOverlay && (
        <div className={`${styles.nextMoveOverlay} ${styles.rollOverlay}`} aria-hidden="true">
          <TurnLoader message="Кидаю кубик..." previousValue={lastTurn?.diceRoll || 1} size="roll" />
        </div>
      )}
      {rollCloseLoading && (
        <div className={`${styles.nextMoveOverlay} ${styles.rollOverlay}`} aria-hidden="true">
          <div className={styles.nextMoveLoader}>
            <div className={styles.nextMoveProgress}>
              <span />
            </div>
          </div>
        </div>
      )}
      {nextMoveLoading && (
        <div className={styles.nextMoveOverlay} aria-hidden="true">
          <SimpleLoader message="Готовим следующий ход..." />
        </div>
      )}
    </div>
  );
}

export default MainLayout;
const PROFESSION_IMAGES = {
  teacher: teacherImg,
  programmer: devImg,
  lawyer: lawyerImg,
  dentist: doctorImg,
  firefighter: fireImg,
  sales_manager: managerImg,
};
