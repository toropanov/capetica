import { useMemo, useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../store/gameStore';
import BottomNav from '../components/BottomNav';
import Button from '../components/Button';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
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
    if (summaryReady && !diceAnimating && turnSummary) {
      setTurnSummaryOpen(true);
      setSummaryReady(false);
    }
  }, [summaryReady, diceAnimating, turnSummary]);

  const handleCloseSummary = () => {
    setTurnSummaryOpen(false);
    setTurnSummary(null);
  };
  const acknowledgeOutcome = useGameStore((state) => state.acknowledgeOutcome);
  const handleContinue = () => {
    handleCloseSummary();
    acknowledgeOutcome();
  };
  const handleNewParty = () => {
    handleCloseSummary();
    navigate('/');
  };

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
  const modalFooter =
    outcomeState === 'win' ? (
      <div className={styles.outcomeFooter}>
        <Button
          variant="secondary"
          onClick={handleContinue}
          className={styles.summaryButton}
        >
          Продолжить
        </Button>
        <Button variant="primary" onClick={handleNewParty} className={styles.summaryButton}>
          Новая партия
        </Button>
      </div>
    ) : outcomeState === 'lose' ? (
      <div className={styles.outcomeFooterSingle}>
        <Button variant="primary" onClick={handleNewParty} className={styles.summaryButton}>
          Новая партия
        </Button>
      </div>
    ) : (
      <Button variant="primary" onClick={handleContinue} className={styles.nextMoveButton}>
        Следующий ход
      </Button>
    );
  const modalCloseHandler =
    outcomeState === 'lose' ? handleNewParty : outcomeState === 'win' ? handleContinue : handleCloseSummary;

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
          onClick={() => navigate('/')}
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
        title="Завершение хода"
        open={turnSummaryOpen && Boolean(turnSummary)}
        onClose={modalCloseHandler}
        footer={modalFooter}
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
                {turnSummary.event && (
                  <div className={styles.turnEvent}>
                    <strong>{turnSummary.event.title}</strong>
                    <p>{getEventMessage(turnSummary.event)}</p>
                    {typeof turnSummary.event.effect?.cashDelta === 'number' && (
                      <span className={styles.turnEventAmount}>
                        {formatMoney(turnSummary.event.effect.cashDelta)}
                      </span>
                    )}
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
