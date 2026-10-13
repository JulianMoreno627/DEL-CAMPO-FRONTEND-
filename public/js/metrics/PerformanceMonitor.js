/** Core Web Vitals thresholds (web.dev): [good, needs improvement]. */
export const THRESHOLDS = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/** Descriptions shown to the user (Spanish). */
export const DESCRIPTION = {
  LCP: 'Largest Contentful Paint: cuándo se pinta el elemento principal',
  INP: 'Interaction to Next Paint: qué tan rápido responde a toques y clics',
  CLS: 'Cumulative Layout Shift: cuánto “salta” el contenido',
  FCP: 'First Contentful Paint: primer texto o imagen visible',
  TTFB: 'Time to First Byte: espera hasta el primer byte del servidor',
};

export function rate(name, value) {
  const [good, needsImprovement] = THRESHOLDS[name];
  if (value <= good) return 'GOOD';
  if (value <= needsImprovement) return 'NEEDS_IMPROVEMENT';
  return 'POOR';
}

/**
 * Real-user performance monitoring (RUM) with the browser's native APIs
 * (PerformanceObserver), no libraries. It computes LCP, INP, CLS, FCP and TTFB, counts the
 * Long Tasks (> 50 ms) and sends the values to the backend with navigator.sendBeacon
 * when the page is hidden (the beacon survives the tab being closed).
 */
export class PerformanceMonitor extends EventTarget {
  #pendingReport = new Set();
  #interactions = new Map(); // interactionId -> max duration

  constructor({ reportUrl }) {
    super();
    this.reportUrl = reportUrl;
    this.values = {};
    this.longTasks = { count: 0, totalMs: 0 };
  }

  start() {
    this.#observe('paint', (e) => {
      if (e.name === 'first-contentful-paint') this.#set('FCP', e.startTime);
    });

    this.#observe('largest-contentful-paint', (e) => this.#set('LCP', e.startTime));

    // CLS with "session windows": bursts of shifts less than 1 s apart, 5 s max; the worst one counts.
    let session = 0;
    let first = 0;
    let last = 0;
    this.#observe('layout-shift', (e) => {
      if (e.hadRecentInput) return;
      if (session && e.startTime - last < 1000 && e.startTime - first < 5000) {
        session += e.value;
      } else {
        session = e.value;
        first = e.startTime;
      }
      last = e.startTime;
      if (session > (this.values.CLS ?? 0)) this.#set('CLS', session);
    });
    if (this.values.CLS == null) this.#set('CLS', 0);

    // INP: the slowest interaction (ignoring 1 in 50 as outliers)
    this.#observe('event', (e) => {
      if (!e.interactionId) return;
      if (e.duration <= (this.#interactions.get(e.interactionId) ?? 0)) return;
      this.#interactions.set(e.interactionId, e.duration);
      const durations = [...this.#interactions.values()].sort((a, b) => b - a);
      this.#set('INP', durations[Math.min(durations.length - 1, Math.floor(durations.length / 50))]);
    }, { durationThreshold: 16 });

    this.#observe('longtask', (e) => {
      this.longTasks.count += 1;
      this.longTasks.totalMs += e.duration;
      this.dispatchEvent(new Event('change'));
    });

    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) this.#set('TTFB', navigation.responseStart);

    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.report();
    });
    addEventListener('pagehide', () => this.report());
  }

  #observe(type, fn, options = {}) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...options });
  }

  #set(name, value) {
    this.values[name] = value;
    this.#pendingReport.add(name);
    this.dispatchEvent(new Event('change'));
  }

  report() {
    if (!this.#pendingReport.size || !navigator.sendBeacon) return;
    const batch = [...this.#pendingReport].map((name) => ({
      name,
      value: name === 'CLS' ? Number(this.values[name].toFixed(4)) : Math.round(this.values[name]),
      page: location.hash.split('?')[0] || '#/',
      connection: navigator.connection?.effectiveType,
    }));
    this.#pendingReport.clear();
    // text/plain is a "simple" type: it does not trigger a CORS preflight, so the beacon reaches the backend on another origin
    navigator.sendBeacon(this.reportUrl, new Blob([JSON.stringify(batch)], { type: 'text/plain' }));
  }

  /** Latest API requests: total duration vs server time (Server-Timing header). */
  apiRequests(limit = 12) {
    return performance.getEntriesByType('resource')
      .filter((r) => r.name.includes('/api/') && !r.name.includes('/api/metrics'))
      .slice(-limit)
      .reverse()
      .map((r) => {
        const server = r.serverTiming?.find((s) => s.name === 'app')?.duration;
        return {
          route: new URL(r.name).pathname,
          total: r.duration,
          server: server ?? null,
          network: server != null ? Math.max(0, r.duration - server) : null,
          bytes: r.transferSize,
          fromCache: r.transferSize === 0 && r.decodedBodySize > 0,
        };
      });
  }

  /** Render time of each view (the Router's performance.measure). */
  viewTimings() {
    return performance.getEntriesByType('measure')
      .filter((m) => m.name.startsWith('view '))
      .slice(-10)
      .reverse()
      .map((m) => ({ view: m.name.slice(5), milliseconds: m.duration }));
  }
}
