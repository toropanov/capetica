import { useMemo, useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../store/gameStore';
import BottomNav from '../components/BottomNav';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './MainLayout.module.css';
import { spriteStyle, getProfessionIcon } from '../utils/iconSprite';
import teacherImg from '../assets/proffesions/teacher.png';
import devImg from '../assets/proffesions/dev.png';
import lawyerImg from '../assets/proffesions/low.png';
import doctorImg from '../assets/proffesions/doctor.png';
import fireImg from '../assets/proffesions/fire.png';
import managerImg from '../assets/proffesions/manager.png';
import Modal from '../components/Modal';

function StatusRibbon({ win, lose }) {
  if (!win && !lose) return null;
  const isWin = Boolean(win);
  const text = isWin ? `Победа: ${win.id}` : `Поражение: ${lose.id}`;
  return (
    <div className={`${styles.ribbon} ${isWin ? styles.win : styles.lose}`}>
      <span>{text}</span>
    </div>
  );
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
    })),
  );
  const advanceMonth = useGameStore((state) => state.advanceMonth);
  const actionsCount = useGameStore((state) => state.actionsThisTurn || 0);
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
  const confirmButtonRef = useRef(null);
  const contentRef = useRef(null);
  const diceTimerRef = useRef(null);

  useEffect(() => () => {
    if (diceTimerRef.current) {
      clearTimeout(diceTimerRef.current);
    }
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
    setConfirmingFinish(false);
    setDiceAnimating(true);
    advanceMonth();
    setPendingSummary(true);
    if (diceTimerRef.current) {
      clearTimeout(diceTimerRef.current);
    }
    diceTimerRef.current = setTimeout(() => {
      setDiceAnimating(false);
    }, 1300);
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
    const mood =
      currentEvent?.type === 'negative' || net < 0
        ? 'negative'
        : currentEvent?.type === 'positive' || net >= 0
          ? 'positive'
          : 'neutral';
    setTurnSummary({
      month: summaryMonth,
      incomes,
      expenses,
      net,
      logs,
      event: currentEvent ? { ...currentEvent } : null,
      stopLoss: lastTurn.stopLossWarnings || [],
      mood,
    });
    setSummaryReady(true);
    setPendingSummary(false);
  }, [pendingSummary, month, lastTurn, recentLog, currentEvent]);

  useEffect(() => {
    if (summaryReady && !diceAnimating && turnSummary) {
      setTurnSummaryOpen(true);
      setSummaryReady(false);
    }
  }, [summaryReady, diceAnimating, turnSummary]);

  const handleCloseSummary = () => {
    setTurnSummaryOpen(false);
    setTurnSummary(null);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.backdrop} />
      <header className={styles.headerBar}>
        <div className={styles.headerInfo}>
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
          <div className={styles.headerStats}>
            <div>
              <span>Наличные</span>
              <strong>{formatMoney(storeData.cash)}</strong>
            </div>
            <div>
              <span>Расходы</span>
              <strong>{formatMoney(storeData.recurringExpenses)}</strong>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.exitButton}
          onClick={() => navigate('/choose')}
          title="Сменить роль"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 7H19L18 21H6L5 7Z"
              stroke="#1f2d4a"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M9 7V4H15V7" stroke="#1f2d4a" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10 11V18" stroke="#1f2d4a" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M14 11V18" stroke="#1f2d4a" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <StatusRibbon win={storeData.winCondition} lose={storeData.loseCondition} />
      <main className={styles.content} ref={contentRef}>
        <Outlet />
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
        onClose={handleCloseSummary}
        title={turnSummary ? `Итоги хода M${turnSummary.month}` : ''}
        footer={
          <button type="button" className={styles.summaryButton} onClick={handleCloseSummary}>
            Продолжить
          </button>
        }
      >
        {turnSummary && (
          <div className={styles.turnSummary}>
            <div
              className={`${styles.turnMood} ${
                turnSummary.mood === 'negative' ? styles.turnMoodNegative : styles.turnMoodPositive
              }`}
            >
              {turnSummary.mood === 'negative' ? '🙁 Невесёлый ход' : '🎉 Удачный ход'}
            </div>
            {turnSummary.event && (
              <div className={styles.turnEvent}>
                <strong>{turnSummary.event.title}</strong>
                <p>{turnSummary.event.message || turnSummary.event.description}</p>
              </div>
            )}
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
            {turnSummary.stopLoss?.length > 0 && (
              <div className={styles.turnWarnings}>
                <span>Авто-стоп-лосс</span>
                <ul>
                  {turnSummary.stopLoss.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.turnLog}>
              <span>События хода</span>
              <ul>
                {turnSummary.logs.length ? (
                  turnSummary.logs.map((entry) => (
                    <li key={entry.id}>
                      <strong>M{entry.month}</strong>
                      <p>{entry.text}</p>
                    </li>
                  ))
                ) : (
                  <li className={styles.turnLogEmpty}>Ход прошёл без крупных событий.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Modal>
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
