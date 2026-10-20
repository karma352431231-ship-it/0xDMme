import { t, setActiveLanguage } from '../../shared/i18n/index.ts';
import { genericNotification } from '../../shared/daily/index.ts';
import { pushSoundEnabled } from '../notification-sound/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { pushLanguage } from '../language/index.ts';

interface NotificationPorts {
  wake: () => Promise<void>;
  show: (
    title: string,
    options: NotificationOptions & { renotify?: boolean },
  ) => Promise<void>;
}
/** One active inspection and one coalesced followup, including simultaneous pushes. */
export class NotificationDelivery {
  private active: Promise<void> | null = null;
  private pending = false;
  private readonly ports: NotificationPorts;
  constructor(ports: NotificationPorts) {
    this.ports = ports;
  }
  request(): Promise<void> {
    this.pending = true;
    this.active ??= this.drain();
    return this.active;
  }
  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        this.pending = false;
        await notify(this.ports);
      }
    } finally {
      this.active = null;
    }
  }
}
async function notify(ports: NotificationPorts): Promise<void> {
  try {
    const response = await fetchApi(
      'account/push-check',
      '/api/account/push-check',
      {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
    );
    const data = await readApiJson(response, 'account/push-check');
    if (
      !response.ok ||
      typeof data !== 'object' ||
      data === null ||
      !('allowed' in data) ||
      data.allowed !== true
    )
      return;
    await ports.wake();
    const sound = await pushSoundEnabled();
    setActiveLanguage(await pushLanguage());
    const appearance = notificationAppearance(data);
    await ports.show(appearance.title, {
      ...appearance,
      icon: '/icon-192.png',
      badge: '/notification-badge.png',
      silent: !sound,
      renotify: sound,
    });
  } catch {
    /* Unverified authorization/mute never falls back to an alert. The message remains durable. */
  }
}
interface NotificationAppearance {
  title: string;
  body: string;
  tag: string;
}
function notificationAppearance(data: object): NotificationAppearance {
  const call = 'call' in data && data.call === true;
  const showCall = call && 'showCall' in data && data.showCall === true;
  return {
    title: genericNotification.title,
    body: showCall
      ? t('Incoming voice call. Open the app to answer.')
      : t(genericNotification.body),
    tag: call ? '0xdmme-call' : '0xdmme-activity',
  };
}
