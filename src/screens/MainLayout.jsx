import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../store/gameStore';
import BottomNav from '../components/BottomNav';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './MainLayout.module.css';
import { spriteStyle, getProfessionIcon } from '../utils/iconSprite';

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
      month: state.month,
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

  const formatMoney = (value) => {
    const rounded = Math.round(value);
    return `${rounded < 0 ? '-$' : '$'}${Math.abs(rounded).toLocaleString('en-US')}`;
  };
  return (
    <div className={styles.layout}>
      <div className={styles.backdrop} />
      <header className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <div
            className={styles.avatar}
            style={spriteStyle(getProfessionIcon(storeData.profession))}
          />
          <div>
            <span>{storeData.profession?.title || 'Профиль'}</span>
            <strong>Месяц {storeData.month}</strong>
          </div>
        </div>
        <div className={styles.headerRight}>
          <strong>{formatMoney(netWorth)}</strong>
          <button
            type="button"
            className={styles.exitButton}
            onClick={() => navigate('/choose')}
            title="Сменить роль"
          >
            ↺
          </button>
        </div>
      </header>
      <StatusRibbon win={storeData.winCondition} lose={storeData.loseCondition} />
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav current={location.pathname} onChange={navigate} />
    </div>
  );
}

export default MainLayout;
