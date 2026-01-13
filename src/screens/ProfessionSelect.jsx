import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import styles from './ProfessionSelect.module.css';
import introImg from '../assets/intro_ru.png';
import { DIFFICULTY_OPTIONS, summarizeGoal } from '../utils/goals';

const HERO_BUTTONS = [
  { key: 'continue', label: 'Продолжить', target: '/app', variant: 'primary', summaryKey: null, requiresActive: true },
  { key: 'newGame', label: 'Новая игра', target: '/character', variant: 'secondary', summaryKey: null },
  { key: 'strategy', label: 'Стратегия партии', target: '/strategy', variant: 'secondary', summaryKey: 'strategy' },
  { key: 'difficulty', label: 'Сложность', target: '/difficulty', variant: 'secondary', summaryKey: 'difficulty' },
  { key: 'character', label: 'Персонаж', target: '/character', variant: 'secondary', summaryKey: 'character' },
];

function ProfessionSelect() {
  const navigate = useNavigate();
  const profession = useGameStore((state) => state.profession);
  const professionId = useGameStore((state) => state.professionId);
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const difficulty = useGameStore((state) => state.difficulty);
  const winRules = useGameStore((state) => state.configs?.rules?.win || []);

  const selectedGoal = useMemo(
    () => winRules.find((rule) => rule.id === selectedGoalId),
    [winRules, selectedGoalId],
  );
  const strategyLabel = selectedGoal ? summarizeGoal(selectedGoal).title : 'Не выбрано';
  const difficultyLabel =
    DIFFICULTY_OPTIONS.find((option) => option.id === difficulty)?.label || 'Стандарт';
  const characterLabel = profession?.title || 'Не выбран';
  const summaryTexts = {
    strategy: strategyLabel,
    difficulty: difficultyLabel,
    character: characterLabel,
  };

  const buttons = HERO_BUTTONS.filter(
    (button) => !button.requiresActive || Boolean(professionId),
  ).map((button) => ({
    ...button,
    summary: button.summaryKey ? summaryTexts[button.summaryKey] : null,
  }));

  return (
    <div className={styles.screen}>
      <div
        className={styles.heroPoster}
        style={{ backgroundImage: `url(${introImg})` }}
        role="img"
        aria-label="Кем ты стартуешь в Capetica?"
      />
      <div className={styles.hero}>
        <p>Выбери роль</p>
        <h1>С чего начнётся твоя история?</h1>
        <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
      </div>
      <div className={styles.heroActions}>
        {buttons.map((button) => (
          <button
            key={button.key}
            type="button"
            className={`${styles.heroButton} ${
              button.variant === 'primary' ? styles.heroPrimary : styles.heroSecondary
            }`}
            onClick={() => navigate(button.target)}
          >
            <span>{button.label}</span>
            {button.summary && <small className={styles.heroSummary}>{button.summary}</small>}
          </button>
        ))}
      </div>
      <div className={styles.selectionSummary}>
        <div className={styles.selectionSummaryItem}>
          <strong>Стратегия партии</strong>
          <span>{strategyLabel}</span>
        </div>
        <div className={styles.selectionSummaryItem}>
          <strong>Сложность</strong>
          <span>{difficultyLabel}</span>
        </div>
        <div className={styles.selectionSummaryItem}>
          <strong>Персонаж</strong>
          <span>{characterLabel}</span>
        </div>
      </div>
    </div>
  );
}

export default ProfessionSelect;
