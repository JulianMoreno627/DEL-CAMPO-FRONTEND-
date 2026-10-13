/**
 * Calculation Web Worker: runs heavy work off the main thread so the interface does not freeze.
 * The performance view uses it to compare the same calculation on the main thread and here.
 */
import { heavyCalculation } from '../utils/geo.js';

const tasks = {
  HEAVY_CALCULATION({ n }) {
    const start = performance.now();
    const sum = heavyCalculation(n);
    return { sum, milliseconds: performance.now() - start };
  },
};

self.onmessage = ({ data }) => {
  const { id, type } = data;
  try {
    if (!tasks[type]) throw new Error(`Unknown task: ${type}`);
    self.postMessage({ id, ok: true, ...tasks[type](data) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
