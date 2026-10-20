import { appHref } from '../../shared/app-routes/index.ts';
import { t, setActiveLanguage } from '../../shared/i18n/index.ts';
import { genericNotification } from '../../shared/daily/index.ts';
import { publicNotificationPreview } from '../../shared/public-notification/index.ts';
import { pushSoundEnabled } from '../notification-sound/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { pushLanguage } from '../language/index.ts';
import { PublicAlertHistory } from './public-alert-history.ts';

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
    const history = new PublicAlertHistory();
    const preview = await history.fresh(data);
    const appearance = notificationAppearance(data, preview);
    await ports.show(appearance.title, {
      ...appearance,
      icon: appearance.icon ?? '/icon-192.png',
      badge: '/notification-badge.png',
      silent: !sound,
      renotify: sound,
    });
    await history.remember();
  } catch {
    /* Unverified authorization/mute never falls back to an alert. The message remains durable. */
  }
}
interface NotificationAppearance {
  title: string;
  body: string;
  tag: string;
  icon?: string;
  data?: { href: string };
}
function notificationAppearance(
  data: object,
  preview: ReturnType<typeof publicNotificationPreview> | null,
): NotificationAppearance {
  const call = 'call' in data && data.call === true;
  const showCall = call && 'showCall' in data && data.showCall === true;
  if (!call && preview) return publicAppearance(preview);
  return {
    title: genericNotification.title,
    body: showCall
      ? t('Incoming voice call. Open the app to answer.')
      : t(genericNotification.body),
    tag: call ? '0xdmme-call' : '0xdmme-activity',
  };
}
function publicAppearance(
  preview: ReturnType<typeof publicNotificationPreview>,
): NotificationAppearance {
  if (preview.followed) return followedAppearance(preview);
  return {
    title: preview.reply
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
/**
 * X-style alert for posts and replies by profiles followed with notifications
 * on (16/10/2026): the author's handle on top, the post below, the author's
 * public photo as the image. One alert per post, so several stay visible.
 */
function followedAppearance(
  preview: ReturnType<typeof publicNotificationPreview>,
): NotificationAppearance {
  return {
    title: `@${preview.author.handle}`,
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
