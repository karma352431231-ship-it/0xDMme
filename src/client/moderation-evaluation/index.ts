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
    throw new Error('Tela de avaliação indisponível.');
  return node;
}
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
      'Selecione uma imagem estática PNG, JPEG ou WebP de até 8 MiB.',
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
  status.textContent = 'Analisando e guardando este caso na rodada temporária…';
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
    throw new Error('O caso recebido diverge da imagem enviada.');
  status.textContent = `Caso ${saved.id.slice(0, 8)} salvo com imagem, scores e sua referência.`;
  await gallery.refresh(true);
}
async function exportRound(): Promise<void> {
  status.textContent = 'Preparando ZIP privado com originais e resultados…';
  const blob = await api.archive(),
    url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '0xdmme-calibration.zip';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  status.textContent =
    'Exportação solicitada. O arquivo baixado contém as imagens e fica sob seu controle.';
}
async function clearRound(): Promise<void> {
  if (
    !window.confirm(
      'Apagar todas as imagens e resultados desta rodada temporária? Arquivos já baixados permanecem no seu dispositivo.',
    )
  )
    return;
  await api.json('/api/cases', { method: 'DELETE' });
  clearPreview();
  file.value = '';
  expected.value = '';
  await gallery.refresh(true);
  status.textContent = 'Imagens e resultados da rodada apagados do avaliador.';
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
    await gallery.refresh();
  });
});
