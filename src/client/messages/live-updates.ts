import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';
import { isLiveChangeCategory } from '../../shared/live-changes/index.ts';
import type {
  LiveControlEvent,
  LiveEvent,
  LiveUpdate,
} from '../message-live/protocol.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
import type { HistoryKind } from './preparation.ts';

interface MessageLivePorts {
  selected: () => HistoryKind | null;
  visible: () => boolean;
  invalidate: (event: LiveControlEvent) => void;
  hint: () => void;
  request: (
    update: LiveUpdate,
    work: VaultWorkOptions,
    scope?: HistoryKind,
  ) => void;
  inbox: (scope: HistoryKind) => void;
  projection: (work: VaultWorkOptions) => void;
  previews: () => void;
  external: (event: LiveEvent) => void;
}

const messageScopes = new Map<LiveChangeCategory, HistoryKind>([
  ['private-messages', 'direct'],
  ['group-messages', 'groups'],
]);
const receiptScopes = new Map<LiveChangeCategory, HistoryKind>([
  ['private-receipts', 'direct'],
  ['group-receipts', 'groups'],
]);

/** Only routing/scheduling lives here. Domain readers still own authorization,
 * verification and publication; unrelated hints cannot initiate their work. */
export class MessageLiveUpdates {
  private readonly ports: MessageLivePorts;
  constructor(ports: MessageLivePorts) {
    this.ports = ports;
  }

  event(event: LiveEvent): void {
    if (isLiveChangeCategory(event)) this.category(event);
    else this.control(event);
    this.ports.external(event);
  }
  private work(): VaultWorkOptions {
    return this.ports.selected() && this.ports.visible()
      ? { priority: 'interactive' }
      : {};
  }
  private category(event: LiveChangeCategory): void {
    const scope = messageScopes.get(event);
    if (scope) {
      if (scope === 'direct') this.ports.hint();
      if (this.ports.selected() === scope && this.ports.visible())
        this.ports.request('probe', this.work(), scope);
      else this.ports.inbox(scope);
      return;
    }
    const receipts = receiptScopes.get(event);
    if (receipts) {
      if (this.ports.selected() === receipts && this.ports.visible())
        this.ports.projection(this.work());
      else if (receipts === 'direct') this.ports.previews();
      return;
    }
    if (event === 'contacts' || event === 'vault') {
      this.ports.invalidate('changed');
      this.ports.request('refresh', this.work());
    }
  }
  private control(event: LiveControlEvent): void {
    if (event === 'call') return;
    this.ports.invalidate(event);
    const update = ['changed', 'ready', 'removed'].includes(event)
      ? 'probe'
      : 'refresh';
    this.ports.request(update, this.work());
  }
}
