import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import ProfessionCard from '../components/ProfessionCard';
import styles from './ProfessionSelect.module.css';

function CharacterSelect() {
  const navigate = useNavigate();
  const professions = useGameStore((state) => state.configs?.professions?.professions || []);
  const selectProfession = useGameStore((state) => state.selectProfession);
  const difficulty = useGameStore((state) => state.difficulty);
  const goalId = useGameStore((state) => state.selectedGoalId);

  const ordered = useMemo(
    () => [...professions].sort((a, b) => a.salaryMonthly - b.salaryMonthly),
    [professions],
  );

  const handleSelect = (professionId) => {
    selectProfession(professionId, { goalId, difficulty });
    navigate('/app');
  };

  return (
    <div className={styles.selectionPage}>
      <div className={styles.selectionHeader}>
        <div>
          <h1>Персонаж</h1>
          <p className={styles.selectionDescription}>Выбери профессию и начни новую главу.</p>
        </div>
        <button type="button" className={styles.selectionBack} onClick={() => navigate('/')}>
          Назад
        </button>
      </div>
      <div className={styles.characterGrid}>
        {ordered.map((profession) => (
          <ProfessionCard key={profession.id} profession={profession} onSelect={() => handleSelect(profession.id)} />
        ))}
      </div>
    </div>
  );
}

export default CharacterSelect;
