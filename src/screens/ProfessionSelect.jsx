import { useLayoutEffect, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import GradientButton from '../components/GradientButton';
import styles from './ProfessionSelect.module.css';
import introImg from '../assets/intro_ru.png';

const HERO_BUTTONS = [
  { key: 'continue', label: 'Продолжить', action: 'continue', variant: 'primary', requiresActive: true },
  { key: 'newGame', label: 'Новая игра', action: 'newGame', variant: 'secondary' },
  { key: 'settings', label: 'Настройки', action: 'settings', variant: 'secondary' },
];

function ProfessionSelect() {
  const navigate = useNavigate();
  const professionId = useGameStore((state) => state.professionId);
  const resetGame = useGameStore((state) => state.resetGame);
  const randomProfession = useGameStore((state) => state.randomProfession);
  const settingsDirty = useGameStore((state) => state.settingsDirty);
  const hideContinueAfterSettings = useGameStore((state) => state.hideContinueAfterSettings);
  const transitionState = useGameStore((state) => state.transitionState);
  const transitionMessage = useGameStore((state) => state.transitionMessage);
  const beginTransition = useGameStore((state) => state.beginTransition);
  const [rolling, setRolling] = useState(false);
  const transitionTimerRef = useRef(null);

  const availableButtons = HERO_BUTTONS.filter((button) => {
    if (button.key === 'continue' && (settingsDirty || hideContinueAfterSettings)) {
      return false;
    }
    return !button.requiresActive || Boolean(professionId);
  });
  const hasContinue = availableButtons.some((button) => button.key === 'continue');

  const handleAction = (action) => {
    switch (action) {
      case 'continue':
        if (settingsDirty) return;
        if (transitionState !== 'idle') return;
        beginTransition('Возвращаемся к партии...');
        transitionTimerRef.current = setTimeout(() => {
          navigate('/app');
          transitionTimerRef.current = null;
        }, 650);
        break;
      case 'newGame':
        if (transitionState !== 'idle') return;
        beginTransition('Запускаем новую партию...');
        transitionTimerRef.current = setTimeout(() => {
          resetGame();
          navigate('/app');
          transitionTimerRef.current = null;
        }, 650);
        break;
      case 'settings':
        navigate('/character');
        break;
      default:
        break;
    }
  };

  const handleRandom = () => {
        if (rolling || transitionState !== 'idle') return;
        setRolling(true);
        beginTransition('Выбираем профессию...');
    transitionTimerRef.current = setTimeout(() => {
      randomProfession();
      navigate('/app');
      setRolling(false);
      transitionTimerRef.current = null;
    }, 650);
  };

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const updateScrollLock = () => {
      const fits = document.documentElement.scrollHeight <= window.innerHeight;
      document.body.style.overflowY = fits ? 'hidden' : 'auto';
      document.body.style.overscrollBehavior = fits ? 'none' : 'contain';
    };
    updateScrollLock();
    window.addEventListener('resize', updateScrollLock);
    return () => {
      document.body.style.overflowY = 'auto';
      document.body.style.overscrollBehavior = 'contain';
      window.removeEventListener('resize', updateScrollLock);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePop = (event) => {
      if (window.location.pathname === '/') {
        event.preventDefault();
        window.history.pushState(null, '', '/');
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
    };
  }, []);

  return (
    <div className={styles.screen}>
      <div
        className={styles.heroPoster}
        style={{ backgroundImage: `url(${introImg})` }}
        role="img"
        aria-label="Кем ты стартуешь в Capetica?"
      />
      <div className={styles.hero}>
        <h1>
          С чего начнётся
          <br />
          история?
        </h1>
        <span>Профессия. Доходы. Расходы. Каждый шаг имеет значение!</span>
      </div>
      <div className={styles.heroActions}>
        {availableButtons.map((button) => {
          const isContinue = button.key === 'continue';
          const shouldAccent = isContinue || (!hasContinue && button.key === 'newGame');
          const variantClass = shouldAccent ? styles.heroContinue : styles.heroSecondary;
          const isBusy = transitionState !== 'idle';
          const disabled = isBusy || (isContinue && settingsDirty);
          const className = `${styles.heroButton} ${variantClass}`;
          return (
            <button
              key={button.key}
              type="button"
              className={className}
              onClick={() => handleAction(button.action)}
              disabled={disabled}
            >
              {button.label}
            </button>
          );
        })}
      </div>
      <div className={styles.heroDice}>
        <GradientButton
          icon="🎲"
          rolling={rolling || transitionState === 'running'}
          onClick={handleRandom}
          size="compact"
          ariaLabel="Случайная профессия"
          className={styles.heroDiceButton}
          disabled={transitionState !== 'idle'}
        >
          Случайная профессия
        </GradientButton>
      </div>
    </div>
  );
}

export default ProfessionSelect;
