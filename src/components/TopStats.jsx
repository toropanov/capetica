import Card from './Card';
import styles from './TopStats.module.css';

function Metric({ label, value, accent }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong style={{ color: accent }}>{value}</strong>
    </div>
  );
}

function TopStats({ month, netWorth, cash, passiveIncome, debt, availableCredit }) {
  const monthLabel = `Месяц ${month}`;
  const formattedNetWorth = `$${netWorth.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
  const formattedCash = `$${cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const formattedPassive = `$${passiveIncome.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}/мес`;
  return (
    <section className={styles.wrapper}>
      <div className={styles.heading}>
        <p>{monthLabel}</p>
        <span>Баланс стратегии</span>
      </div>
      <Card className={styles.primaryCard}>
        <div className={styles.netWorthLabel}>Чистая стоимость</div>
        <div className={styles.netWorthValue}>{formattedNetWorth}</div>
        <div className={styles.metricsGrid}>
          <Metric label="Наличные" value={formattedCash} accent="#a469ff" />
          <Metric label="Пассивный доход" value={formattedPassive} accent="#59dabf" />
          <Metric
            label="Долг"
            value={`$${debt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            accent="#ff9b9b"
          />
          <Metric
            label="Кредитлайн"
            value={`$${availableCredit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            accent="#7bd7ff"
          />
        </div>
      </Card>
    </section>
  );
}

export default TopStats;
