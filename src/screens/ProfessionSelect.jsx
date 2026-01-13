import { useState } from 'react';
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

  return (
    <div className={styles.screen}>
      <div
        className={styles.heroPoster}
        style={{ backgroundImage: `url(${introImg})` }}
        role="img"
        aria-label="Кем ты стартуешь в Capetica?"
      />
      <div className={styles.hero}>
        <p className={styles.heroTag}>Стартуем</p>
        <h1>
          С чего начнётся
          <br />
          твоя история
        </h1>
        <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
      </div>
      <div className={styles.heroActions}>
        {availableButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            className={`${styles.heroButton} ${
              button.variant === 'primary' ? styles.heroPrimary : styles.heroSecondary
            }`}
            onClick={() => handleAction(button.action)}
          >
            {button.label}
          </button>
        ))}
      </div>
      <div className={styles.heroDice}>
        <GradientButton icon="🎲" rolling={rolling} onClick={handleRandom} size="compact" ariaLabel="Случайный выбор">
          Случайный выбор
        </GradientButton>
        <p className={styles.heroDiceHint}>Генерируй случайную профессию и стартуй моментально.</p>
      </div>
    </div>
  );
}

export default ProfessionSelect;
