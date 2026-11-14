import { PrivateSendBreakdowns } from './private-sends.ts';
import type { AuthorityWorkSummary } from './flow.ts';
import { mediaKinds } from './composition.ts';
import type { MediaKind } from './composition.ts';
import { sendStages } from '../../shared/chat-sync-diagnostics/index.ts';
import type { SendStage } from '../../shared/chat-sync-diagnostics/index.ts';
import type { TraceEvent } from './events.ts';

type SendCase =
  'text' | 'unknown' | `view-once-${MediaKind}` | `ordinary-${MediaKind}`;
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
  gesture: number;
  label: SendCase;
  composer: number;
  scope: string;
  selection: number;
  mediaKind: MediaKind;
  viewOnce: boolean | null;
  fileCount: number;
  fileBytes: number;
  fileSlots: readonly string[];
  inspectedFiles: number;
  signatureFiles: number;
  inspectionPending: boolean;
  inspectionUnavailable: boolean;
  mimeMismatch: boolean;
  inspectionMs: number;
  selectedMs: number;
  submitMs: number | null;
  acceptedMs: number | null;
  checkRenderMs: number | null;
  stagingCompleteMs: number | null;
  transferCompleteMs: number | null;
  uiAvailableMs: number | null;
  blockingReasons: string[];
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
const partOperations = new Set([
  'attachment-part',
  'view-once-part',
  'dm-attachment-part',
]);
const pointFields = {
  submit: 'submitMs',
  accepted: 'acceptedMs',
  'check-render': 'checkRenderMs',
  'staging-complete': 'stagingCompleteMs',
  'transfer-complete': 'transferCompleteMs',
  'ui-available': 'uiAvailableMs',
} as const;
const sendOperations = new Set([
  ...partOperations,
  'attachment-reserve',
  'attachment-finish',
  'dm-attachment-reserve',
  'dm-attachment-finish',
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
  private readonly privateBreakdowns = new PrivateSendBreakdowns();
  private privateRevision = 0;
  private readonly sends: SendSummary[] = [];
  private readonly requests = new Map<string, RequestTiming>();
  private active: SendSummary | undefined;
  private pending: SendSummary | undefined;
  private gesture: { id: number; composer: number } | undefined;
  private overflow = 0;
  private requestOverflow = 0;
  private internal = false;
  private handleTimings = false;
  private prepare(event: TraceEvent): void {
    if (!this.pending || this.pending.composer !== event['composer'])
      this.pending = newSummary(event.ms);
    applyComposition(this.pending, event);
  }
  private explicitPrivate(event: TraceEvent): boolean {
    return this.privateRevision === 1 && event['scope'] === 'private';
  }
  private automaticMarker(send: SendSummary): boolean {
    return (
      (this.handleTimings && send.scope === 'handle') ||
      (this.privateRevision === 1 && send.scope === 'private')
    );
  }
  private begin(event: TraceEvent): SendSummary | undefined {
    if (this.sends.length === 5) {
      this.overflow++;
      this.pending = this.active = undefined;
      return undefined;
    }
    const ambiguous =
      this.active && !this.explicitPrivate(event)
        ? unfinished(this.active, this.internal)
        : false;
    if (this.active) this.active.ambiguous ||= ambiguous;
    const send =
      this.pending &&
      this.pending.composer === event['composer'] &&
      this.pending.selection > 0 &&
      this.pending.selection === event['selection']
        ? this.pending
        : newSummary(event.ms);
    applyComposition(send, event);
    this.pending = undefined;
    send.slot = this.sends.length + 1;
    send.ambiguous = ambiguous;
    send.submitMs = event.ms;
    send.gesture = Number(event['gesture']);
    this.sends.push(send);
    this.active = send;
    return send;
  }
  private submitted(event: TraceEvent): void {
    if (!eligibleAction(event)) return;
    const id = event['gesture'],
      composer = event['composer'];
    if (typeof id !== 'number' || typeof composer !== 'number') return;
    if (this.gesture?.id === id && this.gesture.composer === composer) return;
    this.gesture = { id, composer };
    this.begin(event);
  }
  private inspected(event: TraceEvent): void {
    const matches = (send: SendSummary) =>
      send.selection > 0 && send.selection === event['selection'];
    if (this.pending && matches(this.pending)) applyFiles(this.pending, event);
    for (const send of this.sends) if (matches(send)) applyFiles(send, event);
  }
  private automatic(event: TraceEvent): void {
    switch (event.kind) {
      case 'attachment-selection':
        this.prepare(event);
        break;
      case 'attachment-inspected':
        this.inspected(event);
        break;
      case 'attachment-cleared':
        if (this.pending?.composer === event['composer'])
          this.pending = undefined;
        break;
      case 'send-action':
        this.submitted(event);
        break;
    }
  }
  observe(event: TraceEvent): void {
    this.privateBreakdowns.observe(event);
    if (event.kind === 'reuse-ready')
      this.privateRevision = Number(event['privateRevision']) || 0;
    this.automatic(event);
    if (event.kind === 'reuse-coverage') {
      this.internal = event['sendTimings'] === true;
      this.handleTimings = event['handleTimings'] === true;
    }
    if (event.kind === 'reuse-send') this.stage(event);
    this.linkedRequest(event);
    if (event.kind === 'request-start') this.startRequest(event);
    this.finishRequest(event);
    this.presentation(event);
  }
  private presentation(event: TraceEvent): void {
    const send = this.pending ?? this.active;
    if (!send) return;
    if (event.kind === 'long-task' && typeof event['durationMs'] === 'number')
      send.longestTaskMs = Math.max(send.longestTaskMs, event['durationMs']);
    if (event.kind === 'manual-marker' && this.active)
      this.active.manualMarkerMs ??= event.ms;
  }
  private stage(event: TraceEvent): void {
    const send = this.forMessage(event);
    if (!send) return;
    const stage = sendStages.find((value) => value === event['sendStage']);
    if (!stage) return;
    if (event['sendPhase'] === 'point') {
      this.point(send, event, stage);
      return;
    }
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
    if (typeof event['privateSend'] === 'number')
      return this.privateMessage(event);
    if (typeof event['privateBatch'] === 'number') return;
    const message = event['message'];
    if (typeof message !== 'number') return this.pending ?? this.active;
    const known = this.sends.find((send) => send.message === message);
    if (known) return known;
    if (event['sendStage'] !== 'submit') return;
    const unbound = this.sends.filter(
      (send) =>
        send.message === null &&
        !(this.privateRevision === 1 && send.scope === 'private'),
    );
    if (unbound.length === 1) {
      unbound[0]!.message = message;
      return unbound[0];
    }
    for (const send of unbound) send.ambiguous = true;
    return;
  }
  private privateMessage(event: TraceEvent): SendSummary | undefined {
    const known = this.sends.find(
      (send) => send.message === event['privateSend'],
    );
    if (known) return known;
    if (event['sendStage'] !== 'logical-submit') return;
    const candidates = this.sends.filter(
      (send) =>
        send.scope === 'private' &&
        send.composer === event['sendComposer'] &&
        send.gesture === event['sendGesture'] &&
        send.message === null,
    );
    if (candidates.length !== 1) {
      for (const send of candidates) send.ambiguous = true;
      return;
    }
    candidates[0]!.message = Number(event['privateSend']);
    return candidates[0];
  }
  private linkedRequest(event: TraceEvent): void {
    if (
      event.kind !== 'reuse-send' ||
      event['sendStage'] !== 'request-dispatch' ||
      typeof event['sendSpan'] !== 'number'
    )
      return;
    const send = this.forMessage(event);
    if (!send) return;
    const id = `private-${event['sendSpan']}`;
    if (event['sendPhase'] === 'start')
      this.startRequest(
        { ...event, id, category: String(event['sendRequest']) },
        send,
      );
    if (event['sendPhase'] === 'end') {
      this.finishRequest({
        ...event,
        id,
        kind: 'response-headers',
        status: event['sendSuccess'] === true ? 200 : 500,
      });
      this.finishRequest({
        ...event,
        id,
        kind:
          event['sendSuccess'] === true ? 'response-body' : 'request-failed',
      });
    }
  }
  private point(send: SendSummary, event: TraceEvent, stage: SendStage): void {
    const field = pointFields[stage as keyof typeof pointFields];
    if (field) send[field] ??= event.ms;
    const reason = event['sendBlock'];
    if (
      stage === 'ui-blocked' &&
      typeof reason === 'string' &&
      !send.blockingReasons.includes(reason)
    )
      send.blockingReasons.push(reason);
  }
  private requestSend(
    event: TraceEvent,
    linked?: SendSummary,
  ): SendSummary | undefined {
    const send = linked ?? this.active;
    if (!linked && send?.scope === 'private' && this.privateRevision === 1)
      return;
    if (
      typeof event['category'] !== 'string' ||
      typeof event['id'] !== 'string'
    )
      return;
    return send;
  }
  private startRequest(event: TraceEvent, linked?: SendSummary): void {
    const send = this.requestSend(event, linked);
    if (!send) return;
    const category = String(event['category']);
    const operation = category.replace(/^messages\//u, '');
    if (!sendOperations.has(operation)) return;
    if (this.requests.size === 64) {
      this.requestOverflow++;
      return;
    }
    const part = partOperations.has(operation);
    this.requests.set(String(event['id']), {
      send,
      part,
      publish: operation === 'publish' || operation === 'dm-publish',
      ok: false,
    });
    if (part) {
      const upload = send.upload;
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
  private complete(
    send: SendSummary,
    missing: string[],
    privateLatency: ReturnType<PrivateSendBreakdowns['report']>,
  ): boolean {
    return (
      missing.length === 0 &&
      !send.ambiguous &&
      send.upload.failedParts === 0 &&
      this.requestOverflow === 0 &&
      this.privateComplete(send, privateLatency)
    );
  }
  private privateComplete(
    send: SendSummary,
    report: ReturnType<PrivateSendBreakdowns['report']>,
  ): boolean {
    if (this.privateRevision !== 1 || send.scope !== 'private') return true;
    const coverage = report.sends.find(
      (s) => s.slot === send.message,
    )?.coverage;
    if (!coverage) return false;
    return (
      coverage.missing.length === 0 &&
      coverage.truncatedSpans.length === 0 &&
      coverage.overflow === 0 &&
      !coverage.authorityOverflow
    );
  }
  report(
    flow: { authority: readonly AuthorityWorkSummary[]; overflow: boolean } = {
      authority: [],
      overflow: false,
    },
  ) {
    const privateLatency = this.privateBreakdowns.report(flow);
    return {
      privateLatency,
      limit: 5,
      overflow: this.overflow,
      requestOverflow: this.requestOverflow,
      internalStagesAvailable: this.internal,
      detection: 'automatic-file-selection-and-send-gestures',
      fileIdentity: 'per-capture-SHA256-mapping; hashes-never-exported',
      inspectionLimits: {
        fileBytes: 16_000_000,
        queued: 16,
        inFlight: 1,
        readMs: 5000,
        fileSlots: 128,
      },
      networkAttribution:
        'explicit-private-request-slots-with-revision-1; legacy-one-send-at-a-time; HTTP-success-is-not-acceptance',
      checkMeaning:
        'accepted-own-check-in-visible-DOM; not-physical-paint-or-recipient-receipt',
      sends: this.sends.map((send) => {
        const missing = missingStages(send, this.automaticMarker(send));
        return {
          ...send,
          privateLatency:
            privateLatency.sends.find((s) => s.slot === send.message) ?? null,
          fileSlots: [...send.fileSlots],
          blockingReasons: [...send.blockingReasons],
          acceptance: send.acceptedMs === null ? 'not-observed' : 'accepted',
          render:
            send.checkRenderMs !== null
              ? 'observed'
              : send.acceptedMs === null
                ? 'awaiting-acceptance'
                : 'absent-after-acceptance',
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
          complete: this.complete(send, missing, privateLatency),
          clickToAcceptanceMs: difference(send.acceptedMs, send.submitMs),
          clickToCheckMs: difference(send.checkRenderMs, send.submitMs),
          clickToUiAvailableMs: difference(send.uiAvailableMs, send.submitMs),
        };
      }),
    };
  }
}
function difference(end: number | null, start: number | null): number | null {
  return end === null || start === null ? null : end - start;
}
function missingStages(
  send: SendSummary,
  hasAutomaticMarker: boolean,
): string[] {
  const missing = [];
  for (const key of ['submitMs', 'acceptedMs', 'checkRenderMs'] as const)
    if (send[key] === null) missing.push(key);
  if (send.manualMarkerMs === null && !hasAutomaticMarker)
    missing.push('manualMarkerMs');
  if (send.mediaKind !== 'text' && send.upload.completedParts === 0)
    missing.push('upload');
  if (send.upload.inFlight) missing.push('in-flight-parts');
  if (send.inspectionPending) missing.push('file-inspection');
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
  return pending || send.upload.inFlight > 0;
}

function newSummary(ms: number): SendSummary {
  return {
    slot: 0,
    gesture: 0,
    label: 'unknown',
    composer: 0,
    scope: 'unknown',
    selection: 0,
    mediaKind: 'unknown',
    viewOnce: null,
    fileCount: -1,
    fileBytes: -1,
    fileSlots: [],
    inspectedFiles: 0,
    signatureFiles: 0,
    inspectionPending: false,
    inspectionUnavailable: false,
    mimeMismatch: false,
    inspectionMs: 0,
    selectedMs: ms,
    submitMs: null,
    acceptedMs: null,
    checkRenderMs: null,
    stagingCompleteMs: null,
    transferCompleteMs: null,
    uiAvailableMs: null,
    blockingReasons: [],
    manualMarkerMs: null,
    publishResponseMs: null,
    message: null,
    ambiguous: false,
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
}
function eligibleAction(event: TraceEvent): boolean {
  return (
    event['sendDisabled'] === false &&
    event['sendHidden'] !== true &&
    event['formHidden'] !== true &&
    ['enter', 'button', 'submit'].includes(String(event['cause']))
  );
}
function applyComposition(send: SendSummary, event: TraceEvent): void {
  send.composer = typeof event['composer'] === 'number' ? event['composer'] : 0;
  send.selection =
    typeof event['selection'] === 'number' ? event['selection'] : 0;
  send.scope = ['private', 'handle', 'group'].includes(String(event['scope']))
    ? String(event['scope'])
    : 'unknown';
  send.viewOnce =
    typeof event['viewOnce'] === 'boolean' ? event['viewOnce'] : null;
  applyFiles(send, event);
}
function applyFiles(send: SendSummary, event: TraceEvent): void {
  send.mediaKind =
    mediaKinds.find((kind) => kind === event['mediaKind']) ?? 'unknown';
  for (const key of [
    'fileCount',
    'fileBytes',
    'inspectedFiles',
    'signatureFiles',
    'inspectionMs',
  ] as const)
    if (typeof event[key] === 'number') send[key] = event[key];
  for (const key of [
    'inspectionPending',
    'inspectionUnavailable',
    'mimeMismatch',
  ] as const)
    if (typeof event[key] === 'boolean') send[key] = event[key];
  const slots = event['fileSlots'];
  if (Array.isArray(slots))
    send.fileSlots = slots
      .filter(
        (slot: unknown): slot is string =>
          typeof slot === 'string' && /^file-[0-9]{1,3}$/u.test(slot),
      )
      .slice(0, 16);
  send.label = caseLabel(send.mediaKind, send.viewOnce);
}
function caseLabel(kind: MediaKind, once: boolean | null): SendCase {
  if (once === null) return 'unknown';
  if (kind === 'text' && !once) return 'text';
  return once ? `view-once-${kind}` : `ordinary-${kind}`;
}
