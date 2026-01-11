import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { id: 'career', label: 'Карьера', path: '/app' },
  { id: 'bank', label: 'Банк', path: '/app/bank' },
  { id: 'deals', label: 'Сделки', path: '/app/deals' },
];

function Icon({ id, active }) {
  const stroke = active ? '#0b1024' : '#8ca2d8';
  switch (id) {
    case 'career':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 9V7C5 5.89543 5.89543 5 7 5H17C18.1046 5 19 5.89543 19 7V9"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="4" y="9" width="16" height="10" rx="2" stroke={stroke} strokeWidth="2" />
          <path d="M9 13H15" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M9 17L10.5 15L12 17L13.5 15L15 17" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case 'bank':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="12" rx="3" stroke={stroke} strokeWidth="2" />
          <path d="M7 12H13" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="17" cy="12" r="1.8" fill={stroke} opacity="0.7" />
        </svg>
      );
    case 'deals':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12L9.5 7.5L12 10L14.5 7.5L20 12"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 13.5V18H10V15.5"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 15.5V18H18.5V13.5"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="6" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="2" />
          <rect x="14" y="6" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="2" opacity="0.8" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="2" opacity="0.8" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="2" />
        </svg>
      );
  }
}

function BottomNav({ current, onChange }) {
  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map((item) => {
        const active = current === item.path;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.item} ${active ? styles.active : ''}`}
            onClick={() => onChange(item.path)}
          >
            <span className={styles.icon}>
              <Icon id={item.id} active={active} />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
