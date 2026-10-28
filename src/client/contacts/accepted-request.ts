import { t } from '../../shared/i18n/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';

/**
 * Follows the conversation request this device just sent, or approved, until
 * the contact is approved in both directions, then offers its chat next to
 * the contact feedback. It holds account identifiers only, never messages,
 * and is cleared with the session.
 */
export class AcceptedRequest {
  private awaited: string | null = null;
  private ready: Peer | null = null;

  /** A request was sent to this account; its approval arrives later. */
  wait(accountId: string): void {
    this.awaited = accountId;
    this.ready = null;
  }

  /** This device approved the request: the chat can start now. */
  approved(peer: Peer): void {
    this.awaited = null;
    this.ready = peer;
  }

  /** The awaited account once it appears among approved contacts. */
  settle(approved: readonly Peer[]): Peer | null {
    const peer = approved.find((p) => p.accountId === this.awaited);
    if (!peer) return null;
    this.awaited = null;
    this.ready = peer;
    return peer;
  }

  get offered(): Peer | null {
    return this.ready;
  }

  /** The offer ends with the next contact operation; the wait does not. */
  dismiss(): void {
    this.ready = null;
  }

  clear(): void {
    this.awaited = null;
    this.ready = null;
  }

  /** One "Start conversation" button inside each contact feedback area. */
  render(hosts: Iterable<HTMLElement>, open: (peer: Peer) => void): void {
    for (const host of hosts) {
      host.querySelector('[data-contact-next-chat]')?.remove();
      const peer = this.ready;
      if (!peer) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.dataset['contactNextChat'] = '';
      button.textContent = t('Start conversation');
      button.addEventListener('click', () => open(peer));
      host.append(button);
    }
  }
}
