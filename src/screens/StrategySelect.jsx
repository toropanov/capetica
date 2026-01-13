import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import { summarizeGoal } from '../utils/goals';
import styles from './ProfessionSelect.module.css';

function StrategySelect() {
  const navigate = useNavigate();
  const winRules = useGameStore((state) => state.configs?.rules?.win || []);
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const setSelectedGoal = useGameStore((state) => state.setSelectedGoal);

  const ordered = useMemo(() => [...winRules], [winRules]);

  return (
    <div className={styles.selectionPage}>
      <div className={styles.selectionHeader}>
        <div>
          <h1>Стратегия партии</h1>
          <p className={styles.selectionDescription}>Определи, какой прогресс тебе важен.</p>
        </div>
        <button type="button" className={styles.selectionBack} onClick={() => navigate('/')}>
          Назад
        </button>
      </div>
      <Card className={styles.panelCard}>
        <div className={styles.optionListCenter}>
          {ordered.map((rule) => {
            const summary = summarizeGoal(rule);
            const active = selectedGoalId === rule.id;
            return (
              <button
                key={rule.id}
                type="button"
                className={`${styles.optionButton} ${active ? styles.optionButtonActive : ''}`}
                onClick={() => setSelectedGoal(rule.id)}
              >
                <strong>{summary.title}</strong>
                <small>{summary.detail}</small>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default StrategySelect;
