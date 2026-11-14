export interface Interval {
  startMs: number;
  endMs: number;
}
export function union(intervals: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const span of [...intervals]
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs)) {
    const last = result.at(-1);
    if (last && span.startMs <= last.endMs)
      last.endMs = Math.max(last.endMs, span.endMs);
    else result.push({ ...span });
  }
  return result;
}
export function clip(spans: readonly Interval[], window: Interval): Interval[] {
  return union(
    spans.map((s) => ({
      startMs: Math.max(s.startMs, window.startMs),
      endMs: Math.min(s.endMs, window.endMs),
    })),
  );
}
export function subtract(
  spans: readonly Interval[],
  removed: readonly Interval[],
): Interval[] {
  let result = union(spans);
  for (const cut of union(removed))
    result = result.flatMap((s) => {
      if (cut.endMs <= s.startMs || cut.startMs >= s.endMs) return [s];
      return [
        { startMs: s.startMs, endMs: Math.min(s.endMs, cut.startMs) },
        { startMs: Math.max(s.startMs, cut.endMs), endMs: s.endMs },
      ].filter((s) => s.endMs > s.startMs);
    });
  return result;
}
export const duration = (spans: readonly Interval[]): number =>
  union(spans).reduce((n, s) => n + s.endMs - s.startMs, 0);
