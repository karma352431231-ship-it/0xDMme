import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { menuIcon } from '../menu-icons/index.ts';

/** The alert pauses offered wherever a conversation or group can be muted. */
export const muteDurations = [
  ['conversation.mute-1h', 3_600_000],
  ['conversation.mute-8h', 28_800_000],
  ['conversation.mute-24h', 86_400_000],
  ['conversation.mute-7d', 604_800_000],
  ['conversation.mute-forever', Number.MAX_SAFE_INTEGER],
] as const;

/** The same pauses with the short labels the info panels list. */
const muteChoices = [
  ['mute.choice-1h', 3_600_000],
  ['mute.choice-8h', 28_800_000],
  ['mute.choice-24h', 86_400_000],
  ['mute.choice-7d', 604_800_000],
  ['mute.choice-always', Number.MAX_SAFE_INTEGER],
] as const;

/** The existing per-conversation mute kept by the account's daily state. */
export interface MutePort {
  /** When alerts resume, in milliseconds; 0 or a past time means not muted. */
  read: () => Promise<number>;
  /** 0 resumes alerts; Number.MAX_SAFE_INTEGER mutes until resumed. */
  apply: (duration: number) => Promise<void>;
}

function untilText(until: number): string {
  if (until <= Date.now()) return t('Off');
  if (until === Number.MAX_SAFE_INTEGER) return t('Always');
  return t('Until {0}', [
    new Date(until).toLocaleString(currentLanguage(), {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  ]);
}

/**
 * One "Mute notifications" row with a switch. Turning it on offers the
 * durations; turning it off resumes alerts. The row owns only its displayed
 * state; the mute itself stays with the daily state behind the port.
 */
export class MuteRow {
  readonly element = document.createElement('div');
  private readonly toggle = document.createElement('button');
  private readonly detail = document.createElement('small');
  private readonly choices = document.createElement('div');
  private readonly notice = document.createElement('p');
  private readonly port: MutePort;
  private until = 0;
  private busy = false;
  private disposed = false;
  constructor(port: MutePort) {
    this.port = port;
    this.element.className = 'info-mute';
    this.toggle.type = 'button';
    this.toggle.className = 'info-row';
    this.toggle.setAttribute('role', 'switch');
    const copy = document.createElement('span'),
      label = document.createElement('span'),
      knob = document.createElement('span');
    copy.className = 'info-row-copy';
    label.textContent = t('Mute notifications');
    copy.append(label, this.detail);
    knob.className = 'info-switch';
    knob.setAttribute('aria-hidden', 'true');
    this.toggle.append(menuIcon('unmute'), copy, knob);
    this.choices.className = 'info-mute-choices';
    this.choices.hidden = true;
    this.choices.setAttribute('role', 'group');
    const heading = document.createElement('small');
    heading.textContent = t('Mute for');
    this.choices.append(heading);
    // A compact list with short labels under the switch (owner, 12/11/2026).
    for (const [label, duration] of muteChoices) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.textContent = t(label);
      choice.addEventListener('click', () => void this.change(duration));
      this.choices.append(choice);
    }
    this.notice.className = 'info-notice';
    this.notice.setAttribute('role', 'status');
    this.element.append(this.toggle, this.choices, this.notice);
    this.toggle.addEventListener('click', () => {
      if (this.muted()) void this.change(0);
      else this.choices.hidden = !this.choices.hidden;
    });
    this.render();
  }
  /** Stops late reads from repainting a closed panel. */
  dispose(): void {
    this.disposed = true;
  }
  async load(): Promise<void> {
    await this.work(async () => {
      this.until = await this.port.read();
    });
  }
  private muted(): boolean {
    return this.until > Date.now();
  }
  private async change(duration: number): Promise<void> {
    await this.work(async () => {
      await this.port.apply(duration);
      this.until = await this.port.read();
      this.choices.hidden = true;
    });
  }
  private async work(task: () => Promise<void>): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.notice.textContent = '';
    this.render();
    try {
      await task();
    } catch (error: unknown) {
      if (!this.disposed)
        this.notice.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the operation.');
    } finally {
      this.busy = false;
      if (!this.disposed) this.render();
    }
  }
  private render(): void {
    const muted = this.muted();
    this.toggle.setAttribute('aria-checked', String(muted));
    this.toggle.disabled = this.busy;
    this.toggle.replaceChild(
      menuIcon(muted ? 'mute' : 'unmute'),
      this.toggle.firstChild!,
    );
    this.detail.textContent = untilText(this.until);
  }
}
