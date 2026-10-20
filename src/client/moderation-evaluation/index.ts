import { t } from '../../shared/i18n/index.ts';
import { startLanguage } from '../language/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import {
  evaluationCase,
  evaluationReference,
} from '../../shared/moderation-evaluation/index.ts';
import { EvaluationApi } from './api.ts';
import { CalibrationGalleryView } from './gallery.ts';

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type))
    throw new Error('Assessment screen unavailable.');
  return node;
}
startLanguage();
const file = element('image', HTMLInputElement),
  expected = element('expected', HTMLSelectElement);
const status = element('status', HTMLParagraphElement),
  preview = element('preview', HTMLImageElement);
const analyze = element('evaluate', HTMLButtonElement),
  exportButton = element('export', HTMLButtonElement);
const clear = element('clear', HTMLButtonElement),
  reload = element('reload', HTMLButtonElement);
function readAccess(): string {
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  return token;
}
const api = new EvaluationApi(readAccess());
const gallery = new CalibrationGalleryView(api, {
  container: element('gallery', HTMLDivElement),
  summary: element('round', HTMLParagraphElement),
  pagination: element('pagination', HTMLDivElement),
  original: element('original', HTMLDivElement),
  status,
});
let previewUrl: string | null = null;
function clearPreview(): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute('src');
  preview.hidden = true;
}
file.addEventListener('change', () => {
  clearPreview();
  expected.value = '';
  const image = file.files?.[0];
  if (!image) return;
  previewUrl = URL.createObjectURL(image);
  preview.src = previewUrl;
  preview.hidden = false;
});
function selectedImage(): File {
  const image = file.files?.[0];
  if (
    !image ||
    image.size < 1 ||
    image.size > 8 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(image.type)
  )
    throw new Error(
      'Select a static PNG, JPEG or WebP image no larger than 8 MiB.',
    );
  return image;
}
function busy(value: boolean): void {
  for (const button of [analyze, exportButton, clear, reload])
    button.disabled = value;
  file.disabled = value;
  expected.disabled = value;
}
function action(operation: () => Promise<void>): void {
  busy(true);
  void operation()
    .catch((error: unknown) => gallery.message(error))
    .finally(() => busy(false));
}
async function evaluate(): Promise<void> {
  const image = selectedImage(),
    reference = evaluationReference(expected.value);
  status.textContent = t(
    'Analyzing and saving this case in the temporary round…',
  );
  const saved = evaluationCase(
    await api.json('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': image.type,
        'X-Evaluation-Reference': reference,
      },
      body: image,
    }),
  );
  // Confirm that the saved identity belongs to exactly this submitted file.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await image.arrayBuffer(),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (saved.imageHash !== hash || saved.reference !== reference)
    throw new Error('The received case differs from the uploaded image.');
  status.textContent = t(
    'Case {0} saved with image, scores and your reference.',
    [saved.id.slice(0, 8)],
  );
  await gallery.refresh(true);
}
async function exportRound(): Promise<void> {
  status.textContent = t('Preparing private ZIP with originals and results…');
  const blob = await api.archive(),
    url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '0xdmme-calibration.zip';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  status.textContent = t(
    'Export requested. The downloaded file contains the images and is under your control.',
  );
}
async function clearRound(): Promise<void> {
  if (
    !window.confirm(
      t(
        'Delete all images and results from this temporary round? Files already downloaded remain on your device.',
      ),
    )
  )
    return;
  await api.json('/api/cases', { method: 'DELETE' });
  clearPreview();
  file.value = '';
  expected.value = '';
  await gallery.refresh(true);
  status.textContent = t(
    'Round images and results deleted from the evaluator.',
  );
}
analyze.addEventListener('click', () => action(evaluate));
exportButton.addEventListener('click', () => action(exportRound));
clear.addEventListener('click', () => action(clearRound));
reload.addEventListener('click', () => action(() => gallery.refresh()));
window.addEventListener('pagehide', () => {
  clearPreview();
  gallery.dispose();
});
action(() => gallery.refresh());
// Reopening the private link in this same tab is a hash navigation, not a reload.
window.addEventListener('hashchange', () => {
  const access = readAccess();
  action(async () => {
    api.acceptAccess(access);
    status.textContent = '';
    await gallery.refresh();
  });
});
