import { base64, encode } from '../../shared/account/index.ts';
import { safeFilename } from '../../shared/attachments/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { ViewOnceContent } from '../../shared/view-once/index.ts';
import { showToast } from '../toast/index.ts';
import { protectedDisplay } from './display.ts';
import type { DailyText } from '../../shared/daily/index.ts';
type ViewOnceMetadata = NonNullable<DailyText['viewOnce']>;

const consumed = new Set<string>();
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

function markConsumed(id: string): void {
  consumed.add(id);
  if (consumed.size > 1024) consumed.delete(consumed.values().next().value!);
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
): Promise<void> {
  const display = protectedDisplay();
  if (!display)
    throw new Error('Open this view-once message in the mobile app.');
  const bytes = content.file
    ? Uint8Array.from(base64(content.file.data, 10_000_000))
    : null;
  try {
    if (bytes)
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        signal.throwIfAborted();
        await display.append({
          id,
          offset,
          bytes: encode(bytes.subarray(offset, offset + 64 * 1024)),
        });
      }
    signal.throwIfAborted();
    await display.show({ id, text: content.text });
    while (!signal.aborted && (await display.active({ id })))
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
  } finally {
    bytes?.fill(0);
  }
}

interface ViewOnceRow {
  host: HTMLElement;
  id: string;
  own: boolean;
  metadata: ViewOnceMetadata;
  signal: AbortSignal;
  current: () => boolean;
  open: () => Promise<ViewOnceContent>;
}

export function renderViewOnce(input: ViewOnceRow): void {
  const { host, metadata, id } = input;
  const file = metadata.policy === 'file';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-view-once';
  const icon = document.createElement('span');
  icon.className = 'chat-view-once-icon';
  icon.textContent = '①';
  icon.setAttribute('aria-hidden', 'true');
  const info = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = t('View-once message');
  info.append(title);
  const state = document.createElement('small');
  const update = () => {
    button.disabled = input.own || consumed.has(id);
    state.textContent = consumed.has(id)
      ? t('Opened')
      : t(
          input.own
            ? 'Sent once'
            : file
              ? 'Open once'
              : 'Open once in the mobile app',
        );
  };
  info.append(state);
  button.append(icon, info);
  update();
  button.addEventListener('click', () => {
    if (!input.current()) return;
    if (!file && !protectedDisplay()) {
      showToast(t('Open this view-once message in the mobile app.'));
      return;
    }
    button.disabled = true;
    void openViewOnce(input, () => {
      markConsumed(id);
      update();
    })
      .catch((error: unknown) => {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? error.status
            : null;
        if (status === 410) markConsumed(id);
        if (input.current())
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('View-once message unavailable.'),
          );
      })
      .finally(update);
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
  let content: ViewOnceContent | null = null;
  const cancel = () => {
    void display?.close({ id }).catch(() => undefined);
  };
  input.signal.addEventListener('abort', cancel, { once: true });
  try {
    if (display)
      await display.begin({
        id,
        ...protectedContentSize(metadata),
      });
    input.signal.throwIfAborted();
    content = await input.open();
    opened();
    if (!input.current() || input.signal.aborted) return;
    if (file) await showFileDetails(id, content, input.signal);
    else await showProtected(id, content, input.signal);
  } finally {
    input.signal.removeEventListener('abort', cancel);
    eraseContent(content);
    await display?.close({ id }).catch(() => undefined);
  }
}

function protectedContentSize(metadata: ViewOnceMetadata): {
  mime: string;
  bytes: number;
} {
  return metadata.file ?? { mime: 'text/plain', bytes: 0 };
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
