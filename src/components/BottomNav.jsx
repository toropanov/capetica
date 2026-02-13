import { useEffect, useState } from 'react';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { id: 'analytics', label: 'Аналитика', path: '/app' },
  { id: 'assets', label: 'Активы', path: '/app/bank' },
];
const DICE_PIP_KEYS = ['tl', 'tr', 'ml', 'mr', 'bl', 'br', 'center'];
const DICE_FACE_MAP = {
  1: ['center'],
  2: ['tl', 'br'],
  3: ['tl', 'center', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'center', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};
function NavIcon({ id }) {
  switch (id) {
    case 'analytics':
      return (
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          <rect x="3.5" y="6" width="7" height="18" rx="3.5" fill="#dfe9ff" />
          <rect x="11.5" y="3.5" width="7" height="20" rx="3.5" fill="#bdd7ff" />
          <rect x="19.5" y="9" width="7" height="14.5" rx="3.5" fill="#9cc6ff" />
          <path
            d="M5 12L11 8L15 12L22 5.5"
            stroke="#284b80"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'assets':
    default:
      return (
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          <rect x="5" y="11" width="20" height="11" rx="3" fill="#eaf3ff" stroke="#284b80" strokeWidth="1.4" />
          <path d="M9 17H16" stroke="#284b80" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="20.5" cy="17" r="2" fill="#284b80" opacity="0.7" />
          <path
            d="M7 11L15 6L23 11"
            stroke="#284b80"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        </svg>
      );
  }
}

function BottomNav({
  current,
  onChange,
  onAdvance,
  diceAnimating = false,
  hideLabel = false,
  rollCardClosing = false,
}) {
  const [diceValue, setDiceValue] = useState(1);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!diceAnimating) {
      setRolling(false);
      return;
    }
    setRolling(true);
    const rollInterval = setInterval(() => {
      setDiceValue((prev) => {
        let next = Math.floor(Math.random() * 6) + 1;
        if (next === prev) {
          next = (next % 6) + 1;
        }
        return next;
      });
    }, 160);
    return () => clearInterval(rollInterval);
  }, [diceAnimating]);

  const renderNavButton = (item) => (
    <button
      key={item.id}
      type="button"
      className={styles.item}
      onClick={() => onChange(item.path)}
      aria-current={current === item.path ? 'page' : undefined}
    >
      <span className={styles.icon}>
        <NavIcon id={item.id} />
      </span>
      <span>{item.label}</span>
    </button>
  );

  const actionIconClass = `${styles.icon} ${styles.actionIcon} ${
    diceAnimating ? styles.actionIconRollNext : rollCardClosing ? styles.actionIconRollClose : ''
  }`;
  const actionLabelClass = `${styles.actionLabel} ${
    diceAnimating
      ? styles.actionLabelDown
      : rollCardClosing
        ? styles.actionLabelUp
        : hideLabel
          ? styles.actionLabelHidden
          : ''
  }`;

  return (
    <nav className={styles.nav}>
      {renderNavButton(NAV_ITEMS[0])}
      <button
        type="button"
        className={`${styles.action} ${!hideLabel ? styles.actionWithLabel : ''} ${
          diceAnimating ? styles.actionRolling : ''
        }`}
        onClick={onAdvance}
      >
        <span className={actionIconClass}>
          <span
            className={`${styles.actionDice} ${!diceAnimating && !hideLabel ? styles.actionDiceSmall : ''} ${
              rolling ? styles.actionDiceRolling : styles.actionDiceResult
            }`}
            role="img"
            aria-label={`Кубик показывает ${diceValue}`}
          >
            {DICE_PIP_KEYS.map((key) => {
              const active = DICE_FACE_MAP[diceValue]?.includes(key);
              const classKey = `diceDot${key.charAt(0).toUpperCase()}${key.slice(1)}`;
              const positionClass = styles[classKey] || '';
              const dotClassName = `${styles.diceDot} ${positionClass} ${
                active ? styles.diceDotVisible : ''
              }`;
              return <span key={key} className={dotClassName} />;
            })}
          </span>
        </span>
        <span className={actionLabelClass}>Следующий ход</span>
      </button>
      {renderNavButton(NAV_ITEMS[1])}
    </nav>
  );
}

export default BottomNav;
