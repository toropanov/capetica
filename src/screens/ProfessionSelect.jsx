import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import GradientButton from '../components/GradientButton';
import styles from './ProfessionSelect.module.css';

function ProfCard({ profession, onSelect }) {
  return (
    <Card className={styles.profCard}>
      <div className={styles.avatar}>
        <span>{profession.title.slice(0, 1)}</span>
      </div>
      <h3>{profession.title}</h3>
      <p className={styles.sub}>Стартовые цифры</p>
      <div className={styles.metrics}>
        <div>
          <span>Зарплата</span>
          <strong>${profession.salaryMonthly.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Свободный кэш</span>
          <strong>${profession.startingMoney.toLocaleString('en-US')}</strong>
        </div>
      </div>
      <Button variant="primary" onClick={() => onSelect(profession.id)}>
        Играть
      </Button>
    </Card>
  );
}

function ProfessionSelect() {
  const professions = useGameStore(
    (state) => state.configs?.professions?.professions || [],
  );
  const selectProfession = useGameStore((state) => state.selectProfession);
  const randomProfession = useGameStore((state) => state.randomProfession);
  const navigate = useNavigate();

  const ordered = useMemo(
    () => [...professions].sort((a, b) => a.salaryMonthly - b.salaryMonthly),
    [professions],
  );

  const handleSelect = (id) => {
    selectProfession(id);
    navigate('/app');
  };

  const handleRandom = () => {
    randomProfession();
    navigate('/app');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.hero}>
        <p>Выбери роль</p>
        <h1>Кем ты стартуешь в FinStrategy?</h1>
        <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
      </div>
      <div className={styles.cards}>
        {ordered.map((profession) => (
          <ProfCard key={profession.id} profession={profession} onSelect={handleSelect} />
        ))}
      </div>
      <GradientButton onClick={handleRandom}>Случайно</GradientButton>
      <div className={styles.sparkles}>
        <span />
        <span />
      </div>
    </div>
  );
}

export default ProfessionSelect;
