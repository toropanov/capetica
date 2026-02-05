import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import styles from './CardShuffle.module.css';

const CARD_OUT_DURATION = 620;
const CARD_LOOP_INTERVAL = 700;
const CARD_START_DELAY = 140;

const clampLoops = (loops) => {
  if (typeof loops !== 'number' || Number.isNaN(loops)) return 1;
  return Math.max(1, Math.floor(loops));
};

const ensureCardList = (cards = []) => {
  const sanitized = cards.filter(Boolean);
  if (!sanitized.length) {
    return [
      { id: 'placeholder-1', data: null },
      { id: 'placeholder-2', data: null },
    ];
  }
  if (sanitized.length === 1) {
    return [
      sanitized[0],
      {
        id: `${sanitized[0].id || 'card'}-duplicate`,
        data: sanitized[0].data,
      },
    ];
  }
  return sanitized;
};

function CardShuffle({ cards = [], loops = 1, active = true, onComplete, renderCard }) {
  const safeLoops = clampLoops(loops);
  const displayCards = useMemo(() => ensureCardList(cards), [cards]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(displayCards.length > 1 ? 1 : 0);
  const [outIndex, setOutIndex] = useState(null);
  const positionRef = useRef({ current: 0, next: displayCards.length > 1 ? 1 : 0 });
  const loopCounterRef = useRef(0);
  const deckRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(null);
  const timersRef = useRef({
    start: null,
    loop: null,
    clearOut: null,
    complete: null,
  });
  const completedRef = useRef(false);

  const clearTimers = () => {
    Object.keys(timersRef.current).forEach((key) => {
      if (timersRef.current[key]) {
        clearTimeout(timersRef.current[key]);
        timersRef.current[key] = null;
      }
    });
  };

  useEffect(() => () => {
    clearTimers();
  }, []);

  useEffect(() => {
    clearTimers();
    completedRef.current = false;
    loopCounterRef.current = 0;
    if (!active) {
      setOutIndex(null);
      return undefined;
    }

    const totalCards = displayCards.length || 1;
    const initialNext = totalCards > 1 ? 1 : 0;
    positionRef.current = { current: 0, next: initialNext };
    setCurrentIndex(0);
    setNextIndex(initialNext);
    setOutIndex(null);

    const step = () => {
      setOutIndex(positionRef.current.current);
      const newCurrent = positionRef.current.next;
      const newNext = totalCards > 1 ? (positionRef.current.next + 1) % totalCards : positionRef.current.next;
      positionRef.current = { current: newCurrent, next: newNext };
      setCurrentIndex(newCurrent);
      setNextIndex(newNext);
      loopCounterRef.current += 1;
      if (loopCounterRef.current >= safeLoops) {
        timersRef.current.complete = setTimeout(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            if (typeof onComplete === 'function') {
              onComplete();
            }
          }
        }, CARD_OUT_DURATION + 160);
      } else {
        timersRef.current.loop = setTimeout(step, CARD_LOOP_INTERVAL);
      }
    };

    timersRef.current.start = setTimeout(step, CARD_START_DELAY);

    return () => {
      clearTimers();
    };
  }, [active, safeLoops, onComplete, displayCards]);

  useLayoutEffect(() => {
    if (!deckRef.current) return;
    const nodes = Array.from(deckRef.current.querySelectorAll(`.${styles.cardContent}`));
    if (!nodes.length) return;
    const maxHeight = nodes.reduce((acc, node) => Math.max(acc, node.getBoundingClientRect().height), 0);
    setCardHeight((prev) => {
      if (typeof prev === 'number' && Math.abs(prev - maxHeight) <= 1) {
        return prev;
      }
      return maxHeight;
    });
  }, [displayCards]);

  useEffect(() => {
    if (outIndex === null) return undefined;
    if (timersRef.current.clearOut) {
      clearTimeout(timersRef.current.clearOut);
    }
    timersRef.current.clearOut = setTimeout(() => {
      setOutIndex((current) => (current === outIndex ? null : current));
    }, CARD_OUT_DURATION);
    return () => {
      if (timersRef.current.clearOut) {
        clearTimeout(timersRef.current.clearOut);
        timersRef.current.clearOut = null;
      }
    };
  }, [outIndex]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.deck} ref={deckRef} style={cardHeight ? { height: `${cardHeight}px` } : undefined}>
        {displayCards.map((card, index) => {
          const classNames = [styles.card];
          if (index === currentIndex) classNames.push(styles.cardCurrent);
          if (index === nextIndex) classNames.push(styles.cardNext);
          if (index === outIndex) classNames.push(styles.cardOut);
          return (
            <div key={card.id || index} className={classNames.join(' ')}>
              <div className={styles.cardContent}>{renderCard ? renderCard(card, index) : null}</div>
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>Выбираю карту...</p>
    </div>
  );
}

export default CardShuffle;
