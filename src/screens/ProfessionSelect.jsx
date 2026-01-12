import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import styles from './ProfessionSelect.module.css';
import teacherImg from '../assets/proffesions/teacher.png';
import devImg from '../assets/proffesions/dev.png';
import lawyerImg from '../assets/proffesions/low.png';
import doctorImg from '../assets/proffesions/doctor.png';
import fireImg from '../assets/proffesions/fire.png';
import managerImg from '../assets/proffesions/manager.png';
import introImg from '../assets/intro_ru.png';

const DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Лёгкий', description: 'Реже негативные события.' },
  { id: 'normal', label: 'Стандарт', description: 'Баланс риска и наград.' },
  { id: 'hard', label: 'Сложный', description: 'Больше стрессов и испытаний.' },
];

const formatMoney = (value) => `$${Math.round(value || 0).toLocaleString('en-US')}`;

const PROFESSION_IMAGES = {
  teacher: teacherImg,
  programmer: devImg,
  lawyer: lawyerImg,
  dentist: doctorImg,
  firefighter: fireImg,
  sales_manager: managerImg,
};

function summarizeGoal(rule) {
  if (!rule) {
    return { title: rule?.id || '', detail: '' };
  }
  if (rule.type === 'passive_income_cover_costs') {
    return {
      title: 'Пассивный > расходов',
      detail: `Удержать ${rule.requiredStreakMonths || 1} ходов`,
    };
  }
  if (rule.type === 'net_worth_reach') {
    const target = `$${(rule.target || 0).toLocaleString('en-US')}`;
    return {
      title: `Чистый капитал ${target}`,
      detail: `Финализируй ${rule.requiredStreakMonths || 1} ходов`,
    };
  }
  return { title: rule.id, detail: '' };
}

function ProfCard({ profession, onSelect }) {
  const stats = [
    { label: 'Зарплата', value: `${formatMoney(profession.salaryMonthly)}/мес` },
    { label: 'Наличные', value: formatMoney(profession.startingMoney) },
    { label: 'Бытовые расходы', value: `${formatMoney(profession.monthlyExpenses || 0)}/мес` },
    { label: 'Кредитный лимит', value: formatMoney(profession.creditLimitBase || 0) },
  ];
  const startingDebt = profession.startingDebt || 0;
  const avatarSrc = PROFESSION_IMAGES[profession.id];
  return (
    <Card className={styles.profCard} onClick={() => onSelect(profession.id)}>
      <div className={styles.summaryRow}>
        <div className={styles.avatar}>
          {avatarSrc ? <img src={avatarSrc} alt={profession.title} /> : <span>{profession.title.slice(0, 1)}</span>}
        </div>
        <div>
          <h3>{profession.title}</h3>
          <p className={styles.sub}>Стартовые параметры</p>
        </div>
      </div>
      <div className={styles.metrics}>
        {stats.map((item) => (
          <div key={`${profession.id}-${item.label}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {startingDebt > 0 && (
        <div className={styles.debtTag}>Стартовый долг {formatMoney(startingDebt)}</div>
      )}
      <button className={styles.playIcon} type="button" aria-hidden="true">
        ▶
      </button>
    </Card>
  );
}

function ProfessionSelect() {
  const professions = useGameStore(
    (state) => state.configs?.professions?.professions || [],
  );
  const winRules = useGameStore((state) => state.configs?.rules?.win || []);
  const storedGoalId = useGameStore((state) => state.selectedGoalId);
  const storedDifficulty = useGameStore((state) => state.difficulty || 'normal');
  const selectProfession = useGameStore((state) => state.selectProfession);
  const randomProfession = useGameStore((state) => state.randomProfession);
  const navigate = useNavigate();

  const ordered = useMemo(
    () => [...professions].sort((a, b) => a.salaryMonthly - b.salaryMonthly),
    [professions],
  );
  const [goalId, setGoalId] = useState(storedGoalId || winRules[0]?.id || null);
  const [difficulty, setDifficulty] = useState(storedDifficulty);
  const [isRolling, setIsRolling] = useState(false);
  const rollDelayRef = useRef(null);

  useEffect(() => {
    if (!goalId && winRules[0]) {
      setGoalId(winRules[0].id);
    }
  }, [winRules, goalId]);

  useEffect(() => {
    if (storedGoalId && storedGoalId !== goalId) {
      setGoalId(storedGoalId);
    }
  }, [storedGoalId]);

  useEffect(() => {
    if (storedDifficulty && storedDifficulty !== difficulty) {
      setDifficulty(storedDifficulty);
    }
  }, [storedDifficulty]);

  useEffect(
    () => () => {
      if (rollDelayRef.current) {
        clearTimeout(rollDelayRef.current);
      }
    },
    [],
  );

  const effectiveGoalId = goalId || winRules[0]?.id || null;
  const effectiveDifficulty = difficulty || 'normal';

  const handleSelect = (id) => {
    selectProfession(id, { goalId: effectiveGoalId, difficulty: effectiveDifficulty });
    navigate('/app');
  };

  const handleRandom = () => {
    if (isRolling) return;
    setIsRolling(true);
    rollDelayRef.current = setTimeout(() => {
      randomProfession({ goalId: effectiveGoalId, difficulty: effectiveDifficulty });
      navigate('/app');
    }, 650);
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
        <p>Выбери роль</p>
        <h1>С чего начнётся твоя история?</h1>
        <span>Каждая профессия — своя динамика кэша, расходов и кредитного лайна.</span>
      </div>
      {winRules.length > 0 && (
        <div className={styles.options}>
          <section className={styles.optionGroup}>
            <h2>Вектор партии</h2>
            <div className={styles.optionList}>
              {winRules.map((rule) => {
                const summary = summarizeGoal(rule);
                const active = effectiveGoalId === rule.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    className={`${styles.optionButton} ${active ? styles.optionButtonActive : ''}`}
                    onClick={() => setGoalId(rule.id)}
                  >
                    <strong>{summary.title}</strong>
                    <small>{summary.detail}</small>
                  </button>
                );
              })}
            </div>
          </section>
          <section className={styles.optionGroup}>
            <h2>Сложность</h2>
            <div className={styles.optionList}>
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
          </section>
        </div>
      )}
      <div className={styles.cards}>
        {ordered.map((profession) => (
          <ProfCard key={profession.id} profession={profession} onSelect={handleSelect} />
        ))}
      </div>
      <GradientButton
        onClick={handleRandom}
        disabled={isRolling}
        icon="🎲"
        rolling={isRolling}
        size="compact"
        ariaLabel="Случайно"
        className={styles.randomDiceButton}
        iconClassName={styles.randomDiceIcon}
      />
      <div className={styles.sparkles}>
        <span />
        <span />
      </div>
    </div>
  );
}

export default ProfessionSelect;
