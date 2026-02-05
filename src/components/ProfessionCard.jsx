import Card from './Card';
import styles from '../screens/ProfessionSelect.module.css';
import { PROFESSION_IMAGES } from '../utils/professionImages';
import { getMonthlyExpenses } from '../domain/finance';

const formatMoney = (value) => `$${Math.round(value || 0).toLocaleString('en-US')}`;

function ProfessionCard({ profession, onSelect, isSelected = false }) {
  const stats = [
    { label: 'Зарплата', value: `${formatMoney(profession.salaryMonthly)}/мес` },
    { label: 'Наличные', value: formatMoney(profession.startingMoney) },
    { label: 'Расходы', value: `${formatMoney(getMonthlyExpenses(profession))}/мес` },
    { label: 'Кредитный лимит', value: formatMoney(profession.creditLimitBase || 0) },
  ];
  const startingDebt = profession.startingDebt || 0;
  const avatarSrc = PROFESSION_IMAGES[profession.id];
  const cardClasses = [styles.profCard, isSelected ? styles.profCardSelected : ''].filter(Boolean).join(' ');
  return (
    <Card className={cardClasses} onClick={() => onSelect?.(profession.id)}>
      <div className={styles.summaryRow}>
        <div className={styles.avatar}>{avatarSrc ? <img src={avatarSrc} alt={profession.title} /> : <span>{profession.title.slice(0, 1)}</span>}</div>
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
      {startingDebt > 0 && <div className={styles.debtTag}>Стартовый долг {formatMoney(startingDebt)}</div>}
    </Card>
  );
}

export default ProfessionCard;
