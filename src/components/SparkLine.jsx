import { useId } from 'react';

function buildSmoothPath(points, smoothing = 0.18) {
  if (!points.length) return '';
  const d = [`M${points[0].x},${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1] || current;
    const prevPrev = points[i - 2] || prev;
    const cp1x = prev.x + (current.x - prevPrev.x) * smoothing;
    const cp1y = prev.y + (current.y - prevPrev.y) * smoothing;
    const cp2x = current.x - (next.x - prev.x) * smoothing;
    const cp2y = current.y - (next.y - prev.y) * smoothing;
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${current.x},${current.y}`);
  }
  return d.join(' ');
}

function SparkLine({ data = [], colorStart = '#2f74ff', colorStop = '#53d7b4' }) {
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
  const paddingX = 6;
  const points = data.map((point, index) => {
    const value =
      typeof point === 'number'
        ? point
        : typeof point.value === 'number'
          ? point.value
          : typeof point.price === 'number'
            ? point.price
            : 0;
    const x =
      paddingX + (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });
  const pathD = buildSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const areaPath = `${pathD} L${lastPoint.x},${height} L${points[0].x},${height} Z`;
  const gradientId = useId();
  const fillId = useId();
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colorStart} />
          <stop offset="100%" stopColor={colorStop} />
        </linearGradient>
        <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colorStart} stopOpacity="0.35" />
          <stop offset="100%" stopColor={colorStop} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} opacity="0.5" />
      <path
        d={pathD}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default SparkLine;
