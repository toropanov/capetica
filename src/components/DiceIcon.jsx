function DiceIcon({ size = 24, className, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect x="4" y="4" width="16" height="16" rx="5" fill="#fff4cf" stroke="#1b1b24" strokeWidth="1.8" />
      <circle cx="9" cy="9" r="1.7" fill="#1b1b24" />
      <circle cx="15" cy="15" r="1.7" fill="#1b1b24" />
      <circle cx="15" cy="9" r="1.7" fill="#1b1b24" opacity="0.6" />
      <circle cx="9" cy="15" r="1.7" fill="#1b1b24" opacity="0.6" />
    </svg>
  );
}

export default DiceIcon;
