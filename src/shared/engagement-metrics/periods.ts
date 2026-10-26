export const engagementPresets = [
  'last24h',
  'last7d',
  'day',
  'week',
  'month',
  'yesterday',
  'last-week',
  'last-month',
  'since-start',
] as const;
export type EngagementPreset = (typeof engagementPresets)[number];
const day = 86_400_000;

function calendar(at: number, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (name: string): number =>
    Number(parts.find((item) => item.type === name)?.value);
  return new Date(
    Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    ),
  );
}

function midnight(date: Date, timezone: string): number {
  const wall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  let candidate = wall;
  for (let attempt = 0; attempt < 4; attempt++) {
    const represented = calendar(candidate, timezone).getTime();
    if (represented === wall) return candidate;
    candidate += wall - represented;
  }
  throw new Error(
    'This timezone has an unsupported calendar midnight transition.',
  );
}

function start(preset: EngagementPreset, current: Date): Date {
  const date = new Date(current);
  date.setUTCHours(0, 0, 0, 0);
  if (preset.includes('week'))
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (preset.includes('month')) date.setUTCDate(1);
  return date;
}

/** Calendar arithmetic uses local dates, never a fabricated fixed 24-hour day. */
export function engagementInterval(input: {
  preset: EngagementPreset;
  cutoff: string;
  startedAt: string;
  timezone: string;
}): { from: string; to: string } {
  const cutoff = Date.parse(input.cutoff);
  if (input.preset === 'since-start')
    return { from: input.startedAt, to: input.cutoff };
  if (input.preset === 'last24h' || input.preset === 'last7d')
    return {
      from: new Date(
        cutoff - (input.preset === 'last24h' ? day : 7 * day),
      ).toISOString(),
      to: input.cutoff,
    };
  const date = start(input.preset, calendar(cutoff, input.timezone));
  let to = cutoff;
  if (['yesterday', 'last-week', 'last-month'].includes(input.preset)) {
    to = midnight(date, input.timezone);
    if (input.preset === 'last-month') date.setUTCMonth(date.getUTCMonth() - 1);
    else
      date.setUTCDate(
        date.getUTCDate() - (input.preset === 'last-week' ? 7 : 1),
      );
  }
  return {
    from: new Date(midnight(date, input.timezone)).toISOString(),
    to: new Date(to).toISOString(),
  };
}
