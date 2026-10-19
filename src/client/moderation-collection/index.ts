import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import { CollectionApi } from './api.ts';
import type { Collection, ImageCase, Reference } from './api.ts';
import { ImageQueue } from './queue.ts';
import { startLanguage } from '../language/index.ts';

startLanguage();

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type))
    throw new Error('Collection screen unavailable.');
  return node;
}
function readAccess(): string {
  const token = location.hash.slice(1);
  window.history.replaceState(null, '', location.pathname);
  return token;
}
const api = new CollectionApi(readAccess()),
  queue = new ImageQueue();
const file = element('images', HTMLInputElement),
  preview = element('preview', HTMLImageElement),
  title = element('current', HTMLParagraphElement),
  status = element('status', HTMLParagraphElement),
  summary = element('summary', HTMLParagraphElement),
  savedCases = element('history', HTMLDivElement);
const allow = element('allow', HTMLButtonElement),
  reject = element('reject', HTMLButtonElement),
  finish = element('finish', HTMLButtonElement),
  skip = element('skip', HTMLButtonElement),
  back = element('back', HTMLButtonElement);
let snapshot: Collection | null = null;
let editing: ImageCase | null = null;
let previewUrl: string | null = null;
let busy = false;
let previewReady = false;

function message(error: unknown): void {
  status.textContent =
    error instanceof Error
      ? translatedError(error.message)
      : t('Collection unavailable.');
}
function clearPreview(): void {
  previewReady = false;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute('src');
  preview.hidden = true;
}
function canFinish(): boolean {
  if (!snapshot || snapshot.completedAt !== null) return false;
  return snapshot.cases.length > 0 && queue.length === 0 && editing === null;
}
function controls(): void {
  const closed = !snapshot || snapshot.completedAt !== null;
  file.disabled = busy || closed;
  allow.disabled = reject.disabled = busy || closed || !previewReady;
  finish.disabled = busy || !canFinish();
  skip.disabled = back.disabled = busy;
  for (const button of savedCases.querySelectorAll('button'))
    button.disabled = busy || closed;
}
function action(operation: () => Promise<void>): void {
  if (busy) return;
  busy = true;
  controls();
  void operation()
    .catch(message)
    .finally(() => {
      busy = false;
      controls();
    });
}
async function showImage(blob: Blob): Promise<void> {
  clearPreview();
  previewUrl = URL.createObjectURL(blob);
  preview.src = previewUrl;
  preview.hidden = false;
  await preview.decode();
  previewReady = true;
}
async function showQueue(): Promise<void> {
  editing = null;
  back.hidden = skip.hidden = true;
  clearPreview();
  const current = queue.current;
  if (!current) {
    title.textContent = t('Select images or complete the upload.');
    return;
  }
  title.textContent = t('{0} · {1} queued', [current.name, queue.length]);
  try {
    await showImage(current);
  } catch {
    skip.hidden = false;
    throw new Error(
      'Could not open this image. Remove the file from the queue and continue.',
    );
  }
}
async function edit(entry: ImageCase): Promise<void> {
  editing = entry;
  back.hidden = false;
  skip.hidden = true;
  title.textContent = t('Correct image {0} · current annotation: {1}', [
    entry.ordinal,
    entry.reference === 'allow' ? t('Pass') : t('Block'),
  ]);
  await showImage(await api.image(entry.id));
}
function historyEntry(entry: ImageCase): HTMLDivElement {
  const row = document.createElement('div'),
    label = document.createElement('span'),
    button = document.createElement('button');
  row.className = 'case';
  label.textContent = t('{0}. {1}', [
    entry.ordinal,
    entry.reference === 'allow' ? t('Pass') : t('Block'),
  ]);
  label.className = entry.reference;
  button.type = 'button';
  button.textContent = t('Correct');
  button.addEventListener('click', () => action(() => edit(entry)));
  row.append(label, button);
  return row;
}
function render(): void {
  if (!snapshot) return;
  const allowed = snapshot.cases.filter(
    (entry) => entry.reference === 'allow',
  ).length;
  const expires = new Date(snapshot.expiresAt).toLocaleString(
    currentLanguage(),
    {
      timeZone: 'America/Fortaleza',
      dateStyle: 'short',
      timeStyle: 'short',
    },
  );
  summary.textContent = t(
    '{0} saved · {1} pass · {2} blocked · expires at {3} (Fortaleza)',
    [snapshot.cases.length, allowed, snapshot.cases.length - allowed, expires],
  );
  savedCases.replaceChildren(...snapshot.cases.map(historyEntry));
  if (snapshot.completedAt !== null) {
    clearPreview();
    title.textContent = t('Upload complete');
    status.textContent = t(
      'Your round is ready for calibration. You can close this tab; keep your Mac on and awake.',
    );
  }
  controls();
}
async function refresh(): Promise<void> {
  snapshot = await api.snapshot();
  render();
}
async function mark(reference: Reference): Promise<void> {
  if (editing) {
    await api.annotate(editing.id, reference);
    await refresh();
    await showQueue();
    status.textContent = t('Annotation corrected.');
    return;
  }
  const current = queue.current;
  if (!current) throw new Error('Select an image.');
  const saved = await api.save(current, reference);
  queue.next();
  status.textContent = t('Image {0} saved: {1}.', [
    saved.ordinal,
    reference === 'allow' ? t('Pass') : t('Block'),
  ]);
  await refresh();
  await showQueue();
}
file.addEventListener('change', () => {
  const selected = Array.from(file.files ?? []);
  action(async () => {
    queue.add(selected);
    file.value = '';
    status.textContent = t(
      'Annotate each image. Each click saves the original and advances.',
    );
    await showQueue();
  });
});
allow.addEventListener('click', () => action(() => mark('allow')));
reject.addEventListener('click', () => action(() => mark('reject')));
back.addEventListener('click', () => action(showQueue));
skip.addEventListener('click', () => {
  action(async () => {
    queue.next();
    status.textContent = t(
      'File removed from the queue; no annotation was saved for it.',
    );
    await showQueue();
  });
});
finish.addEventListener('click', () => {
  action(async () => {
    snapshot = await api.complete();
    render();
  });
});
window.addEventListener('hashchange', () => {
  const token = readAccess();
  action(async () => {
    api.acceptAccess(token);
    await refresh();
  });
});
window.addEventListener('pagehide', clearPreview);
window.addEventListener('beforeunload', (event) => {
  if (!queue.length && !busy) return;
  event.preventDefault();
  event.returnValue = '';
});
action(refresh);
