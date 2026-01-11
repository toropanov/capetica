const UINT_MAX = 0xffffffff;

export function ensureSeed(value = Date.now()) {
  return (value >>> 0) % (UINT_MAX + 1);
}

export function uniformFromSeed(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value: result, seed: t >>> 0 };
}

export function normalFromSeed(seed) {
  const first = uniformFromSeed(seed);
  const u1 = first.value || 1e-7;
  const second = uniformFromSeed(first.seed);
  const u2 = second.value || 1e-7;
  const radius = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  const value = radius * Math.cos(theta);
  return { value, seed: second.seed };
}

export function normalWithParams(seed, mean = 0, std = 1) {
  const { value, seed: nextSeed } = normalFromSeed(seed);
  return { value: mean + std * value, seed: nextSeed };
}

export function buildMatrixFromObject(obj, order) {
  return order.map((rowId) =>
    order.map((colId) => {
      const row = obj[rowId] ?? {};
      return typeof row[colId] === 'number' ? row[colId] : rowId === colId ? 1 : 0;
    }),
  );
}

export function choleskyDecomposition(matrix) {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = 0;
      for (let k = 0; k < j; k += 1) {
        sum += lower[i][k] * lower[j][k];
      }
      if (i === j) {
        lower[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 0));
      } else {
        const divisor = lower[j][j] || 1;
        lower[i][j] = (matrix[i][j] - sum) / divisor;
      }
    }
  }
  return lower;
}

export function generateCorrelatedNormals(count, lowerMatrix, seed) {
  const normals = [];
  let cursorSeed = seed;
  while (normals.length < count) {
    const { value, seed: nextSeed } = normalFromSeed(cursorSeed);
    normals.push(value);
    cursorSeed = nextSeed;
  }
  const correlated = [];
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let j = 0; j <= i; j += 1) {
      sum += lowerMatrix[i][j] * normals[j];
    }
    correlated.push(sum);
  }
  return { values: correlated, seed: cursorSeed };
}
