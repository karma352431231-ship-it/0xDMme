import { t, translatedError } from '../../shared/i18n/index.ts';
import type { Daily } from '../daily/index.ts';
import {
  settingGroup,
  settingRow,
  settingSwitch,
} from '../settings-ui/index.ts';

type PushPort = Pick<
  Daily,
  | 'pushSubscribed'
  | 'enablePush'
  | 'disablePush'
  | 'pushPreferences'
  | 'configurePush'
>;

function template(): string {
  const device = settingGroup({
    title: t('Push notifications'),
    tip: t(
      'The push provider receives subscription details and timing, never text, wallet or contact name. On iPhone or iPad, open the app from the home screen icon first.',
    ),
    rows: settingRow({
      icon: 'bell',
      label: t('Push on this device'),
      for: 'push-device',
      control: settingSwitch({
        id: 'push-device',
        attributes: 'data-push-device',
        checked: false,
      }),
    }),
  });
  const kinds = settingGroup({
    title: t('Push alerts for'),
    tip: t(
      'Alerts can show names, photos and message previews on the lock screen. Handle DMs do not send push. Muted or archived chats do not alert.',
    ),
    attributes: 'data-push-kinds',
    rows:
      settingRow({
        icon: 'message',
        label: t('Messages and replies'),
        for: 'push-messages',
        control: settingSwitch({
          id: 'push-messages',
          attributes: 'data-push-messages',
        }),
      }) +
      settingRow({
        icon: 'call',
        label: t('Calls'),
        for: 'push-calls',
        control: settingSwitch({
          id: 'push-calls',
          attributes: 'data-push-calls',
        }),
      }) +
      settingRow({
        icon: 'callAlert',
        label: t('Show call alerts as a voice call'),
        tip: t(
          "Turn off for a generic alert. The contact's name is never shown.",
        ),
        for: 'push-show-calls',
        control: settingSwitch({
          id: 'push-show-calls',
          attributes: 'data-push-show-calls',
        }),
      }),
  });
  return `${device}${kinds}<p class="set-status" data-push-notice role="status"></p><button class="set-btn" data-push-retry type="button" hidden>${t('Try loading preferences')}</button>`;
}

function failure(error: unknown, fallback: string): string {
  return error instanceof Error ? translatedError(error.message) : fallback;
}

/**
 * Push on this device and what it alerts about. The browser subscription and
 * the account's push preferences belong to this authorized account/device;
 * browser permission stays explicit, and each switch applies when changed.
 */
export function mountPushSettings(host: HTMLElement, daily: PushPort) {
  host.innerHTML = template();
  const find = (selector: string): HTMLInputElement =>
    host.querySelector<HTMLInputElement>(selector)!;
  const device = find('[data-push-device]'),
    messages = find('[data-push-messages]'),
    calls = find('[data-push-calls]'),
    showCalls = find('[data-push-show-calls]'),
    kinds = host.querySelector<HTMLElement>('[data-push-kinds] .set-card')!,
    notice = host.querySelector<HTMLElement>('[data-push-notice]')!,
    retry = host.querySelector<HTMLButtonElement>('[data-push-retry]')!;
  let subscribed = false,
    loaded = false,
    busy = false,
    generation = 0;

  function render(): void {
    device.checked = subscribed;
    device.disabled = busy;
    const usable = subscribed && loaded && !busy;
    for (const field of [messages, calls, showCalls]) field.disabled = !usable;
    kinds.dataset['disabled'] = String(!subscribed);
  }
  async function work(
    task: (current: number) => Promise<void>,
    fallback: string,
  ): Promise<void> {
    if (busy) return;
    busy = true;
    const current = ++generation;
    notice.textContent = '';
    render();
    try {
      await task(current);
    } catch (error: unknown) {
      if (current === generation) notice.textContent = failure(error, fallback);
    } finally {
      if (current === generation) {
        busy = false;
        render();
      }
    }
  }
  async function loadPreferences(current: number): Promise<void> {
    const preferences = await daily.pushPreferences();
    if (current !== generation) return;
    messages.checked = preferences.messages;
    calls.checked = preferences.calls;
    showCalls.checked = preferences.showCalls;
    loaded = true;
    retry.hidden = true;
  }
  function refresh(): Promise<void> {
    if (loaded || !host.isConnected) return Promise.resolve();
    return work(async (current) => {
      subscribed = await daily.pushSubscribed();
      try {
        await loadPreferences(current);
      } catch (error: unknown) {
        retry.hidden = false;
        throw error;
      }
    }, t('Could not load preferences.'));
  }
  device.addEventListener('change', () => {
    const enable = device.checked;
    void work(
      async () => {
        if (enable) await daily.enablePush();
        else await daily.disablePush();
        subscribed = await daily.pushSubscribed();
      },
      enable ? t('Could not enable push.') : t('Could not disable push.'),
    );
  });
  for (const field of [messages, calls, showCalls])
    field.addEventListener('change', () => {
      if (!loaded) return;
      const previous = !field.checked;
      void work(async () => {
        try {
          await daily.configurePush({
            messages: messages.checked,
            calls: calls.checked,
            showCalls: showCalls.checked,
          });
        } catch (error: unknown) {
          field.checked = previous;
          throw error;
        }
      }, t('Could not save preferences.'));
    });
  retry.addEventListener('click', () => {
    void refresh();
  });
  render();
  void refresh();
  return {
    refresh,
    reset(): void {
      generation++;
      busy = false;
      loaded = false;
      subscribed = false;
      render();
    },
  };
}
