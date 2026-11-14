import {
  privateSendContext,
  privateSendPoint,
  privateSendSpan,
} from '../chat-sync-diagnostics/index.ts';
import type { SendWaitReason } from '../chat-sync-diagnostics/index.ts';

/** One submitted batch owns these observation closures until admission/reset. */
export class SubmissionDiagnostics {
  private readonly ids: readonly string[];
  private readonly waits = new Map<SendWaitReason, (() => void)[]>();
  private admitted = false;
  constructor(ids: readonly string[]) {
    this.ids = ids;
    this.point('submission-enqueued');
  }
  observe(reasons: readonly SendWaitReason[]): void {
    if (this.admitted) return;
    for (const [reason, finishes] of this.waits)
      if (!reasons.includes(reason)) {
        for (const finish of finishes) finish();
        this.waits.delete(reason);
      }
    for (const reason of reasons)
      if (!this.waits.has(reason)) {
        const finishes = this.ids.flatMap((id) => {
          const finish = privateSendSpan(
            privateSendContext(id),
            'scheduler-wait',
            { sendWait: reason },
          );
          return finish ? [finish] : [];
        });
        this.waits.set(reason, finishes);
      }
    if (!reasons.length) this.point('submission-eligible');
  }
  admit(): void {
    this.close();
    this.admitted = true;
    this.point('submission-admitted');
  }
  close(): void {
    for (const finishes of this.waits.values())
      for (const finish of finishes) finish();
    this.waits.clear();
  }
  private point(
    stage:
      'submission-enqueued' | 'submission-eligible' | 'submission-admitted',
  ): void {
    for (const id of this.ids) privateSendPoint(privateSendContext(id), stage);
  }
}
