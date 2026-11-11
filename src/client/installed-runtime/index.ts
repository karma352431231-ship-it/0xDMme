import { startInstalledDiagnostics } from './diagnostics.ts';
import { timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { installNativeApiTransport } from '../api-transport/index.ts';
import { NativeApiTransport } from '../native-api/index.ts';
import { InstalledSessionChannel } from './channel.ts';
import { installProtectedDisplay } from '../view-once-ui/index.ts';
import { installNativeVideo } from '../native-video/index.ts';

/** Installed entry owns initialization/disposal before any domain module loads. */
export async function startInstalledEntry(
  load: () => Promise<unknown>,
): Promise<void> {
  const entryMs = performance.now();
  let diagnostic: LoadTrace | undefined;
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
    diagnostic = startInstalledDiagnostics(channel, entryMs);
    transport = new NativeApiTransport(channel);
    installNativeApiTransport(transport);
    const viewChannel = channel;
    const videoPort = channel.videoPort();
    if (videoPort) installNativeVideo(videoPort);
    installProtectedDisplay({
      ...(location.protocol === 'https:'
        ? {
            download: (input: {
              id: string;
              name: string;
              bytes: Uint8Array<ArrayBuffer>;
            }) => viewChannel.downloadFile(input),
          }
        : {}),
      begin: (input) => viewChannel.viewBegin(input),
      append: (input) => viewChannel.viewAppend(input),
      show: (input) => viewChannel.viewShow(input),
      ...(location.protocol === 'https:'
        ? {
            presented: (input: { id: string; signal: AbortSignal }) =>
              viewChannel.viewPresented(input),
          }
        : {}),
      active: (input) => viewChannel.viewActive(input),
      close: (input) => viewChannel.viewClose(input),
    });
    window.addEventListener(
      'pagehide',
      () => void close().catch(() => channel?.close()),
      { once: true },
    );
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) location.reload();
    });
    await timedLoad(diagnostic, 'modules', load);
    const shell = document.getElementById('app-shell');
    if (shell) diagnostic?.frame(shell, () => shell.isConnected);
  } catch {
    diagnostic?.point('failed', { loadOutcome: 'failed' });
    await close().catch(() => channel?.close());
    const report = document.createElement('p');
    report.setAttribute('role', 'alert');
    report.textContent =
      'The app connection could not start. Close and reopen the app to try again.';
    document.body.replaceChildren(report);
  }
}
