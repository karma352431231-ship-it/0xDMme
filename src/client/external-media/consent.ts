import type { AccountSession } from '../../shared/account/index.ts';
import { mediaConsentDialog } from './dialog.ts';
import { mediaStorage, readChoices, writeChoices } from './preferences.ts';
import type { ConsentStorage, MediaScope } from './preferences.ts';
export type { MediaScope } from './preferences.ts';
export type ExternalMediaKind = 'video' | 'gifs';

/** A device permission shared by all chats, isolated by account. It contains no
 * message, wallet, provider media ID or server-side consent tracking. */
export class ExternalMediaConsent {
  private readonly storage: ConsentStorage | null;
  private readonly profile: () => Promise<boolean>;
  private readonly prompt: typeof mediaConsentDialog;
  private account: string | null = null;
  private sessionKey = '';
  private context = new AbortController();
  private key = 'hash_talk_external_media_v1:guest';
  private choices;
  private identity: Promise<boolean> | null = null;
  private publicIdentity = false;
  private profileEpoch = 0;
  private pending: {
    scope: MediaScope;
    result: Promise<boolean | null>;
  } | null = null;
  private readonly listeners = new Set<() => void>();
  private durable = true;
  constructor(options: {
    profile: () => Promise<boolean>;
    storage?: ConsentStorage | null;
    prompt?: typeof mediaConsentDialog;
  }) {
    this.profile = options.profile;
    this.storage =
      options.storage === undefined ? mediaStorage() : options.storage;
    this.prompt = options.prompt ?? mediaConsentDialog;
    this.choices = readChoices(this.storage, this.key);
  }
  get signal(): AbortSignal {
    return this.context.signal;
  }
  setSession(session: AccountSession | null): void {
    const key = session ? `${session.accountId}:${session.csrf}` : '';
    if (key === this.sessionKey) return;
    this.context.abort();
    this.context = new AbortController();
    this.sessionKey = key;
    this.account = session?.accountId ?? null;
    this.key = `hash_talk_external_media_v1:${this.account ?? 'guest'}`;
    this.choices = readChoices(this.storage, this.key);
    this.identity = null;
    this.publicIdentity = false;
    this.pending = null;
    this.durable = true;
    this.changed();
  }
  async hasPublicProfile(): Promise<boolean> {
    if (!this.account) return false;
    const context = this.context;
    const epoch = this.profileEpoch;
    this.identity ??= this.profile().then(
      (value) => {
        if (context !== this.context) return false;
        if (epoch !== this.profileEpoch) return this.publicIdentity;
        this.publicIdentity = value;
        return value;
      },
      (error: unknown) => {
        if (context === this.context) this.identity = null;
        throw error;
      },
    );
    return this.identity;
  }
  permitted(kind: ExternalMediaKind): boolean {
    if (kind === 'video')
      return this.publicIdentity && this.choices.all === true;
    return (
      (this.publicIdentity ? this.choices.all : this.choices.gifs) === true
    );
  }
  async authorize(
    kind: ExternalMediaKind,
    signal: AbortSignal,
  ): Promise<boolean> {
    const active = AbortSignal.any([signal, this.signal]);
    const publicIdentity = await this.hasPublicProfile();
    if (active.aborted || (kind === 'video' && !publicIdentity)) return false;
    const scope = publicIdentity ? 'all' : 'gifs';
    if (this.choices[scope] !== null) return this.choices[scope] === true;
    const choice = await this.ask(scope, active);
    if (active.aborted || choice === null) return false;
    this.save(scope, choice);
    return choice;
  }
  beforeCreate(signal: AbortSignal): Promise<boolean | null> {
    return this.ask('all', AbortSignal.any([signal, this.signal]));
  }
  created(choice: boolean): void {
    this.profileEpoch++;
    this.publicIdentity = true;
    this.identity = Promise.resolve(true);
    this.save('all', choice);
  }
  async configure(signal: AbortSignal): Promise<void> {
    const active = AbortSignal.any([signal, this.signal]);
    const publicIdentity = await this.hasPublicProfile();
    if (active.aborted) return;
    const scope = publicIdentity ? 'all' : 'gifs';
    const choice = await this.ask(scope, active);
    if (!active.aborted && choice !== null) this.save(scope, choice);
  }
  description(): string {
    const scope = this.publicIdentity ? 'all' : 'gifs';
    const choice = this.choices[scope];
    const status =
      choice === null
        ? 'Permissão ainda não escolhida.'
        : choice
          ? 'Mídias externas permitidas.'
          : 'Mídias externas somente como links.';
    return `${status} ${this.durable ? 'Escolha neste navegador.' : 'Não foi possível salvar; escolha válida só neste acesso.'}`;
  }
  storageChanged(key: string | null): void {
    if (key !== null && key !== this.key) return;
    this.choices = readChoices(this.storage, this.key);
    this.changed();
  }
  subscribe(listener: () => void, signal: AbortSignal): void {
    if (signal.aborted) return;
    this.listeners.add(listener);
    signal.addEventListener('abort', () => this.listeners.delete(listener), {
      once: true,
    });
  }
  private save(scope: MediaScope, choice: boolean): void {
    this.choices[scope] = choice;
    this.durable = writeChoices(this.storage, this.key, this.choices);
    this.changed();
  }
  private changed(): void {
    for (const listener of this.listeners) listener();
  }
  private async ask(
    scope: MediaScope,
    signal: AbortSignal,
  ): Promise<boolean | null> {
    if (signal.aborted) return null;
    if (this.pending) {
      const pending = this.pending;
      const choice = await pending.result;
      return pending.scope === scope ? choice : this.ask(scope, signal);
    }
    const pending = { scope, result: this.prompt(scope, signal) };
    this.pending = pending;
    try {
      return await pending.result;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
}
