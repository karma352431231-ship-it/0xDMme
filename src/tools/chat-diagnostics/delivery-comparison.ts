import type { Recording } from './recording.ts';
type Report = ReturnType<Recording['report']>;
type Message = Report['handleDelivery']['messages'][number];
/** Paired tags join the message; server-clock intervals bound cross-device time.
 * No one-way network symmetry or equality of device wall clocks is assumed. */
export function compareDelivery(sender: Report, recipient: Report) {
  const problem = comparisonProblem(sender, recipient);
  if (problem) return { available: false, reason: problem, messages: [] };
  const messages = sender.handleDelivery.messages.flatMap((sent) => {
    const received = recipient.handleDelivery.messages.find(
      (row) => row.tag && row.tag === sent.tag,
    );
    if (!received || sent.stages.submit === undefined) return [];
    return [
      {
        tag: sent.tag,
        recipientCaptureBeforeClick: captureCoverage(
          sender,
          recipient,
          sent.clickMs,
        ),
        clickToFrame: interval({
          from: sender,
          to: recipient,
          start: sent.clickMs,
          end: received.stages.frame,
        }),
        acceptedToDownloaded: interval({
          from: sender,
          to: recipient,
          start: sent.stages.accepted,
          end: received.stages.downloaded,
        }),
        acceptedToFrame: interval({
          from: sender,
          to: recipient,
          start: sent.stages.accepted,
          end: received.stages.frame,
        }),
        localProcessingMs: localDuration(
          received,
          'processing-start',
          'processing-end',
        ),
      },
    ];
  });
  return {
    available: true,
    reason: messages.length ? 'matched-tags' : 'no-matching-messages',
    messages,
    assumptions:
      'same server clock; 100ppm drift allowance per capture; frame opportunity is not physical paint',
  };
}
function comparisonProblem(a: Report, b: Report): string | undefined {
  if (a?.schema !== 3 || b?.schema !== 3) return 'incompatible-report-schema';
  const ah = a.handleDelivery,
    bh = b.handleDelivery;
  if (!ah.compatible || !bh.compatible) return 'incompatible-app-revision';
  if (!samePair(ah, bh)) return 'pair-not-confirmed-on-both-sides';
  return clockProblem(a, b);
}
function clockProblem(a: Report, b: Report): string | undefined {
  if (!validClock(a) || !validClock(b)) return 'server-clock-unavailable';
  if (!a.clock.consistent || !b.clock.consistent)
    return 'clock-samples-inconsistent';
  return undefined;
}
function interval(input: {
  from: Report;
  to: Report;
  start: number | null | undefined;
  end: number | undefined;
}) {
  const { from, to, start, end } = input;
  if (start == null || end === undefined) return null;
  const difference = to.startedAtUnixMs + end - (from.startedAtUnixMs + start);
  const drift = Math.ceil((from.elapsedMs + to.elapsedMs) * 0.0001) + 2;
  const minimumMs =
    difference + to.clock.offsetMinMs! - from.clock.offsetMaxMs! - drift;
  const maximumMs =
    difference + to.clock.offsetMaxMs! - from.clock.offsetMinMs! + drift;
  return {
    minimumMs,
    maximumMs,
    consistent: maximumMs >= minimumMs,
    entirelyNegative: maximumMs < 0,
  };
}
function localDuration(
  row: Message,
  start: 'processing-start',
  end: 'processing-end',
): number | null {
  const a = row.stages[start],
    b = row.stages[end];
  return a === undefined || b === undefined ? null : b - a;
}

function validClock(report: Report): boolean {
  const clock = report.clock;
  return (
    clock.available &&
    clock.samples > 0 &&
    typeof clock.offsetMinMs === 'number' &&
    Number.isFinite(clock.offsetMinMs) &&
    typeof clock.offsetMaxMs === 'number' &&
    Number.isFinite(clock.offsetMaxMs) &&
    clock.offsetMinMs <= clock.offsetMaxMs
  );
}

function samePair(
  a: Report['handleDelivery'],
  b: Report['handleDelivery'],
): boolean {
  return (
    a.paired &&
    b.paired &&
    !!a.pairFingerprint &&
    a.pairFingerprint === b.pairFingerprint
  );
}

function captureCoverage(
  from: Report,
  to: Report,
  start: number | null,
): string {
  const span = interval({ from, to, start, end: 0 });
  if (!span) return 'unknown-click';
  if (span.maximumMs <= 0) return 'confirmed';
  return span.minimumMs > 0 ? 'late' : 'uncertain';
}
