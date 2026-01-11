import {
  buildMatrixFromObject,
  choleskyDecomposition,
  generateCorrelatedNormals,
  normalWithParams,
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

export function seedPriceState(instruments = []) {
  const map = {};
  instruments.forEach((instrument) => {
    map[instrument.id] = {
      price: instrument.initialPrice,
      history: [{ month: 0, price: instrument.initialPrice }],
      lastReturn: 0,
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
