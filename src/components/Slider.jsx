import styles from './Slider.module.css';

function Slider({
  min = 0,
  max = 100,
  step = 10,
  value,
  onChange,
  label,
  disabled = false,
  variant = '',
  className = '',
}) {
  const wrapClassName = [
    styles.sliderWrap,
    variant ? styles[variant] : '',
    disabled ? styles.disabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapClassName}>
      {label && <div className={styles.label}>{label}</div>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={styles.slider}
        disabled={disabled}
      />
      <div className={styles.scale}>
        <span>{min.toLocaleString('ru-RU')}</span>
        <span>{max.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  );
}

export default Slider;
