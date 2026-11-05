export interface Span {
  name: string;
  start: number;
  ms: number;
}
let spans: Span[] | undefined;
export const now = () => performance.timeOrigin + performance.now();
export function startProbe() {
  spans = [];
}
export function stopProbe() {
  const value = spans || [];
  spans = undefined;
  return value;
}
export function typingSpan<T>(name: string, action: () => T): T {
  const target = spans,
    start = now();
  try {
    return action();
  } finally {
    target?.push({ name, start, ms: now() - start });
  }
}
