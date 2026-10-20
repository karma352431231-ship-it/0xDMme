import { t, setActiveLanguage } from '../../shared/i18n/index.ts';
import { genericNotification } from '../../shared/daily/index.ts';
import { pushSoundEnabled } from '../notification-sound/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { pushLanguage } from '../language/index.ts';
import { publicNotificationPreview } from '../../shared/public-notification/index.ts';
import { privatePushCandidates } from '../../shared/private-notification/index.ts';
import { appHref } from '../../shared/app-routes/index.ts';
import type {
  privateNotificationDetails,
  PrivateNotificationDetail,
} from '../notification-private/index.ts';
import { PrivateNotificationAlerts } from './private-alerts.ts';
import { PublicAlertHistory } from './public-alert-history.ts';

interface NotificationPorts {
  wake: () => Promise<void>;
  details: typeof privateNotificationDetails;
  show: (
    title: string,
    options: NotificationOptions & { renotify?: boolean },
  ) => Promise<void>;
}
/** One active inspection and one coalesced followup. Every private alert
 * stays inside event.waitUntil and revalidates the current session and mute. */
export class NotificationDelivery {
  private active: Promise<void> | null = null;
  private pending = false;
  private readonly ports: NotificationPorts;
  private readonly alerts: PrivateNotificationAlerts;
  constructor(ports: NotificationPorts) {
    this.ports = ports;
    this.alerts = new PrivateNotificationAlerts({
      read: ports.details,
      inspect,
      show: (detail, sound) => show(ports, privateAppearance(detail), sound),
    });
  }
  request(): Promise<void> {
    this.alerts.cancel();
    this.pending = true;
    this.active ??= this.drain();
    return this.active.then(() => this.alerts.wait());
  }
  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        this.pending = false;
        await notify(this.ports, this.alerts);
      }
    } finally {
      this.active = null;
    }
  }
}
async function inspect(): Promise<object | null> {
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
  return response.ok &&
    typeof data === 'object' &&
    data !== null &&
    'allowed' in data &&
    data.allowed === true
    ? data
    : null;
}
async function notify(
  ports: NotificationPorts,
  alerts: PrivateNotificationAlerts,
): Promise<void> {
  try {
    const data = await inspect();
    if (!data) return;
    await ports.wake();
    const [sound, language] = await Promise.all([
      pushSoundEnabled(),
      pushLanguage(),
    ]);
    setActiveLanguage(language);
    if ('call' in data && data.call === true) {
      await show(
        ports,
        {
          title: genericNotification.title,
          body:
            'showCall' in data && data.showCall === true
              ? t('Incoming voice call. Open the app to answer.')
              : t(genericNotification.body),
          tag: '0xdmme-call',
        },
        sound,
      );
      return;
    }
    await notifyMessages(ports, alerts, { data, sound });
  } catch {
    // Unverified authority/mute never produces a fallback alert.
  }
}
async function notifyMessages(
  ports: NotificationPorts,
  alerts: PrivateNotificationAlerts,
  input: { data: object; sound: boolean },
): Promise<void> {
  const { data, sound } = input;
  const candidates =
    'privateCandidates' in data
      ? privatePushCandidates(data.privateCandidates)
      : [];
  const history = new PublicAlertHistory(),
    preview = await history.fresh(data);
  if (preview) {
    await show(ports, publicAppearance(preview), sound);
    await history.remember();
  }
  if (
    candidates.length &&
    'publicScope' in data &&
    typeof data.publicScope === 'string'
  ) {
    alerts.request({ candidates, scope: data.publicScope, sound });
    return;
  }
  if (candidates.length || !preview)
    await show(ports, privateAppearance(null), sound);
}
interface Appearance {
  title: string;
  body: string;
  tag: string;
  icon?: string;
  data?: { href: string };
}
function privateAppearance(
  detail: PrivateNotificationDetail | null,
): Appearance {
  return {
    title: detail?.title ?? genericNotification.title,
    body: detail?.body ?? t(genericNotification.body),
    ...(detail?.icon ? { icon: detail.icon } : {}),
    tag: '0xdmme-activity',
  };
}
function show(
  ports: NotificationPorts,
  appearance: Appearance,
  sound: boolean,
): Promise<void> {
  return ports.show(appearance.title, {
    ...appearance,
    icon: appearance.icon ?? '/icon-192.png',
    badge: '/notification-badge.png',
    silent: !sound,
    renotify: sound,
  });
}
function publicAppearance(
  preview: ReturnType<typeof publicNotificationPreview>,
): Appearance {
  return {
    title: preview.followed
      ? `@${preview.author.handle}`
      : preview.reply
        ? t('@{0} replied · 0xDMme', [preview.author.handle])
        : t('@{0} posted · 0xDMme', [preview.author.handle]),
    body: preview.text || t('New media publication.'),
    tag: `0xdmme-post-${preview.post}`,
    ...(preview.author.avatar ? { icon: preview.author.avatar } : {}),
    data: {
      href: appHref(
        'communities',
        new URLSearchParams({ id: preview.community, post: preview.post }),
      ),
    },
  };
}
