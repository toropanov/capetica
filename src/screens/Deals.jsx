import { useState } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from './Deals.module.css';
import { spriteStyle } from '../utils/iconSprite';

const DEAL_TEMPLATES = [
  {
    id: 'venture',
    title: 'Венчурный пул ИИ‑стартапа',
    description: 'Минимальный взнос даёт слот в пуле вместе с лид‑инвестором.',
    icon: 'iconGrowth',
    entryCost: 2000,
    monthlyPayout: 200,
    durationMonths: 6,
    risk: 'Высокий — при провале потеряешь всю ставку.',
    features: ['Вход: $2 000 → берём 1 лот', 'Пассивно: +$200/мес. пока в пуле', 'Выход x3 через 6 мес.'],
  },
  {
    id: 'equity',
    title: 'Доля в частной клинике',
    description: 'Покупаете часть прибыли и получаете фиксированный buy-back.',
    icon: 'iconCard',
    entryCost: 2000,
    monthlyPayout: 180,
    durationMonths: 12,
    risk: 'Средний — возможна задержка выплат 1-2 месяца.',
    features: ['Вход: $2 000', 'Дивиденд: +$180/мес.', 'Выкуп по $4 400 через 12 мес.'],
  },
  {
    id: 'real_estate',
    title: 'Дом у океана под 4,1%',
    description: 'Взнос резервирует смарт-дом с готовым арендным потоком.',
    icon: 'iconHardhat',
    entryCost: 2000,
    monthlyPayout: 250,
    durationMonths: 18,
    risk: 'Низкий — доход защищён контрактом, но деньги застрянут до выкупа.',
    features: ['Вход: $2 000', 'Кеш-флоу: +$250/мес.', 'Опция продажи застройщику'],
  },
  {
    id: 'auto',
    title: 'Электрокар с дисконтом 18%',
    description: 'Берём предзаказ на машину с обратным выкупом.',
    icon: 'iconPiggy',
    entryCost: 2000,
    monthlyPayout: 120,
    durationMonths: 8,
    risk: 'Средний — возможен перенос выкупа на пару месяцев.',
    features: ['Вход: $2 000', 'Экономия: +$120/мес.', 'Возврат выкупа через 8 мес.'],
  },
];

function DealCard({ deal, onParticipate, disabled }) {
  return (
    <Card className={styles.dealCard}>
      <div className={styles.dealRow}>
        <div className={styles.dealIcon} style={spriteStyle(deal.icon)} />
        <div>
          <h3>{deal.title}</h3>
          <p>{deal.description}</p>
        </div>
      </div>
      <p className={styles.risk}>Риск: {deal.risk}</p>
      <ul className={styles.featureList}>
        {deal.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => onParticipate(deal)} disabled={disabled}>
        Участвовать за $2 000
      </Button>
    </Card>
  );
}

function Deals() {
  const month = useGameStore((state) => state.month);
  const cash = useGameStore((state) => state.cash);
  const participations = useGameStore((state) => state.dealParticipations || []);
  const participateDeal = useGameStore((state) => state.participateInDeal);
  const [feedback, setFeedback] = useState(null);

  const handleParticipate = (deal) => {
    const result = participateDeal({
      id: deal.id,
      title: deal.title,
      entryCost: deal.entryCost,
      monthlyPayout: deal.monthlyPayout,
      durationMonths: deal.durationMonths,
      risk: deal.risk,
    });
    if (result?.error) {
      setFeedback({ text: result.error, positive: false });
    } else {
      setFeedback({ text: `Ты вошёл в «${deal.title}»`, positive: true });
    }
    setTimeout(() => setFeedback(null), 2200);
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h2>Сделки месяца №{month}</h2>
        <p>Короткая подборка предложений, на которые стоит успеть откликнуться.</p>
      </header>
      {feedback && (
        <div className={`${styles.feedback} ${feedback.positive ? styles.feedbackPositive : styles.feedbackNegative}`}>
          {feedback.text}
        </div>
      )}
      <div className={styles.list}>
        {DEAL_TEMPLATES.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onParticipate={handleParticipate}
            disabled={cash < deal.entryCost}
          />
        ))}
      </div>
      {participations.length > 0 && (
        <section className={styles.participations}>
          <h3>Мои сделки</h3>
          {participations.map((deal) => {
            const percent = Math.min(100, Math.round((deal.elapsedMonths / deal.durationMonths) * 100));
            return (
              <div
                key={deal.participationId}
                className={`${styles.participationCard} ${deal.completed ? styles.participationCompleted : ''}`}
              >
                <div className={styles.participationHeader}>
                  <strong>{deal.title}</strong>
                  <span>
                    {deal.completed
                      ? 'Завершена'
                      : `Прогресс ${deal.elapsedMonths}/${deal.durationMonths}`}
                  </span>
                </div>
                <p>
                  Заработано: ${Math.round(deal.profitEarned).toLocaleString('en-US')} · Ежемесячно {deal.monthlyPayout > 0 ? `+$${deal.monthlyPayout}` : '0'}
                </p>
                <div className={styles.progressBar}>
                  <div style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default Deals;
