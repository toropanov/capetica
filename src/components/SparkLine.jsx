function SparkLine({ data = [], colorStart = '#9c6bff', colorStop = '#68e1fd' }) {
  if (!data.length) return null;
  const width = 280;
  const height = 80;
  const values = data.map((point) => {
    if (typeof point === 'number') return point;
    if (typeof point.value === 'number') return point.value;
    if (typeof point.price === 'number') return point.price;
    return 0;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data.map((point, index) => {
    const value =
      typeof point === 'number'
        ? point
        : typeof point.value === 'number'
          ? point.value
          : typeof point.price === 'number'
            ? point.price
            : 0;
    const x = (index / Math.max(data.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });
  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const lastPoint = points[points.length - 1];
  const areaPath = `${pathD} L${lastPoint.x},${height} L0,${height} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colorStart} />
          <stop offset="100%" stopColor={colorStop} />
        </linearGradient>
        <linearGradient id="sparkFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colorStart} stopOpacity="0.35" />
          <stop offset="100%" stopColor={colorStop} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkFill)" opacity="0.5" />
      <path
        d={pathD}
        fill="none"
        stroke="url(#sparkGradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default SparkLine;
