import useGameStore, { homeActions } from '../store/gameStore';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import Button from '../components/Button';
import styles from './Home.module.css';

function ActionCard({ action, onSelect }) {
  return (
    <Card className={styles.actionCard}>
      <div className={styles.actionIcon}>
        <span />
      </div>
      <h3>{action.title}</h3>
      <p>{action.description}</p>
      <Button variant="primary" onClick={() => onSelect(action.id)}>
        Запустить
      </Button>
    </Card>
  );
}

function LastTurn({ data }) {
  if (!data) {
    return (
      <div className={styles.placeholder}>
        <p>Совершай действия и переходи к следующему месяцу, чтобы увидеть динамику.</p>
      </div>
    );
  }
  return (
    <div className={styles.lastTurn}>
      <div>
        <span>Зарплата</span>
        <strong>${data.salary.toLocaleString('en-US')}</strong>
      </div>
      <div>
        <span>Пассивно</span>
        <strong>${Math.round(data.passiveIncome).toLocaleString('en-US')}</strong>
      </div>
      <div>
        <span>Расходы</span>
        <strong>${Math.round(data.livingCost).toLocaleString('en-US')}</strong>
      </div>
      <div>
        <span>Доходность портфеля</span>
        <strong>
          {Object.keys(data.returns || {}).length
            ? `${Math.round(
                Object.values(data.returns).reduce((acc, value) => acc + value, 0) * 100,
              ) / Object.keys(data.returns).length}%`
            : '—'}
        </strong>
      </div>
    </div>
  );
}

function Home() {
  const applyHomeAction = useGameStore((state) => state.applyHomeAction);
  const advanceMonth = useGameStore((state) => state.advanceMonth);
  const lastTurn = useGameStore((state) => state.lastTurn);
  const recentLog = useGameStore((state) => state.recentLog);

  return (
    <div className={styles.screen}>
      <section>
        <h2>Ходы месяца</h2>
        <div className={styles.grid}>
          {homeActions.map((action) => (
            <ActionCard key={action.id} action={action} onSelect={applyHomeAction} />
          ))}
        </div>
      </section>
      <Card className={styles.card}>
        <header>
          <h3>Результат последнего месяца</h3>
        </header>
        <LastTurn data={lastTurn} />
      </Card>
      <Card className={styles.card}>
        <header>
          <h3>Журнал решений</h3>
          <span>Автосейв после каждого действия</span>
        </header>
        <div className={styles.logList}>
          {recentLog?.length ? (
            recentLog.map((entry) => (
              <div key={entry.id} className={styles.logItem}>
                <span>Месяц {entry.month}</span>
                <p>{entry.text}</p>
              </div>
            ))
          ) : (
            <p className={styles.placeholder}>Пока пусто — выбери действие.</p>
          )}
        </div>
      </Card>
      <GradientButton onClick={advanceMonth}>Следующий месяц</GradientButton>
    </div>
  );
}

export default Home;
