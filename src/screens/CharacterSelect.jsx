import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import ProfessionCard from '../components/ProfessionCard';
import styles from './ProfessionSelect.module.css';
import { DIFFICULTY_OPTIONS, summarizeGoal } from '../utils/goals';

function CharacterSelect() {
  const navigate = useNavigate();
  const professions = useGameStore((state) => state.configs?.professions?.professions || []);
  const selectProfession = useGameStore((state) => state.selectProfession);
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const difficulty = useGameStore((state) => state.difficulty);
  const setSelectedGoal = useGameStore((state) => state.setSelectedGoal);
  const setDifficulty = useGameStore((state) => state.setDifficulty);
  const randomProfession = useGameStore((state) => state.randomProfession);
  const [rolling, setRolling] = useState(false);
  const winRules = useGameStore((state) => state.configs?.rules?.win || []);

  const orderedProfessions = useMemo(
    () => [...professions].sort((a, b) => a.salaryMonthly - b.salaryMonthly),
    [professions],
  );

  const strategyLabel = summarizeGoal(winRules.find((rule) => rule.id === selectedGoalId)).title;

  const goalButtons = useMemo(
    () =>
      winRules.map((rule) => {
        const summary = summarizeGoal(rule);
        return {
          id: rule.id,
          label: summary.title,
          detail: summary.detail,
        };
      }),
    [winRules],
  );

  const handleSelect = (professionId) => {
    selectProfession(professionId, { goalId: selectedGoalId, difficulty });
    navigate('/app');
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
    <div className={styles.selectionPage}>
      <div className={styles.selectionHeader}>
        <div className={styles.selectionHero}>
          <p className={styles.heroTag}>Настройки партии</p>
          <h1>
            С чего начнётся
            <br />
            твоя история
          </h1>
          <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
        </div>
      </div>
      <Card className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <h2>Стратегия партии</h2>
        </div>
        <div className={styles.optionListCenter}>
          {goalButtons.map((rule) => (
            <button
              key={rule.id}
              type="button"
              className={`${styles.optionButton} ${selectedGoalId === rule.id ? styles.optionButtonActive : ''}`}
              onClick={() => setSelectedGoal(rule.id)}
            >
              <strong>{rule.label}</strong>
              <small>{rule.detail}</small>
            </button>
          ))}
        </div>
      </Card>
      <Card className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <h2>Сложность</h2>
        </div>
        <div className={styles.optionListCenter}>
          {DIFFICULTY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.optionButton} ${difficulty === option.id ? styles.optionButtonActive : ''}`}
              onClick={() => setDifficulty(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </Card>
      <div className={styles.characterGrid}>
        {orderedProfessions.map((profession) => (
          <ProfessionCard
            key={profession.id}
            profession={profession}
            onSelect={() => handleSelect(profession.id)}
          />
        ))}
      </div>
      <div className={styles.diceSection}>
        <GradientButton
          icon="🎲"
          rolling={rolling}
          onClick={handleRandom}
          size="compact"
          ariaLabel="Случайный выбор"
        >
          Случайный выбор
        </GradientButton>
        <p className={styles.heroDiceHint}>Кубик тут нужен, чтобы подобрать случайного героя.</p>
      </div>
    </div>
  );
}

export default CharacterSelect;
