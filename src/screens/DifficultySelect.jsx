import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import { DIFFICULTY_OPTIONS } from '../utils/goals';
import styles from './ProfessionSelect.module.css';

function DifficultySelect() {
  const navigate = useNavigate();
  const difficulty = useGameStore((state) => state.difficulty);
  const setDifficulty = useGameStore((state) => state.setDifficulty);

  const ordered = useMemo(() => [...DIFFICULTY_OPTIONS], []);

  return (
    <div className={styles.selectionPage}>
      <div className={styles.selectionHeader}>
        <div>
          <h1>Сложность</h1>
          <p className={styles.selectionDescription}>Выбери частоту событий и стресс-фактор.</p>
        </div>
        <button type="button" className={styles.selectionBack} onClick={() => navigate('/')}>
          Назад
        </button>
      </div>
      <Card className={styles.panelCard}>
        <div className={styles.optionListCenter}>
          {ordered.map((option) => (
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
    </div>
  );
}

export default DifficultySelect;
