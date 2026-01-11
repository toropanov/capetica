import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import TopStats from '../components/TopStats';
import BottomNav from '../components/BottomNav';
import { calculateHoldingsValue, calculatePassiveIncome } from '../domain/finance';
import styles from './MainLayout.module.css';

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
  const storeData = useGameStore((state) => ({
    month: state.month,
    cash: state.cash,
    debt: state.debt,
    investments: state.investments,
    priceState: state.priceState,
    configs: state.configs,
    availableCredit: state.availableCredit,
    winCondition: state.winCondition,
    loseCondition: state.loseCondition,
  }));

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

  return (
    <div className={styles.layout}>
      <div className={styles.backdrop} />
      <TopStats
        month={storeData.month}
        netWorth={Math.max(netWorth, 0)}
        cash={Math.max(storeData.cash, 0)}
        passiveIncome={Math.max(passiveIncome, 0)}
        debt={Math.max(storeData.debt, 0)}
        availableCredit={Math.max(storeData.availableCredit || 0, 0)}
      />
      <StatusRibbon win={storeData.winCondition} lose={storeData.loseCondition} />
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav current={location.pathname} onChange={navigate} />
    </div>
  );
}

export default MainLayout;
