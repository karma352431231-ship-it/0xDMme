import { navigateApp } from '../app-navigation/index.ts';
/** Open a public push target inside the current app, preserving drafts. */
import { publicPostHash } from '../../shared/app-routes/index.ts';
export function startNotificationNavigation(): () => void {
  const service = navigator.serviceWorker;
  const receive = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('type' in data) ||
      data.type !== 'OPEN_PUBLIC_POST' ||
      !('hash' in data) ||
      typeof data.hash !== 'string'
    )
      return;
    const hash = publicPostHash(data.hash);
    if (hash) navigateApp(hash);
  };
  service.addEventListener('message', receive);
  return () => service.removeEventListener('message', receive);
}
