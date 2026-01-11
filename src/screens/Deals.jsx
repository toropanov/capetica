import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from './Deals.module.css';
import { spriteStyle } from '../utils/iconSprite';

const DEAL_TEMPLATES = [
  {
    id: 'venture',
    title: 'Венчурный пул ИИ‑стартапа',
    description: 'Тикет фиксированный, процесс прозрачный ─ вы входите вместе с лид‑инвестором.',
    icon: 'iconGrowth',
    features: ['Тикет $25 000', '8% доля, выход 36 мес.', 'Сопровождение юристов спв'],
  },
  {
    id: 'equity',
    title: 'Доля в частной клинике',
    description: 'Берёте долю операционной прибыли с гарантией выкупа и ежеквартальным отчётом.',
    icon: 'iconCard',
    features: ['Тикет $18 000', 'IRR ~22%', 'Buy-back контракт на 24 мес.'],
  },
  {
    id: 'real_estate',
    title: 'Дом у океана под 4,1%',
    description: 'Готовый дом + аренда от застройщика, ипотека уже субсидирована банком.',
    icon: 'iconHardhat',
    features: ['Стоимость $320 000', 'Аванс 15%', 'Кеш‑флоу $1 100/мес.'],
  },
  {
    id: 'auto',
    title: 'Электрокар с дисконтом 18%',
    description: 'Лимит на корпоративный лизинг с обратным выкупом по окончании контракта.',
    icon: 'iconPiggy',
    features: ['Цена $42 000', 'Платёж $890/мес.', 'Гарантированный buy-back'],
  },
];

function DealCard({ deal }) {
  return (
    <Card className={styles.dealCard}>
      <div className={styles.dealRow}>
        <div className={styles.dealIcon} style={spriteStyle(deal.icon)} />
        <div>
          <h3>{deal.title}</h3>
          <p>{deal.description}</p>
        </div>
      </div>
      <ul className={styles.featureList}>
        {deal.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Button variant="primary">Уточнить условия</Button>
    </Card>
  );
}

function Deals() {
  const month = useGameStore((state) => state.month);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h2>Сделки месяца №{month}</h2>
        <p>Короткая подборка предложений, на которые стоит успеть откликнуться.</p>
      </header>
      <div className={styles.list}>
        {DEAL_TEMPLATES.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}

export default Deals;
