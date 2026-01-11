import { useState, useRef } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from './Deals.module.css';
import { spriteStyle } from '../utils/iconSprite';
import { DEAL_TEMPLATES } from '../domain/deals';

function pluralizeTurns(value) {
  const num = Math.max(0, Math.round(value));
  const abs = Math.abs(num) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return `${num} ходов`;
  }
  if (last === 1) {
    return `${num} ход`;
  }
  if (last >= 2 && last <= 4) {
    return `${num} хода`;
  }
  return `${num} ходов`;
}

function Meter({ label, value }) {
  const total = 5;
  const active = Math.max(0, Math.min(total, value || 0));
  return (
    <div className={styles.meter}>
      <span>{label}</span>
      <div>
        {Array.from({ length: total }).map((_, index) => (
          <i key={`${label}-${index}`} className={index < active ? styles.meterActive : ''} />
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, windowMeta, onParticipate, disabled, active }) {
  const windowText = windowMeta
    ? windowMeta.expiresIn > 0
      ? `Осталось ${pluralizeTurns(windowMeta.expiresIn)}`
      : 'Окно закрывается'
    : 'Окно скоро появится';
  const slotsText = windowMeta
    ? windowMeta.slotsLeft > 0
      ? `Слоты: ${windowMeta.slotsLeft}/${windowMeta.maxSlots}`
      : 'Слоты закончились'
    : '';
  return (
    <Card className={`${styles.dealCard} ${active ? styles.dealActive : ''}`}>
      <div className={styles.dealRow}>
        <div className={styles.dealIcon} style={spriteStyle(deal.icon)} />
        <div>
          <h3>{deal.title}</h3>
          <p>{deal.description}</p>
        </div>
      </div>
      <div className={styles.dealTimer}>
        <span>{windowText}</span>
        {slotsText && <span>{slotsText}</span>}
      </div>
      <div className={styles.dealMeters}>
        <Meter label="Риск" value={deal.riskMeter} />
        <Meter label="Ликвидность" value={deal.liquidityMeter} />
        <div className={styles.lockBadge}>Срок: {deal.lockMonths} мес.</div>
      </div>
      {deal.effects?.length > 0 && (
        <div className={styles.dealEffects}>
          {deal.effects.map((effect) => (
            <span key={`${deal.id}-${effect.text}`}>
              <em>{effect.icon}</em>
              {effect.text}
            </span>
          ))}
        </div>
      )}
      <p className={styles.risk}>Риск: {deal.riskNote}</p>
      <ul className={styles.featureList}>
        {deal.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => onParticipate(deal)} disabled={disabled}>
        {active ? 'Куплено' : `Участвовать за $${deal.entryCost.toLocaleString('en-US')}`}
      </Button>
    </Card>
  );
}

function Deals() {
  const month = useGameStore((state) => state.month);
  const cash = useGameStore((state) => state.cash);
  const participations = useGameStore((state) => state.dealParticipations || []);
  const participateDeal = useGameStore((state) => state.participateInDeal);
  const dealWindows = useGameStore((state) => state.dealWindows || {});
  const [feedback, setFeedback] = useState(null);
  const cardRefs = useRef({});

  const handleParticipate = (deal) => {
    const result = participateDeal({
      id: deal.id,
      title: deal.title,
      entryCost: deal.entryCost,
      monthlyPayout: deal.monthlyPayout,
      durationMonths: deal.durationMonths,
      risk: deal.riskNote || deal.risk,
    });
    if (result?.error) {
      setFeedback({ text: result.error, positive: false });
    } else {
      setFeedback({ text: `Ты вошёл в «${deal.title}»`, positive: true });
      const target = cardRefs.current[deal.id];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setTimeout(() => setFeedback(null), 2200);
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h2>Инвестиционные возможности · Месяц {month}</h2>
        <p>У каждой сделки окно и ограниченный пул — решайся до закрытия окна.</p>
      </header>
      {feedback && (
        <div className={`${styles.feedback} ${feedback.positive ? styles.feedbackPositive : styles.feedbackNegative}`}>
          {feedback.text}
        </div>
      )}
      <div className={styles.list}>
        {DEAL_TEMPLATES.map((deal) => {
          const active = participations.some(
            (entry) => !entry.completed && entry.dealId === deal.id,
          );
          const windowMeta = dealWindows[deal.id];
          const windowClosed =
            !windowMeta || windowMeta.expiresIn <= 0 || (windowMeta.slotsLeft ?? 0) <= 0;
          return (
            <div
              key={deal.id}
              ref={(el) => {
                cardRefs.current[deal.id] = el;
              }}
            >
              <DealCard
                deal={deal}
                onParticipate={handleParticipate}
                windowMeta={windowMeta}
                disabled={cash < deal.entryCost || active || windowClosed}
                active={active}
              />
            </div>
          );
        })}
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
                  Заработано: ${Math.round(deal.profitEarned).toLocaleString('en-US')} · Ежемесячно{' '}
                  {deal.monthlyPayout > 0 ? `+$${deal.monthlyPayout}` : '0'} · Срок {deal.durationMonths} мес. ·{' '}
                  {deal.risk}
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
