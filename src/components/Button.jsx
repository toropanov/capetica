import styles from './Button.module.css';

function Button({
  children,
  variant = 'secondary',
  disabled = false,
  onClick,
  type = 'button',
  className,
  ariaLabel,
  title,
}) {
  const classes = [styles.button, styles[variant] || '', className, disabled ? styles.disabled : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled}
      type={type}
      aria-label={ariaLabel}
      title={title}
    >
      <span>{children}</span>
    </button>
  );
}

export default Button;
