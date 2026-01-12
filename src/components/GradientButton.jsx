import styles from './GradientButton.module.css';

function GradientButton({
  children,
  onClick,
  disabled = false,
  icon = null,
  className = '',
  size = 'default',
  rolling = false,
}) {
  const sizeClass = size === 'compact' ? styles.compact : '';
  return (
    <button
      type="button"
      className={`${styles.gradientButton} ${disabled ? styles.disabled : ''} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      data-rolling={rolling ? 'true' : 'false'}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export default GradientButton;
