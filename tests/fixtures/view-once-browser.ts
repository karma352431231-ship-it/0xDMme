import {
  chatComposer,
  bindChatComposer,
} from '../../src/client/chat-ui/index.ts';
import {
  renderViewOnce,
  formatViewOnceBytes,
} from '../../src/client/view-once-ui/index.ts';

const result = document.createElement('pre');
result.dataset['result'] = 'running';
result.style.whiteSpace = 'pre-wrap';
document.body.append(result);
function check(pass: unknown, message: string): void {
  if (!pass) throw new Error(message);
}
async function main(): Promise<void> {
  localStorage.removeItem('0xdmme:view-once-intro:v1');
  const host = document.createElement('article');
  host.className = 'card chat-panel';
  host.style.cssText =
    'position:relative;width:calc(100vw - 32px);max-width:700px;margin:16px;padding-top:120px';
  host.innerHTML = chatComposer('message');
  document.body.prepend(host);
  const form = host.querySelector<HTMLElement>('[data-message-form]')!;
  bindChatComposer(form, () => {});
  const clip = form.querySelector<HTMLButtonElement>('[data-chat-attachment]')!;
  clip.click();
  const menu = form.querySelector<HTMLElement>(
    '[data-compose-attachment-menu]',
  )!;
  check(!menu.hidden, 'Paperclip menu opens');
  const bounds = menu.getBoundingClientRect();
  check(bounds.width <= 164 && bounds.height <= 64, 'Menu stays compact');
  check(
    menu.querySelectorAll('button').length === 3,
    'Emoji/image/file actions are present',
  );
  const once = form.querySelector<HTMLButtonElement>('[data-view-once]')!;
  once.click();
  check(
    form.dataset['viewOnce'] === 'true',
    'Persistent view-once mode enables',
  );
  check(
    form.querySelector('.compose-view-once-hint'),
    'First click explains the mode',
  );
  check(menu.hidden, 'Clicking elsewhere closes the menu');
  const textarea = form.querySelector('textarea')!;
  textarea.focus();
  check(
    getComputedStyle(textarea).outlineStyle === 'none',
    'Typing has no blue focus outline',
  );
  const inputBounds = textarea.getBoundingClientRect();
  check(
    inputBounds.width >= 100 &&
      once.getBoundingClientRect().right <= innerWidth,
    'Composer fits the viewport',
  );
  let opens = 0;
  const history = document.createElement('div');
  history.className = 'chat-history';
  host.prepend(history);
  const lifetime = new AbortController();
  renderViewOnce({
    host: history,
    id: crypto.randomUUID(),
    own: false,
    metadata: { hash: 'a'.repeat(64), policy: 'mobile' },
    signal: lifetime.signal,
    current: () => true,
    open: () => {
      opens++;
      return Promise.resolve({ text: 'Must not reach a browser' });
    },
  });
  history.querySelector<HTMLButtonElement>('button')!.click();
  check(opens === 0, 'Browser never requests protected text/image content');
  await checkFileDownload(history, lifetime.signal);
  await checkCancelledFile(history);
  check(formatViewOnceBytes(1000) === '1 KB', 'Size units are storage units');
  await new Promise<void>((resolve) => setTimeout(resolve, 4700));
  check(
    !form.querySelector('.compose-view-once-hint'),
    'Ghost popup disappears softly',
  );
  once.click();
  once.click();
  check(
    !form.querySelector('.compose-view-once-hint'),
    'Subsequent clicks do not repeat the popup',
  );
  result.dataset['result'] = 'passed';
  result.textContent =
    'PASS: compact menu, mobile-only open, download-only files, size, first-click hint and responsive composer';
}
function includesAll(element: Element | null, values: string[]): boolean {
  return values.every((value) => (element?.textContent ?? '').includes(value));
}
function includesAny(element: Element | null, values: string[]): boolean {
  return values.some((value) => (element?.textContent ?? '').includes(value));
}
async function checkFileDownload(
  history: HTMLElement,
  signal: AbortSignal,
): Promise<void> {
  let opens = 0;
  const file = document.createElement('div');
  history.append(file);
  const name = 'report.pdf';
  renderViewOnce({
    host: file,
    id: crypto.randomUUID(),
    own: false,
    metadata: {
      hash: 'b'.repeat(64),
      policy: 'file',
    },
    signal,
    current: () => true,
    open: () => {
      opens++;
      return Promise.resolve({
        text: '',
        file: {
          name,
          mime: 'application/pdf',
          data: btoa('X'.repeat(1_500_000)),
        },
      });
    },
  });
  check(
    !includesAny(file, [name, 'PDF', 'MB']),
    'Filename, format and size are hidden before open',
  );
  check(
    !file.querySelector('iframe,img,object,video,a'),
    'No file body is previewed',
  );
  let downloads = 0;
  const original = Object.getOwnPropertyDescriptor(
    HTMLAnchorElement.prototype,
    'click',
  );
  HTMLAnchorElement.prototype.click = function () {
    check(
      this.download === name && this.href.startsWith('blob:'),
      'Click creates an explicit download',
    );
    downloads++;
  };
  try {
    const button = file.querySelector<HTMLButtonElement>('button')!;
    button.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const details = document.querySelector<HTMLDialogElement>(
      '.view-once-file-dialog',
    )!;
    check(
      opens === 1 && downloads === 0 && button.disabled && details?.open,
      'Opening reveals metadata without starting a download',
    );
    check(
      includesAll(details, [name, 'PDF', '1.5 MB']),
      'Details appear only inside the opened delivery',
    );
    check(
      !details.querySelector('iframe,img,object,video,a'),
      'Opened files have no inline preview',
    );
    details
      .querySelector<HTMLButtonElement>('[data-view-once-download]')!
      .click();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    check(
      downloads === 1 &&
        !details.isConnected &&
        !file.textContent?.includes(name),
      'Explicit download closes and erases metadata',
    );
    button.click();
    check(opens === 1, 'The consumed file cannot start another download');
  } finally {
    if (original)
      Object.defineProperty(HTMLAnchorElement.prototype, 'click', original);
    else Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
  }
}
async function checkCancelledFile(history: HTMLElement): Promise<void> {
  const cancelled = document.createElement('div');
  history.append(cancelled);
  const cancelLifetime = new AbortController();
  renderViewOnce({
    host: cancelled,
    id: crypto.randomUUID(),
    own: false,
    metadata: {
      hash: 'c'.repeat(64),
      policy: 'file',
      file: { name: 'legacy-secret.zip', mime: 'application/zip', bytes: 3 },
    },
    signal: cancelLifetime.signal,
    current: () => !cancelLifetime.signal.aborted,
    open: () =>
      Promise.resolve({
        text: '',
        file: {
          name: 'legacy-secret.zip',
          mime: 'application/zip',
          data: btoa('zip'),
        },
      }),
  });
  check(
    !cancelled.textContent?.includes('legacy-secret.zip'),
    'Legacy cards also hide previously delivered metadata',
  );
  cancelled.querySelector<HTMLButtonElement>('button')!.click();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  check(
    document
      .querySelector('.view-once-file-dialog')
      ?.textContent?.includes('legacy-secret.zip'),
    'Legacy details open normally',
  );
  cancelLifetime.abort();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  check(
    !document.querySelector('.view-once-file-dialog'),
    'Leaving the chat erases opened file metadata',
  );
}
void main().catch((error: unknown) => {
  result.dataset['result'] = 'failed';
  result.textContent = error instanceof Error ? error.message : String(error);
});
