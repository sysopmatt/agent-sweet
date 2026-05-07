/**
 * Memory debugging HUD — gated behind ``?debug=1`` in the URL.
 *
 * Components register state-size stats via ``setDebugStat``; the logger
 * runs on a 5s interval, samples the JS heap (Chrome-only) and a few
 * cheap DOM counts, and dumps a single line to the console with a
 * ``[mem]`` prefix.
 *
 * Goal: when investigating tab-OOM crashes, see at a glance which
 * counters grow and which stay flat, vs. a heap that grows without any
 * counter rising (= a retainer we haven't located).
 *
 * Intentionally a no-op when the flag isn't set so it can ship to
 * everyone with no overhead.
 */

const ENABLED =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "1";

const stats: Record<string, number | string> = {};
let intervalId: number | null = null;
let startedAt = 0;

interface ChromeMemory {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export function isMemDebugEnabled(): boolean {
  return ENABLED;
}

/** Components call this whenever a tracked counter changes. No-op if disabled. */
export function setDebugStat(key: string, value: number | string): void {
  if (!ENABLED) return;
  stats[key] = value;
}

/** Start the periodic logger. Idempotent. Safe to call from a useEffect. */
export function startMemDebugLogger(): void {
  if (!ENABLED || intervalId !== null) return;
  startedAt = Date.now();
  // Log immediately so we have a baseline at t=0.
  logTick();
  intervalId = window.setInterval(logTick, 5000);
  // Expose a manual hook so the user can dump on demand from devtools.
  (window as unknown as { __memDump?: () => void }).__memDump = logTick;

  console.log("[mem] debug HUD enabled — logs every 5s. Call __memDump() to dump on demand.");
}

function logTick(): void {
  const memory: ChromeMemory =
    (performance as unknown as { memory?: ChromeMemory }).memory ?? {};
  const domNodes = document.querySelectorAll(".react-flow__node").length;
  const domEdges = document.querySelectorAll(".react-flow__edge").length;
  const totalDom = document.querySelectorAll("*").length;
  const detailsOpen = document.querySelectorAll("details[open]").length;

  const tickAgeSec = Math.round((Date.now() - startedAt) / 1000);
  const row: Record<string, number | string> = {
    t_sec: tickAgeSec,
    ...stats,
    rfNodes: domNodes,
    rfEdges: domEdges,
    domTotal: totalDom,
    detailsOpen,
  };
  if (memory.usedJSHeapSize) {
    row.heapUsedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    row.heapTotalMB = Math.round((memory.totalJSHeapSize ?? 0) / 1024 / 1024);
    row.heapLimitMB = Math.round((memory.jsHeapSizeLimit ?? 0) / 1024 / 1024);
  }
  console.log("[mem]", row);
}
