import { installNativeApiTransport } from '../api-transport/index.ts';
import { NativeApiTransport } from '../native-api/index.ts';
import { InstalledSessionChannel } from './channel.ts';

/** Installed entry owns initialization/disposal before any domain module loads. */
export async function startInstalledEntry(
  load: () => Promise<unknown>,
): Promise<void> {
  let channel: InstalledSessionChannel | undefined;
  let transport: NativeApiTransport | undefined;
  const close = async () => {
    try {
      await transport?.close();
    } finally {
      channel?.close();
    }
  };
  try {
    channel = new InstalledSessionChannel();
    await channel.ready();
    transport = new NativeApiTransport(channel);
    installNativeApiTransport(transport);
    window.addEventListener(
      'pagehide',
      () => void close().catch(() => channel?.close()),
      { once: true },
    );
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) location.reload();
    });
    await load();
  } catch {
    await close().catch(() => channel?.close());
    const report = document.createElement('p');
    report.setAttribute('role', 'alert');
    report.textContent =
      'The app connection could not start. Close and reopen the app to try again.';
    document.body.replaceChildren(report);
  }
}
