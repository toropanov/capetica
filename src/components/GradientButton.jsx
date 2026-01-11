import styles from './GradientButton.module.css';

function GradientButton({ children, onClick, disabled = false, icon = null }) {
  return (
    <button
      type="button"
      className={`${styles.gradientButton} ${disabled ? styles.disabled : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export default GradientButton;
