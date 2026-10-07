// SPDX-License-Identifier: GPL-3.0-only
import {
  evaluationLabels,
  evaluationResult,
} from '../../shared/moderation-evaluation/index.ts';
import type { EvaluationResult } from '../../shared/moderation-evaluation/index.ts';

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type))
    throw new Error('Tela de avaliação indisponível.');
  return node;
}
const file = element('image', HTMLInputElement),
  expected = element('expected', HTMLSelectElement),
  button = element('evaluate', HTMLButtonElement),
  status = element('status', HTMLParagraphElement),
  output = element('output', HTMLDivElement),
  preview = element('preview', HTMLImageElement);
const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
let previewUrl: string | null = null;
function clearPreview(): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute('src');
  preview.hidden = true;
}
file.addEventListener('change', () => {
  clearPreview();
  output.replaceChildren();
  const image = file.files?.[0];
  if (!image) return;
  previewUrl = URL.createObjectURL(image);
  preview.src = previewUrl;
  preview.hidden = false;
});
function render(result: EvaluationResult, reference: string): void {
  output.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = `Sua referência: ${reference}. Inferência: ${(result.elapsedMs / 1000).toFixed(2)} s.`;
  const rows = document.createElement('dl');
  for (const label of [...evaluationLabels].sort(
    (a, b) => result.scores[b] - result.scores[a],
  )) {
    const name = document.createElement('dt'),
      score = document.createElement('dd');
    name.textContent = label;
    score.textContent = `${(result.scores[label] * 100).toFixed(2)}%`;
    rows.append(name, score);
  }
  const notice = document.createElement('p');
  notice.textContent =
    'Classes do candidato, sem decisão validada da política. Pintura com nudez artística pode ser permitida mesmo com score alto de porn. Nenhum post foi publicado.';
  output.append(summary, rows, notice);
}
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
async function evaluate(): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error('Acesso restrito ausente. Reabra o endereço fornecido.');
  const image = selectedImage();
  const reference =
    expected.selectedOptions[0]?.textContent ?? 'Sem referência';
  status.textContent = 'Analisando na VPS…';
  output.replaceChildren();
  const response = await fetch('/api/evaluate', {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': image.type },
    body: image,
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Acesso restrito inválido.'
        : 'A análise falhou. Confira o formato/tamanho ou o prazo do ambiente.',
    );
  const text = await response.text();
  if (text.length > 4096) throw new Error('Resposta excedida.');
  render(evaluationResult(JSON.parse(text)), reference);
  status.textContent =
    'Análise concluída. Os bytes enviados foram descartados pelo avaliador.';
}
button.addEventListener('click', () => {
  button.disabled = true;
  file.disabled = true;
  void evaluate()
    .catch((error: unknown) => {
      status.textContent =
        error instanceof Error ? error.message : 'Análise indisponível.';
    })
    .finally(() => {
      button.disabled = false;
      file.disabled = false;
    });
});
window.addEventListener('pagehide', clearPreview);
