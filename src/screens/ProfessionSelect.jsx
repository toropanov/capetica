import { useLayoutEffect, useEffect, useState } from 'react';
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
  const [rolling, setRolling] = useState(false);

  const availableButtons = HERO_BUTTONS.filter((button) => !button.requiresActive || Boolean(professionId));
  const hasContinue = availableButtons.some((button) => button.key === 'continue');

  const handleAction = (action) => {
    switch (action) {
      case 'continue':
        navigate('/app');
        break;
      case 'newGame':
        resetGame();
        navigate('/app');
        break;
      case 'settings':
        navigate('/character');
        break;
      default:
        break;
    }
  };

  const handleRandom = () => {
    if (rolling) return;
    setRolling(true);
    randomProfession();
    navigate('/app');
    setTimeout(() => {
      setRolling(false);
    }, 750);
  };

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
          твоя история?
        </h1>
        <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
      </div>
      <div className={styles.heroActions}>
        {availableButtons.map((button) => {
          const isContinue = button.key === 'continue';
          const shouldAccent = isContinue || (!hasContinue && button.key === 'newGame');
          const variantClass = shouldAccent ? styles.heroContinue : styles.heroSecondary;
          return (
            <button
              key={button.key}
              type="button"
              className={`${styles.heroButton} ${variantClass}`}
              onClick={() => handleAction(button.action)}
            >
              {button.label}
            </button>
          );
        })}
      </div>
      <div className={styles.heroDice}>
        <GradientButton
          icon="🎲"
          rolling={rolling}
          onClick={handleRandom}
          size="compact"
          ariaLabel="Случайный выбор"
          className={styles.heroDiceButton}
        >
          Случайный выбор
        </GradientButton>
      </div>
    </div>
  );
}

export default ProfessionSelect;
