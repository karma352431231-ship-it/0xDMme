import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

/** Screen presentation and loaded contacts are distinct diagnostic milestones. */
export class ContactsScreenDiagnostics {
  private trace: LoadTrace | undefined;
  private host: HTMLElement | null = null;
  show(host: HTMLElement, mode: 'contacts' | 'settings'): void {
    this.clear();
    if (mode !== 'contacts') return;
    this.host = host;
    this.trace = startLoad('contacts-screen');
    this.trace?.point('dom');
    this.trace?.frame(host, () => this.host === host);
  }
  clear(): void {
    this.trace?.point('cancelled', { loadOutcome: 'cancelled' });
    this.trace = undefined;
    this.host = null;
  }
}
