import {
  buildMatrixFromObject,
  choleskyDecomposition,
  ensureSeed,
  generateCorrelatedNormals,
  normalWithParams,
  seedFromString,
  uniformFromSeed,
} from './rng';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeCycles(cycles = [], monthIndex = 0) {
  const result = {};
  cycles.forEach((cycle) => {
    const period = cycle.periodMonths || 1;
    const amplitude = cycle.amplitude || 0;
    const phase = cycle.phase || 0;
    const angle = (2 * Math.PI * (monthIndex + 1)) / period + phase;
    result[cycle.id] = amplitude * Math.sin(angle);
  });
  return result;
}

function rollShocks({ shockModel, month, seed, previousState = {} }) {
  const impacts = {};
  let cursorSeed = seed;
  const stateCopy = { ...previousState };
  const events = shockModel?.events || [];
  events.forEach((event) => {
    const lastTrigger = stateCopy[event.id] ?? -Infinity;
    const cooldown = event.cooldownMonths || 0;
    if (month - lastTrigger < cooldown) {
      return;
    }
    const roll = uniformFromSeed(cursorSeed);
    cursorSeed = roll.seed;
    if (roll.value < event.probMonthly) {
      const impact = normalWithParams(
        cursorSeed,
        event.meanLogImpact || 0,
        event.stdLogImpact || 0,
      );
      cursorSeed = impact.seed;
      impacts[event.id] = impact.value;
      stateCopy[event.id] = month;
    }
  });
  return { impacts, seed: cursorSeed, nextState: stateCopy };
}

function buildSyntheticHistory(instrument, baseSeed, length = 18) {
  const history = [];
  const minPrice = Math.max(5, (instrument.initialPrice || 100) * 0.2);
  let price = instrument.initialPrice || 100;
  history.unshift({ month: 0, price });
  let cursorSeed = ensureSeed(baseSeed + seedFromString(instrument.id));
  for (let i = 1; i <= length; i += 1) {
    const drift = (instrument.model?.muMonthly || 0) * 0.5;
    const vol = Math.max(0.01, (instrument.model?.sigmaMonthly || 0.05) * 0.9);
    const { value, seed: nextSeed } = normalWithParams(cursorSeed, drift, vol);
    cursorSeed = nextSeed;
    const cap = clamp((instrument.model?.sigmaMonthly || 0.05) * 3, 0.15, 0.45);
    const bounded = clamp(value, -cap, cap);
    price = Math.max(price * Math.exp(bounded), minPrice);
    history.unshift({ month: -i, price });
  }
  return history;
}

export function seedPriceState(instruments = [], seed) {
  const map = {};
  const baseSeed = ensureSeed(seed ?? Date.now());
  instruments.forEach((instrument, index) => {
    const history = buildSyntheticHistory(instrument, baseSeed + index * 97);
    const prevPrice = history[history.length - 2]?.price || instrument.initialPrice;
    const lastReturn = prevPrice ? instrument.initialPrice / prevPrice - 1 : 0;
    map[instrument.id] = {
      price: instrument.initialPrice,
      history,
      lastReturn,
    };
  });
  return map;
}

export function simulateMarkets({
  month,
  priceState,
  instruments,
  marketsConfig,
  rngSeed,
  shockState,
}) {
  if (!marketsConfig || !Array.isArray(instruments) || !instruments.length) {
    return { priceState, rngSeed, shockState, returns: {} };
  }
  const ids = instruments.map((instrument) => instrument.id);
  const corrMatrixObject = marketsConfig.correlations?.matrix || {};
  const lower = choleskyDecomposition(buildMatrixFromObject(corrMatrixObject, ids));
  const correlatedNormals = generateCorrelatedNormals(ids.length, lower, rngSeed);
  let cursorSeed = correlatedNormals.seed;
  const randomVector = correlatedNormals.values;
  const cycles = computeCycles(marketsConfig.cycles, month);
  const shocks = rollShocks({
    shockModel: marketsConfig.shockModel,
    month,
    seed: cursorSeed,
    previousState: shockState,
  });
  cursorSeed = shocks.seed;
  const shockImpacts = shocks.impacts;
  const newShockState = shocks.nextState;
  const nextPrices = {};
  const returns = {};
  instruments.forEach((instrument, index) => {
    const prev = priceState[instrument.id] || {
      price: instrument.initialPrice,
      history: [{ month: 0, price: instrument.initialPrice }],
      lastReturn: 0,
    };
    const sigma = instrument.model?.sigmaMonthly || 0;
    const mu = instrument.model?.muMonthly || 0;
    const randomComponent = sigma * (randomVector[index] ?? 0);
    const cycleContribution = (instrument.model?.cycleRefs || []).reduce(
      (acc, cycleId) => acc + (cycles[cycleId] || 0),
      0,
    );
    const shockContribution = (instrument.model?.shockRefs || []).reduce(
      (acc, shockId) => acc + (shockImpacts[shockId] || 0),
      0,
    );
    let logReturn = mu + randomComponent + cycleContribution + shockContribution;
    const globalMaxAbs = marketsConfig.global?.maxMonthlyReturnAbs;
    if (typeof globalMaxAbs === 'number') {
      logReturn = clamp(logReturn, -globalMaxAbs, globalMaxAbs);
    }
    const drawdownClamp = instrument.model?.maxDrawdownClamp;
    if (typeof drawdownClamp === 'number') {
      const floor = Math.log(Math.max(1 - drawdownClamp, 0.05));
      logReturn = Math.max(logReturn, floor);
    }
    const minPrice = marketsConfig.global?.minPrice || 0.01;
    const nextPrice = Math.max(prev.price * Math.exp(logReturn), minPrice);
    const nextHistory = [...prev.history, { month: month + 1, price: nextPrice }];
    while (nextHistory.length > 180) {
      nextHistory.shift();
    }
    nextPrices[instrument.id] = {
      price: nextPrice,
      history: nextHistory,
      lastReturn: Math.exp(logReturn) - 1,
    };
    returns[instrument.id] = Math.exp(logReturn) - 1;
  });
  return {
    priceState: nextPrices,
    rngSeed: cursorSeed,
    shockState: newShockState,
    returns,
  };
}
