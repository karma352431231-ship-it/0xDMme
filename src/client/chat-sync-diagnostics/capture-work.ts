import type { PrivateSendFields } from '../../shared/chat-sync-diagnostics/private-send.ts';
import type { LoadToken } from '../../shared/chat-sync-diagnostics/load.ts';
import type {
  FlowDiagnosticFields,
  AuthorityDiagnosticContext,
  HandleReadToken,
  HandleSendToken,
  SendPreparationPoint,
} from '../../shared/chat-sync-diagnostics/flow.ts';
export type FlowEvent =
  'authority-work' | 'handle-read' | 'handle-refresh' | 'handle-send';
type Emit = (
  event: FlowEvent,
  fields: FlowDiagnosticFields & PrivateSendFields,
) => void;
/** Owns capture-local correlation capabilities. It never coordinates or changes
 * application scheduling. Closures become inert when their capture ends. */
export class CaptureWork {
  private ended = false;
  private works = 0;
  private overflow = false;
  private reads = 0;
  private sends = 0;
  private hint = 0;
  private readonly emit: Emit;
  private readonly resources = new WeakMap<object, number>();
  private resourceCount = 0;
  constructor(emit: Emit) {
    this.emit = emit;
  }
  private full(): undefined {
    if (!this.overflow) this.emit('authority-work', { flowOverflow: true });
    this.overflow = true;
    return undefined;
  }
  stop(): void {
    this.ended = true;
  }
  noteHint(): number {
    return ++this.hint;
  }
  read(): HandleReadToken | undefined {
    if (this.ended) return;
    if (this.reads >= 128) return this.full();
    const token = { owner: this, slot: ++this.reads };
    this.markRead(token, 'queued');
    return token;
  }
  send(): HandleSendToken | undefined {
    if (this.ended) return;
    if (this.sends >= 128) return this.full();
    const token = { owner: this, slot: ++this.sends };
    this.markSend(token, 'flush-request');
    return token;
  }
  markSend(
    token: HandleSendToken | undefined,
    sendPreparation: SendPreparationPoint,
  ): void {
    const handleSend = this.sendSlot(token);
    if (handleSend) this.emit('handle-send', { handleSend, sendPreparation });
  }
  sendSlot(token: HandleSendToken | undefined): number | undefined {
    return !this.ended && token?.owner === this ? token.slot : undefined;
  }
  slot(token: HandleReadToken | undefined): number | undefined {
    return !this.ended && token?.owner === this ? token.slot : undefined;
  }
  markRead(
    token: HandleReadToken | undefined,
    readPhase: NonNullable<FlowDiagnosticFields['readPhase']>,
  ): void {
    const handleRead = this.slot(token);
    if (handleRead)
      this.emit('handle-read', {
        handleRead,
        readPhase,
        ...(this.hint ? { handleHint: this.hint } : {}),
      });
  }
  load(input: Omit<LoadToken, 'owner'>): LoadToken | undefined {
    if (!this.ended) return { ...input, owner: this };
  }
  loadSlot(token: LoadToken | undefined): number | undefined {
    return !this.ended && token?.owner === this && token.active()
      ? token.slot
      : undefined;
  }
  private resourceSlot(resource: object): number {
    let slot = this.resources.get(resource);
    if (!slot) {
      slot = ++this.resourceCount;
      this.resources.set(resource, slot);
    }
    return slot;
  }
  queue(
    context: AuthorityDiagnosticContext,
    priority?: 'interactive',
    resource: object = this,
    linked: PrivateSendFields = {},
  ) {
    if (this.ended) return;
    if (this.works >= 512) return this.full();
    const diagnosticWork = ++this.works;
    const authorityQueue = this.resourceSlot(resource);
    const load = this.loadSlot(context.diagnosticLoad);
    const handleRead = this.slot(context.handleRead);
    const handleSend = this.sendSlot(context.handleSend);
    let settled = false;
    const point = (
      workPhase: NonNullable<FlowDiagnosticFields['workPhase']>,
    ) => {
      if (this.ended || settled) return;
      const workClockMs = Math.round(performance.now());
      this.emit('authority-work', {
        ...linked,
        diagnosticWork,
        authorityQueue,
        workClockMs,
        ...(load
          ? {
              load,
              loadMs: Math.max(
                0,
                workClockMs - context.diagnosticLoad!.startedMs,
              ),
            }
          : {}),
        workPhase,
        authorityKind: context.diagnosticOperation ?? 'vault',
        workPriority: priority ?? 'maintenance',
        ...(handleRead ? { handleRead } : {}),
        ...(handleSend ? { handleSend } : {}),
        ...(context.handleListCaller
          ? { handleListCaller: context.handleListCaller }
          : {}),
      });
      settled = workPhase === 'complete' || workPhase === 'failed';
    };
    point('queued');
    return {
      admitted: () => point('admitted'),
      start: () => {
        if (this.ended || settled) return;
        point('start');
        if (
          this.loadSlot(context.diagnosticLoad) &&
          context.diagnosticOperation === 'group-directory'
        )
          context.diagnosticLoad?.point('vault-acquired');
      },
      finish: (ok: boolean) => point(ok ? 'complete' : 'failed'),
    };
  }
}
