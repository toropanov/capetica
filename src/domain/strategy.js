const RISK_WEIGHTS = { cash: 1, bonds: 1.5, stocks: 3, crypto: 5 };
const LIQUIDITY_WEIGHTS = { cash: 5, bonds: 4, stocks: 3, crypto: 2 };

function normalizeScore(value) {
  const clamped = Math.max(1, Math.min(5, value || 1));
  return Math.round(((clamped - 1) / 4) * 100);
}

function labelForScore(score) {
  if (score < 35) return 'Низкий';
  if (score < 70) return 'Средний';
  return 'Высокий';
}

function labelForLiquidity(score) {
  if (score < 35) return 'Низкая';
  if (score < 70) return 'Средняя';
  return 'Высокая';
}

export function computeStrategyIndicators({
  cash = 0,
  investments = {},
  priceState = {},
  deals = [],
  instrumentMap = {},
}) {
  let totalValue = Math.max(0, cash);
  let riskSum = cash * RISK_WEIGHTS.cash;
  let liquiditySum = cash * LIQUIDITY_WEIGHTS.cash;
  const allocations = [];
  const addAllocation = (label, value) => {
    if (value <= 0) return;
    allocations.push({ label, value });
  };
  addAllocation('Деньги', cash);
  Object.entries(investments).forEach(([instrumentId, holding]) => {
    const info = instrumentMap[instrumentId];
    const type = info?.type || 'stocks';
    const price = priceState[instrumentId]?.price || info?.initialPrice || 0;
    const value = (holding?.units || 0) * price;
    if (value <= 1) return;
    totalValue += value;
    riskSum += value * (RISK_WEIGHTS[type] || RISK_WEIGHTS.stocks);
    liquiditySum += value * (LIQUIDITY_WEIGHTS[type] || LIQUIDITY_WEIGHTS.stocks);
    addAllocation(info?.title || instrumentId, value);
  });
  (deals || []).forEach((deal) => {
    if (deal.completed) return;
    const value = Math.max(0, deal.invested || 0);
    if (value <= 0) return;
    totalValue += value;
    riskSum += value * (deal.riskMeter || 3);
    liquiditySum += value * (deal.liquidityMeter || 2);
    addAllocation(`Сделка: ${deal.title}`, value);
  });
  if (totalValue <= 0) {
    return {
      riskScore: 0,
      liquidityScore: 0,
      diversification: 0,
      name: 'стартовая позиция',
    };
  }
  const riskAverage = riskSum / totalValue;
  const liquidityAverage = liquiditySum / totalValue;
  const normalizedRisk = normalizeScore(riskAverage);
  const normalizedLiquidity = normalizeScore(liquidityAverage);
  const maxShare =
    allocations.length > 0
      ? allocations.reduce((max, entry) => Math.max(max, entry.value / totalValue), 0)
      : 1;
  const diversification = Math.round(Math.max(0, 1 - maxShare) * 100);
  let name = 'сбалансированный рост';
  if (normalizedRisk >= 70 && normalizedLiquidity <= 40) {
    name = 'агрессивный рост';
  } else if (normalizedRisk <= 35 && normalizedLiquidity >= 65) {
    name = 'консервативный курс';
  }
  return {
    riskScore: normalizedRisk,
    riskLabel: labelForScore(normalizedRisk),
    liquidityScore: normalizedLiquidity,
    liquidityLabel: labelForLiquidity(normalizedLiquidity),
    diversification,
    name,
  };
}
