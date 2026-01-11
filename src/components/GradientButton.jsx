import styles from './GradientButton.module.css';

function GradientButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`${styles.gradientButton} ${disabled ? styles.disabled : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
    </button>
  );
}

export default GradientButton;
