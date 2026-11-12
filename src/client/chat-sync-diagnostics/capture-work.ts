import type {
  FlowDiagnosticFields,
  AuthorityDiagnosticContext,
  HandleReadToken,
  HandleSendToken,
  SendPreparationPoint,
} from '../../shared/chat-sync-diagnostics/flow.ts';
export type FlowEvent =
  'authority-work' | 'handle-read' | 'handle-refresh' | 'handle-send';
type Emit = (event: FlowEvent, fields: FlowDiagnosticFields) => void;
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
  queue(context: AuthorityDiagnosticContext, priority?: 'interactive') {
    if (this.ended) return;
    if (this.works >= 512) return this.full();
    const diagnosticWork = ++this.works;
    const handleRead = this.slot(context.handleRead);
    const handleSend = this.sendSlot(context.handleSend);
    let settled = false;
    const point = (
      workPhase: NonNullable<FlowDiagnosticFields['workPhase']>,
    ) => {
      if (this.ended || settled) return;
      this.emit('authority-work', {
        diagnosticWork,
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
      start: () => point('start'),
      finish: (ok: boolean) => point(ok ? 'complete' : 'failed'),
    };
  }
}
