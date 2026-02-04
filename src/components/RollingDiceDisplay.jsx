import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './RollingDiceDisplay.module.css';

const SCENARIOS = [
  {
    id: 'steady-income',
    title: 'Спокойный доход',
    description: 'Зарплата приходит вовремя, игра идёт по плану.',
  },
  {
    id: 'market-chance',
    title: 'Рыночный шанс',
    description: 'Появляется выгодная сделка, если хватает смелости.',
  },
  {
    id: 'unexpected-tax',
    title: 'Налоговая проверка',
    description: 'Срочные выплаты снижают запас наличности.',
  },
  {
    id: 'education',
    title: 'Обучение',
    description: 'Инвестируешь в навыки, чтобы увеличить доход в будущем.',
  },
  {
    id: 'lifestyle',
    title: 'Стиль жизни',
    description: 'Приятные траты на мечты и желания.',
  },
  {
    id: 'dividends',
    title: 'Дивиденды',
    description: 'Пассивный доход усиливает финансовый поток.',
  },
];

const clampToDiceValue = (seed) => {
  if (typeof seed !== 'number' || Number.isNaN(seed)) {
    return Math.floor(Math.random() * 6) + 1;
  }
  const normalized = Math.abs(Math.round(seed)) % 6;
  return normalized + 1;
};

const REPEATED_SCENARIOS = [...SCENARIOS, ...SCENARIOS, ...SCENARIOS];
const WINDOW_RADIUS = 2;

function RollingDiceDisplay({ seed, previousSeed }) {
  const targetValue = useMemo(() => clampToDiceValue(seed), [seed]);
  const previousValue = useMemo(
    () => clampToDiceValue(typeof previousSeed === 'number' ? previousSeed : seed - 1),
    [previousSeed, seed],
  );
  const [rolling, setRolling] = useState(false);
  const [throwing, setThrowing] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(previousValue - 1);
  const [activeIndex, setActiveIndex] = useState(previousValue - 1);
  const [displayValue, setDisplayValue] = useState(previousValue);
  const timersRef = useRef([]);
  const sliderCycleRef = useRef(null);
  const faceCycleRef = useRef(null);

  const stopSliderCycle = () => {
    if (sliderCycleRef.current) {
      clearInterval(sliderCycleRef.current);
      sliderCycleRef.current = null;
    }
  };

  const stopFaceCycle = () => {
    if (faceCycleRef.current) {
      clearInterval(faceCycleRef.current);
      faceCycleRef.current = null;
    }
  };

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    stopSliderCycle();
    stopFaceCycle();
    setSliderIndex(previousValue - 1);
    setActiveIndex(previousValue - 1);
    setDisplayValue(previousValue);
    setRolling(false);
    setThrowing(false);

    const addTimer = (callback, delay) => {
      const timer = setTimeout(callback, delay);
      timersRef.current.push(timer);
    };

    addTimer(() => {
      setRolling(true);
      faceCycleRef.current = setInterval(() => {
        setDisplayValue((prev) => {
          const next = Math.floor(Math.random() * 6) + 1;
          return next === prev ? ((next % 6) + 1) : next;
        });
      }, 200);
      sliderCycleRef.current = setInterval(() => {
        setSliderIndex(Math.floor(Math.random() * SCENARIOS.length));
      }, 240);
    }, 140);

    addTimer(() => {
      stopSliderCycle();
      stopFaceCycle();
      setSliderIndex(targetValue - 1);
      setDisplayValue(targetValue);
    }, 1050);

    addTimer(() => {
      setRolling(false);
      setThrowing(true);
    }, 1350);

    addTimer(() => {
      setThrowing(false);
      setActiveIndex(targetValue - 1);
    }, 1950);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      stopSliderCycle();
      stopFaceCycle();
    };
  }, [previousValue, targetValue]);

  const safeSliderIndex = Math.max(0, Math.min(SCENARIOS.length - 1, sliderIndex));
  const safeActiveIndex = Math.max(0, Math.min(SCENARIOS.length - 1, activeIndex));
  const sliderPosition = safeSliderIndex + SCENARIOS.length;
  const activePosition = safeActiveIndex + SCENARIOS.length;
  const infoIndex = rolling || throwing ? safeSliderIndex : safeActiveIndex;
  const infoScenario = SCENARIOS[infoIndex] || SCENARIOS[0];
  const isAnimating = rolling || throwing;
  const highlightPosition = isAnimating ? sliderPosition : activePosition;
  const cubeShowClass = styles[`cubeShow${displayValue}`] || styles.cubeShow1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.scenarioFrame}>
        <div className={styles.scenarioViewport}>
          <div
            className={`${styles.scenarioTrack} ${rolling ? styles.trackRolling : ''}`}
            style={{ '--slider-index': sliderPosition }}
          >
            {REPEATED_SCENARIOS.map((scenario, index) => {
              const offset = index - highlightPosition;
              const absOffset = Math.abs(offset);
              let stateClass = styles.cardHidden;
              if (absOffset <= WINDOW_RADIUS) {
                if (offset === 0) {
                  stateClass = styles.cardActive;
                } else if (absOffset === 1) {
                  stateClass = styles.cardNear;
                } else {
                  stateClass = styles.cardFar;
                }
              }
              return (
                <article
                  key={`${scenario.id}-${index}`}
                  className={`${styles.scenarioCard} ${stateClass}`}
                  aria-hidden={absOffset > WINDOW_RADIUS}
                >
                  <span className={styles.cardLabel}>Сценарий {(index % SCENARIOS.length) + 1}</span>
                  <strong>{scenario.title}</strong>
                  <p>{scenario.description}</p>
                </article>
              );
            })}
          </div>
        </div>
        <div className={styles.scenarioIndicator}>
          <div
            className={`${styles.indicatorTrack} ${isAnimating ? styles.indicatorRolling : ''}`}
            style={{ '--indicator-index': sliderIndex }}
          >
            <span />
          </div>
        </div>
        <div className={styles.diceWrap}>
          <div
            className={`${styles.cube} ${cubeShowClass} ${throwing ? styles.cubeThrow : ''}`}
            aria-live="polite"
          >
            <div className={`${styles.cubeFace} ${styles.faceTop}`} />
            <div className={`${styles.cubeFace} ${styles.faceFront}`} />
            <div className={`${styles.cubeFace} ${styles.faceLeft}`} />
            <div className={`${styles.cubeFace} ${styles.faceBack}`} />
            <div className={`${styles.cubeFace} ${styles.faceRight}`} />
            <div className={`${styles.cubeFace} ${styles.faceBottom}`} />
          </div>
        </div>
      </div>
      <div className={styles.scenarioInfo}>
        <span>{isAnimating ? 'Выбираем событие...' : 'Выбранное событие'}</span>
        <strong>{infoScenario.title}</strong>
        <p>{infoScenario.description}</p>
      </div>
    </div>
  );
}

export default RollingDiceDisplay;
