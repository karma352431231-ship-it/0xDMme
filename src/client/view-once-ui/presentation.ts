import { transferProtected } from './transfer.ts';
import { base64 } from '../../shared/account/index.ts';
import { safeFilename } from '../../shared/attachments/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { ViewOnceContent } from '../../shared/view-once/index.ts';
import { showToast } from '../toast/index.ts';
import { protectedDisplay } from './display.ts';
import type { DailyText } from '../../shared/daily/index.ts';
import { startLoad, timedLoad } from '../chat-sync-diagnostics/index.ts';
import { protectedPresentation, failedProtectedLoad } from './diagnostics.ts';
import type { ProtectedDisplay } from './display.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { LoadKind } from '../../shared/chat-sync-diagnostics/load.ts';
type ViewOnceMetadata = NonNullable<DailyText['viewOnce']>;

const receiptKey = '0xdmme:view-once-receipts:v1';
const receiptLimit = 1024;
const consumed = readReceipts();
const opening = new Set<string>();
const stateChanges = new EventTarget();
export function formatViewOnceBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log10(Math.max(bytes, 1)) / 3), 3);
  return (
    new Intl.NumberFormat(document.documentElement.lang || undefined, {
      maximumFractionDigits: 1,
    }).format(bytes / 1000 ** unit) +
    ' ' +
    units[unit]!
  );
}

function readReceipts(): Set<string> {
  try {
    const stored = globalThis.localStorage?.getItem(receiptKey);
    if (!stored || stored.length > receiptLimit * 68) return new Set();
    const values: unknown = JSON.parse(stored);
    if (!Array.isArray(values)) return new Set();
    return new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value),
        )
        .slice(-receiptLimit),
    );
  } catch {
    return new Set();
  }
}

function markConsumed(hash: string): void {
  consumed.add(hash);
  if (consumed.size > receiptLimit)
    consumed.delete(consumed.values().next().value!);
  try {
    globalThis.localStorage?.setItem(receiptKey, JSON.stringify([...consumed]));
  } catch {
    // A restricted browser still shows the receipt for the active session.
  }
}
async function download(id: string, content: ViewOnceContent): Promise<void> {
  const file = content.file;
  if (!file) throw new Error('View-once file metadata missing.');
  const bytes = Uint8Array.from(base64(file.data, 10_000_000));
  try {
    const native = protectedDisplay();
    if (native?.download) {
      await native.download({ id, name: safeFilename(file.name), bytes });
      return;
    }
    // Always download, including HTML/PDF; never embed or navigate to the content.
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'application/octet-stream' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename(file.name);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    bytes.fill(0);
  }
}

async function showProtected(
  id: string,
  content: ViewOnceContent,
  signal: AbortSignal,
  diagnostic?: LoadTrace,
): Promise<void> {
  const display = protectedDisplay();
  if (!display)
    throw new Error('Open this view-once message in the mobile app.');
  await timedLoad(diagnostic, 'native-transfer', () =>
    transferProtected({ display, id, content, signal, diagnostic }),
  );
  signal.throwIfAborted();
  await timedLoad(diagnostic, 'native-show', () =>
    display.show({ id, text: content.text }),
  );
  await protectedPresentation({ display, id, signal, trace: diagnostic });
  while (!signal.aborted && (await display.active({ id })))
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
}

interface ViewOnceRow {
  host: HTMLElement;
  id: string;
  own: boolean;
  metadata: ViewOnceMetadata;
  signal: AbortSignal;
  current: () => boolean;
  open: (diagnostic?: LoadTrace) => Promise<ViewOnceContent>;
}

export function renderViewOnce(input: ViewOnceRow): void {
  const { host, metadata, id } = input;
  const file = metadata.policy === 'file';
  const key = id + ':' + metadata.hash;
  host.classList.add('chat-message-view-once');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-view-once';
  const icon = document.createElement('span');
  icon.className = 'chat-view-once-icon';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  const labels = {
    sent: 'Sent as view-once',
    viewed: 'Message already viewed',
    new: file || protectedDisplay() ? 'View once' : 'Open in mobile app',
  };
  const update = () => {
    const viewed = !input.own && consumed.has(metadata.hash);
    const state = input.own ? 'sent' : viewed ? 'viewed' : 'new';
    button.disabled = input.own || viewed || opening.has(key);
    button.dataset['state'] = state;
    icon.textContent = viewed ? '✓' : '1';
    label.textContent = t(labels[state]);
  };
  button.append(icon, label);
  update();
  stateChanges.addEventListener(key, update, { signal: input.signal });
  button.addEventListener('click', () => {
    if (button.disabled || !input.current()) return;
    if (!file && !protectedDisplay()) {
      showToast(t('Open this view-once message in the mobile app.'));
      return;
    }
    opening.add(key);
    stateChanges.dispatchEvent(new Event(key));
    void openViewOnce(input, () => markConsumed(metadata.hash))
      .catch((error: unknown) => {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? error.status
            : null;
        if (
          status === 410 &&
          error instanceof Error &&
          error.message === 'This view-once message was already opened.'
        ) {
          markConsumed(metadata.hash);
          return;
        }
        if (input.current())
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('View-once message unavailable.'),
          );
      })
      .finally(() => {
        opening.delete(key);
        stateChanges.dispatchEvent(new Event(key));
      });
  });
  host.append(button);
}

async function openViewOnce(
  input: ViewOnceRow,
  opened: () => void,
): Promise<void> {
  const { id, metadata } = input;
  const file = metadata.policy === 'file';
  const display = file ? null : protectedDisplay();
  const diagnostic = startLoad(viewOnceKind(metadata));
  let content: ViewOnceContent | null = null;
  const cancel = () => {
    void display?.close({ id }).catch(() => undefined);
  };
  input.signal.addEventListener('abort', cancel, { once: true });
  try {
    await beginProtected(display, id, metadata, diagnostic);
    input.signal.throwIfAborted();
    content = await input.open(diagnostic);
    if (!input.current() || input.signal.aborted) {
      diagnostic?.point('cancelled', { loadOutcome: 'cancelled' });
      return;
    }
    if (file) await showFileDetails(id, content, input.signal, diagnostic);
    else await showProtected(id, content, input.signal, diagnostic);
  } catch (error: unknown) {
    failedProtectedLoad(diagnostic, input.signal);
    throw error;
  } finally {
    input.signal.removeEventListener('abort', cancel);
    eraseContent(content);
    await display?.close({ id }).catch(() => undefined);
    if (content) opened();
  }
}
async function beginProtected(
  display: ProtectedDisplay | null,
  id: string,
  metadata: ViewOnceMetadata,
  trace: LoadTrace | undefined,
): Promise<void> {
  if (display)
    await timedLoad(trace, 'native-begin', () =>
      display.begin({ id, ...protectedContentSize(metadata) }),
    );
}
function viewOnceKind(metadata: ViewOnceMetadata): LoadKind {
  if (metadata.policy === 'file') return 'view-once-file';
  if (metadata.file?.mime.startsWith('video/')) return 'view-once-video';
  return metadata.file ? 'view-once-image' : 'view-once-text';
}

function protectedContentSize(metadata: ViewOnceMetadata): {
  mime: string;
  bytes: number;
} {
  return metadata.file
    ? { mime: metadata.file.mime, bytes: metadata.file.bytes }
    : { mime: 'text/plain', bytes: 0 };
}
function eraseContent(content: ViewOnceContent | null): void {
  if (!content) return;
  content.text = '';
  if (content.file) content.file.data = '';
}

/** Metadata exists on screen only while this consumed delivery is open. */
function showFileDetails(
  id: string,
  content: ViewOnceContent,
  signal: AbortSignal,
  diagnostic?: LoadTrace,
): Promise<void> {
  const file = content.file;
  if (!file) throw new Error('View-once file metadata missing.');
  const dialog = document.createElement('dialog');
  dialog.className = 'view-once-file-dialog';
  dialog.setAttribute('aria-label', t('View-once file'));
  const title = document.createElement('h2');
  title.textContent = file.name;
  const details = document.createElement('p');
  const extension = file.name.includes('.')
    ? file.name.split('.').at(-1)!.toUpperCase()
    : '';
  details.textContent = [
    extension,
    file.mime,
    formatViewOnceBytes(base64(file.data, 10_000_000).length),
  ]
    .filter(Boolean)
    .join(' · ');
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = t('Download once');
  save.dataset['viewOnceDownload'] = '';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = t('Close');
  const actions = document.createElement('div');
  actions.append(close, save);
  dialog.append(title, details, actions);
  return new Promise<void>((resolve, reject) => {
    let ended = false;
    const cleanup = () => {
      if (ended) return;
      ended = true;
      signal.removeEventListener('abort', stop);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', stop);
      dialog.remove();
      dialog.replaceChildren();
    };
    const stop = () => {
      cleanup();
      resolve();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    close.addEventListener('click', stop);
    dialog.addEventListener('cancel', stop);
    dialog.addEventListener('close', stop);
    save.addEventListener('click', () => {
      if (ended || save.disabled) return;
      save.disabled = true;
      void download(id, content)
        .catch((error: unknown) => {
          if (!ended)
            showToast(
              error instanceof Error
                ? translatedError(error.message)
                : t('View-once message unavailable.'),
            );
        })
        .finally(stop);
    });
    signal.addEventListener('abort', stop, { once: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stop, { once: true });
    try {
      signal.throwIfAborted();
      document.body.append(dialog);
      dialog.showModal();
      diagnostic?.point('dom');
      diagnostic?.frame(dialog, () => !signal.aborted);
    } catch (error: unknown) {
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error('View-once message unavailable.'),
      );
    }
  });
}
