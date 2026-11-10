import { sendStages } from '../../shared/chat-sync-diagnostics/index.ts';
import type { TraceEvent } from './events.ts';

export const sendCases = [
  'text',
  'ordinary-image',
  'view-once-image',
  'ordinary-video',
  'view-once-video',
] as const;
export type SendCase = (typeof sendCases)[number];
type StageTiming = {
  count: number;
  durationMs: number;
  failed: boolean;
  firstStartMs: number | null;
  lastEndMs: number | null;
  inFlight: number;
};
interface SendSummary {
  slot: number;
  label: SendCase;
  selectedMs: number;
  submitMs: number | null;
  acceptedMs: number | null;
  checkRenderMs: number | null;
  manualMarkerMs: number | null;
  publishResponseMs: number | null;
  message: number | null;
  ambiguous: boolean;
  longestTaskMs: number;
  stages: Record<string, StageTiming>;
  upload: {
    firstPartMs: number | null;
    lastPartMs: number | null;
    startedParts: number;
    completedParts: number;
    failedParts: number;
    inFlight: number;
    peakInFlight: number;
  };
}
const partOperations = new Set(['attachment-part', 'view-once-part']);
const sendOperations = new Set([
  ...partOperations,
  'attachment-reserve',
  'attachment-finish',
  'view-once-create',
  'publish',
  'dm-publish',
]);
type RequestTiming = {
  send: SendSummary;
  part: boolean;
  publish: boolean;
  ok: boolean;
};

/** Five comparison cases outlive timeline eviction. No payload or durable ID
 * enters this owner; network attribution requires one send at a time. */
export class ComparisonSends {
  private readonly sends: SendSummary[] = [];
  private readonly requests = new Map<string, RequestTiming>();
  private active: SendSummary | undefined;
  private overflow = 0;
  private requestOverflow = 0;
  private internal = false;
  begin(label: SendCase, ms: number): number | null {
    if (!sendCases.includes(label))
      throw new Error('Choose a fixed send case.');
    if (this.sends.length === 5) {
      this.overflow++;
      return null;
    }
    const ambiguous = this.active
      ? unfinished(this.active, this.internal)
      : false;
    if (this.active) this.active.ambiguous ||= ambiguous;
    const send: SendSummary = {
      slot: this.sends.length + 1,
      label,
      selectedMs: ms,
      submitMs: null,
      acceptedMs: null,
      checkRenderMs: null,
      manualMarkerMs: null,
      publishResponseMs: null,
      message: null,
      ambiguous,
      longestTaskMs: 0,
      stages: {},
      upload: {
        firstPartMs: null,
        lastPartMs: null,
        startedParts: 0,
        completedParts: 0,
        failedParts: 0,
        inFlight: 0,
        peakInFlight: 0,
      },
    };
    this.sends.push(send);
    this.active = send;
    return send.slot;
  }
  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-coverage')
      this.internal = event['sendTimings'] === true;
    if (event.kind === 'reuse-send') this.stage(event);
    if (event.kind === 'request-start') this.startRequest(event);
    this.finishRequest(event);
    this.presentation(event);
  }
  private presentation(event: TraceEvent): void {
    const send = this.active;
    if (!send) return;
    if (event.kind === 'long-task' && typeof event['durationMs'] === 'number')
      send.longestTaskMs = Math.max(send.longestTaskMs, event['durationMs']);
    if (event.kind === 'manual-marker') send.manualMarkerMs ??= event.ms;
    if (event.kind === 'send-action' && event['sendDisabled'] === false)
      send.submitMs ??= event.ms;
  }
  private stage(event: TraceEvent): void {
    const send = this.forMessage(event);
    if (!send) return;
    const stage = event['sendStage'];
    if (!sendStages.some((value) => value === stage)) return;
    if (event['sendPhase'] === 'point') {
      this.point(send, event);
      return;
    }
    if (typeof stage !== 'string') return;
    this.duration(send, event, stage);
  }
  private duration(send: SendSummary, event: TraceEvent, stage: string): void {
    const timing = (send.stages[stage] ??= {
      count: 0,
      durationMs: 0,
      failed: false,
      firstStartMs: null,
      lastEndMs: null,
      inFlight: 0,
    });
    if (event['sendPhase'] === 'start') {
      timing.firstStartMs ??= event.ms;
      timing.inFlight++;
      return;
    }
    if (event['sendPhase'] !== 'end' || typeof event['sendMs'] !== 'number')
      return;
    timing.count++;
    timing.durationMs += event['sendMs'];
    timing.failed ||= event['sendSuccess'] === false;
    timing.lastEndMs = event.ms;
    timing.inFlight = Math.max(0, timing.inFlight - 1);
  }

  private forMessage(event: TraceEvent): SendSummary | undefined {
    const message = event['message'];
    if (typeof message !== 'number') return this.active;
    const known = this.sends.find((send) => send.message === message);
    if (known) return known;
    if (event['sendStage'] !== 'submit') return undefined;
    if (!this.active) return undefined;
    if (this.active.message !== null) {
      this.active.ambiguous = true;
      return undefined;
    }
    this.active.message = message;
    return this.active;
  }
  private point(send: SendSummary, event: TraceEvent): void {
    switch (event['sendStage']) {
      case 'submit':
        send.submitMs ??= event.ms;
        break;
      case 'accepted':
        send.acceptedMs ??= event.ms;
        break;
      case 'check-render':
        send.checkRenderMs ??= event.ms;
        break;
    }
  }
  private startRequest(event: TraceEvent): void {
    const category = event['category'];
    if (
      !this.active ||
      typeof category !== 'string' ||
      typeof event['id'] !== 'string'
    )
      return;
    const operation = category.replace(/^messages\//u, '');
    if (!sendOperations.has(operation)) return;
    if (this.requests.size === 64) {
      this.requestOverflow++;
      return;
    }
    const part = partOperations.has(operation);
    this.requests.set(event['id'], {
      send: this.active,
      part,
      publish: operation === 'publish' || operation === 'dm-publish',
      ok: false,
    });
    if (part) {
      const upload = this.active.upload;
      upload.firstPartMs ??= event.ms;
      upload.startedParts++;
      upload.peakInFlight = Math.max(upload.peakInFlight, ++upload.inFlight);
    }
  }
  private finishRequest(event: TraceEvent): void {
    if (typeof event['id'] !== 'string') return;
    const request = this.requests.get(event['id']);
    if (!request) return;
    if (event.kind === 'response-headers') {
      request.ok = successfulStatus(event['status']);
      return;
    }
    if (
      !['response-body', 'request-failed', 'response-body-failed'].includes(
        event.kind,
      )
    )
      return;
    this.requests.delete(event['id']);
    const ok = event.kind === 'response-body' && request.ok;
    if (request.publish && ok) request.send.publishResponseMs = event.ms;
    if (!request.part) return;
    const upload = request.send.upload;
    upload.inFlight--;
    upload.lastPartMs = event.ms;
    if (ok) upload.completedParts++;
    else upload.failedParts++;
  }
  report() {
    return {
      limit: 5,
      overflow: this.overflow,
      requestOverflow: this.requestOverflow,
      internalStagesAvailable: this.internal,
      networkAttribution:
        'one-send-at-a-time-in-this-tab; HTTP-success-is-not-acceptance',
      checkMeaning:
        'accepted-own-check-in-visible-DOM; not-physical-paint-or-recipient-receipt',
      sends: this.sends.map((send) => {
        const missing = missingStages(send);
        return {
          ...send,
          stages: structuredClone(send.stages),
          upload: {
            ...send.upload,
            wallMs:
              send.upload.firstPartMs === null ||
              send.upload.lastPartMs === null
                ? null
                : send.upload.lastPartMs - send.upload.firstPartMs,
          },
          missingStages: missing,
          complete:
            missing.length === 0 &&
            !send.ambiguous &&
            send.upload.failedParts === 0 &&
            this.requestOverflow === 0,
          clickToAcceptanceMs: difference(send.acceptedMs, send.submitMs),
          clickToCheckMs: difference(send.checkRenderMs, send.submitMs),
        };
      }),
    };
  }
}
function difference(end: number | null, start: number | null): number | null {
  return end === null || start === null ? null : end - start;
}
function missingStages(send: SendSummary): string[] {
  const missing = [];
  for (const key of [
    'submitMs',
    'acceptedMs',
    'checkRenderMs',
    'manualMarkerMs',
  ] as const)
    if (send[key] === null) missing.push(key);
  if (send.label !== 'text' && send.upload.completedParts === 0)
    missing.push('upload');
  if (send.upload.inFlight) missing.push('in-flight-parts');
  if (Object.values(send.stages).some((stage) => stage.inFlight))
    missing.push('in-flight-stage');
  return missing;
}

function successfulStatus(status: unknown): boolean {
  return typeof status === 'number' && status >= 200 && status < 300;
}
function unfinished(send: SendSummary, internal: boolean): boolean {
  if (send.submitMs === null) return false;
  const pending = internal
    ? send.acceptedMs === null
    : send.publishResponseMs === null;
  return pending || send.manualMarkerMs === null || send.upload.inFlight > 0;
}
