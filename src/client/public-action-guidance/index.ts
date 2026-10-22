import type { AccountSession } from '../../shared/account/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import {
  showPublicProfileGuidance,
  closePublicProfileGuidance,
} from './dialog.ts';
export {
  showPublicProfileGuidance,
  closePublicProfileGuidance,
  publicProfileGuidanceButton,
  mountPublicProfileInvitation,
} from './dialog.ts';
export type { PublicAction } from './dialog.ts';
import type { PublicAction } from './dialog.ts';

export interface PublicActionAccess {
  allow: (action: PublicAction, signal: AbortSignal) => Promise<boolean>;
}

/** A missing public identity is distinct from a revoked/unauthorized session.
 * Only this exact server prerequisite may retain the public read-only view. */
export function missingPublicProfile(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    error.status === 403 &&
    error.failure === 'http' &&
    error.reason ===
      'Create your public profile in Profile before participating.'
  );
}

function identity(session: AccountSession | null): string {
  return session
    ? [session.accountId, session.deviceId, session.csrf].join(':')
    : '';
}

/** Click-time guidance only. This never grants permission or changes an account.
 * The signed operation remains responsible for current server authorization. */
export class PublicActionGate implements PublicActionAccess {
  private generation = 0;
  private checking: { identity: string; result: Promise<boolean> } | null =
    null;
  private readonly options: {
    session: () => AccountSession | null;
    profile: () => Promise<boolean>;
  };
  constructor(options: {
    session: () => AccountSession | null;
    profile: () => Promise<boolean>;
  }) {
    this.options = options;
  }

  reset(): void {
    this.generation++;
    this.checking = null;
    closePublicProfileGuidance();
  }

  async allow(action: PublicAction, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    const current = identity(this.options.session()),
      generation = this.generation;
    const valid = () =>
      !signal.aborted &&
      generation === this.generation &&
      current === identity(this.options.session());
    try {
      const exists = current ? await this.profile(current) : false;
      if (!valid()) return false;
      if (!exists) showPublicProfileGuidance(action);
      return exists;
    } catch (error: unknown) {
      if (!valid()) return false;
      throw error;
    }
  }

  private profile(current: string): Promise<boolean> {
    if (this.checking?.identity === current) return this.checking.result;
    const result = this.options.profile();
    const checking = { identity: current, result };
    this.checking = checking;
    const clear = () => {
      if (this.checking === checking) this.checking = null;
    };
    void result.then(clear, clear); // The original promise propagates failure to its caller.
    return result;
  }
}
