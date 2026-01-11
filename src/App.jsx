import { useEffect, useState, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useGameStore from './store/gameStore';
import ProfessionSelect from './screens/ProfessionSelect';
import MainLayout from './screens/MainLayout';
import Home from './screens/Home';
import Investments from './screens/Investments';
import Deals from './screens/Deals';
import styles from './styles/AppShell.module.css';

const CONFIG_FILES = [
  { key: 'professions', path: '/config/professions.json' },
  { key: 'markets', path: '/config/markets.json' },
  { key: 'instruments', path: '/config/instruments.json' },
  { key: 'rules', path: '/config/game_rules.json' },
];

function GuardedLayout() {
  const professionId = useGameStore((state) => state.professionId);
  if (!professionId) {
    return <Navigate to="/choose" replace />;
  }
  return <MainLayout />;
}

function Loader({ message }) {
  return (
    <div className={styles.loader}>
      <div className={styles.loaderGlow} />
      <div className={styles.loaderCard}>
        <p>{message}</p>
        <div className={styles.loaderSparkle} />
      </div>
    </div>
  );
}

function App() {
  const configsReady = useGameStore((state) => state.configsReady);
  const professionId = useGameStore((state) => state.professionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const bootstrapRef = useRef(useGameStore.getState().bootstrapFromConfigs);

  useEffect(() => {
    let mounted = true;
    async function loadConfigs() {
      try {
        const entries = await Promise.all(
          CONFIG_FILES.map((cfg) =>
            fetch(cfg.path).then((res) => {
              if (!res.ok) {
                throw new Error(`fetch ${cfg.path} failed`);
              }
              return res.json();
            }),
          ),
        );
        const bundle = entries.reduce((acc, payload, index) => {
          acc[CONFIG_FILES[index].key] = payload;
          return acc;
        }, {});
        if (mounted) {
          bootstrapRef.current?.(bundle);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError('Не удалось загрузить конфиги. Проверь оффлайн ассеты.');
          setLoading(false);
        }
      }
    }
    loadConfigs();
    return () => {
      mounted = false;
    };
  }, []);

  const initialRedirect = useMemo(() => {
    if (professionId) return '/app';
    return '/choose';
  }, [professionId]);

  if (loading || !configsReady) {
    return <Loader message="Загружаем неоморфные карты..." />;
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Перезагрузить
        </button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/choose" element={<ProfessionSelect />} />
        <Route path="/app" element={<GuardedLayout />}>
          <Route index element={<Home />} />
          <Route path="bank" element={<Investments />} />
          <Route path="deals" element={<Deals />} />
        </Route>
        <Route path="*" element={<Navigate to={initialRedirect} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
