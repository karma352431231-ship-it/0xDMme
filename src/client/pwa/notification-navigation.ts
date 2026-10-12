/** Open a public push target inside the current app, preserving drafts. */
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
    if (/^#comunidades\?id=[a-f0-9-]{36}&post=[a-f0-9-]{36}$/u.test(data.hash))
      location.hash = data.hash;
  };
  service.addEventListener('message', receive);
  return () => service.removeEventListener('message', receive);
}
