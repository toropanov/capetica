import DiceIcon from './DiceIcon';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { id: 'analytics', label: 'Аналитика', path: '/app' },
  { id: 'assets', label: 'Активы', path: '/app/bank' },
];

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
  confirmingFinish = false,
  diceAnimating = false,
  actionRef,
  actionsCount = 0,
}) {
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

  return (
    <nav className={styles.nav}>
      {renderNavButton(NAV_ITEMS[0])}
      <button
        type="button"
        ref={actionRef}
        className={`${styles.action} ${confirmingFinish ? styles.actionConfirm : ''} ${diceAnimating ? styles.actionRolling : ''}`}
        onClick={onAdvance}
      >
        {actionsCount > 0 && <span className={styles.actionBadge}>{actionsCount}</span>}
        <span className={`${styles.icon} ${styles.actionIcon}`}>
          <DiceIcon />
        </span>
        <span className={styles.actionLabel}>
          {confirmingFinish ? 'Подтвердить' : 'Следующий ход'}
        </span>
      </button>
      {renderNavButton(NAV_ITEMS[1])}
    </nav>
  );
}

export default BottomNav;
