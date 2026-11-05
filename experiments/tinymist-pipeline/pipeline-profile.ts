// Scalar counters only; no browser performance trace or screenshot.
interface Sample {
  start: number;
  spans: Record<string, { ms: number; calls: number }>;
  marks: Record<string, number>;
}
let active: Sample | undefined;
export function beginEdit() {
  active = { start: performance.now(), spans: {}, marks: {} };
}
export function mark(name: string) {
  if (active) active.marks[name] = performance.now() - active.start;
}
export function span<T>(name: string, fn: () => T): T {
  const sample = active,
    start = performance.now();
  try {
    return fn();
  } finally {
    if (sample) {
      const value = (sample.spans[name] ||= { ms: 0, calls: 0 });
      value.ms += performance.now() - start;
      value.calls++;
    }
  }
}
export function finishEdit() {
  const result = active;
  active = undefined;
  return result ? { spans: result.spans, marks: result.marks } : undefined;
}
