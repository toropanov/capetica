import styles from './Button.module.css';

function Button({ children, variant = 'secondary', disabled = false, onClick, type = 'button' }) {
  const classes = [styles.button, styles[variant] || '', disabled ? styles.disabled : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} onClick={onClick} disabled={disabled} type={type}>
      <span>{children}</span>
    </button>
  );
}

export default Button;
