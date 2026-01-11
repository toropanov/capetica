import { useMemo, useState, useEffect } from 'react';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import Button from '../components/Button';
import GradientButton from '../components/GradientButton';
import Modal from '../components/Modal';
import Slider from '../components/Slider';
import SparkLine from '../components/SparkLine';
import styles from './Investments.module.css';
import { spriteStyle, getTypeIcon } from '../utils/iconSprite';

function InstrumentCard({ instrument, priceInfo, holding, onTrade }) {
  const changePct = Math.round((priceInfo?.lastReturn || 0) * 100);
  const price = Math.round(priceInfo?.price || instrument.initialPrice);
  const value = Math.round((holding?.units || 0) * (priceInfo?.price || instrument.initialPrice));
  const iconKey = getTypeIcon(instrument.type);
  return (
    <Card className={styles.instrumentCard}>
      <div className={styles.instrumentHeader}>
        <div className={styles.instrumentIcon} style={spriteStyle(iconKey)} />
        <div>
          <h3>{instrument.title}</h3>
        </div>
        <div className={styles.priceBlock}>
          <strong>${price.toLocaleString('en-US')}</strong>
          <span className={changePct >= 0 ? styles.positive : styles.negative}>
            {changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct)}%
          </span>
        </div>
      </div>
      <div className={styles.sparkline}>
        <SparkLine data={priceInfo?.history || []} />
      </div>
      <div className={styles.position}>
        <div>
          <span>Доля</span>
          <strong>${value.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Лотов</span>
          <strong>{(holding?.units || 0).toFixed(2)}</strong>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => onTrade(instrument, 'sell')} disabled={!holding}>
          Продать
        </Button>
        <Button variant="primary" onClick={() => onTrade(instrument, 'buy')}>
          Купить
        </Button>
      </div>
    </Card>
  );
}

function TradeModal({ trade, onClose, cash, holdings, onConfirm }) {
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (!trade) return;
    const min = trade.instrument.trading?.minOrder || 10;
    if (trade.mode === 'buy') {
      setAmount(min);
    } else {
      const holdingValue =
        (holdings?.units || 0) * (trade.priceInfo?.price || trade.instrument.initialPrice);
      setAmount(Math.max(min, holdingValue));
    }
  }, [trade, holdings]);

  if (!trade) return null;
  const minOrder = trade.instrument.trading?.minOrder || 10;
  const price = trade.priceInfo?.price || trade.instrument.initialPrice;
  const holdingValue = (holdings?.units || 0) * price;
  const max = trade.mode === 'buy' ? Math.max(minOrder, cash) : Math.max(minOrder, holdingValue);
  const blocked =
    trade.mode === 'buy' ? cash < minOrder : holdingValue < minOrder || !holdings?.units;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${trade.mode === 'buy' ? 'Покупка' : 'Продажа'} — ${trade.instrument.title}`}
      footer={
        <>
        <Button variant="ghost" onClick={onClose}>
          Отменить
        </Button>
        <GradientButton
          onClick={() => onConfirm(amount)}
          disabled={
            blocked ||
            amount < minOrder ||
            (trade.mode === 'buy' ? amount > cash : amount > holdingValue)
          }
        >
          Подтвердить
        </GradientButton>
      </>
    }
    >
      <p className={styles.modalPrice}>
        Цена: <strong>${Math.round(price)}</strong>
      </p>
      <Slider
        min={minOrder}
        max={Math.max(minOrder, Math.floor(max))}
        step={minOrder}
        value={Math.min(amount, Math.floor(max))}
        onChange={setAmount}
        label="Сумма сделки (USD)"
      />
      <p className={styles.modalValue}>
        Объём: <strong>{(amount / price).toFixed(3)} лотов</strong>
      </p>
      {blocked && <p className={styles.blocked}>Недостаточно средств/лот для операции.</p>}
    </Modal>
  );
}

function Investments() {
  const instruments = useGameStore(
    (state) => state.configs?.instruments?.instruments || [],
  );
  const priceState = useGameStore((state) => state.priceState);
  const holdings = useGameStore((state) => state.investments);
  const cash = useGameStore((state) => state.cash);
  const buyInstrument = useGameStore((state) => state.buyInstrument);
  const sellInstrument = useGameStore((state) => state.sellInstrument);
  const [trade, setTrade] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const handleTrade = (instrument, mode) => {
    const priceInfo = priceState[instrument.id];
    setTrade({
      instrument,
      mode,
      priceInfo,
    });
  };

  const handleConfirm = (amount) => {
    if (!trade) return;
    if (trade.mode === 'buy') {
      buyInstrument(trade.instrument.id, amount);
      setFeedback({
        text: `Потрачено $${Math.round(amount).toLocaleString('en-US')} на ${trade.instrument.title}`,
        positive: false,
      });
    } else {
      sellInstrument(trade.instrument.id, amount);
      setFeedback({
        text: `Заработано $${Math.round(amount).toLocaleString('en-US')} c ${trade.instrument.title}`,
        positive: true,
      });
    }
    setTrade(null);
    setTimeout(() => setFeedback(null), 2000);
  };

  const cards = useMemo(
    () =>
      instruments.map((instrument) => ({
        instrument,
        priceInfo: priceState[instrument.id],
        holding: holdings[instrument.id],
      })),
    [instruments, priceState, holdings],
  );

  return (
    <div className={styles.screen}>
      <header>
        <h2>Инвестиционный холдинг</h2>
      </header>
      {feedback && (
        <div
          className={`${styles.feedback} ${
            feedback.positive ? styles.feedbackPositive : styles.feedbackNegative
          }`}
        >
          {feedback.text}
        </div>
      )}
      <div className={styles.list}>
        {cards.map((card) => (
          <InstrumentCard
            key={card.instrument.id}
            instrument={card.instrument}
            priceInfo={card.priceInfo}
            holding={card.holding}
            onTrade={handleTrade}
          />
        ))}
      </div>
      <TradeModal
        trade={trade}
        onClose={() => setTrade(null)}
        cash={cash}
        holdings={trade ? holdings[trade.instrument.id] : null}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

export default Investments;
