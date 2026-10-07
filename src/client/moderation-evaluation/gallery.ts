// SPDX-License-Identifier: GPL-3.0-only
import {
  evaluationCase,
  evaluationLabels,
  evaluationReference,
  evaluationReferences,
  evaluationRound,
} from '../../shared/moderation-evaluation/index.ts';
import type {
  EvaluationCase,
  EvaluationReference,
  EvaluationRound,
} from '../../shared/moderation-evaluation/index.ts';
import type { EvaluationApi } from './api.ts';

const names: Record<EvaluationReference, string> = {
  safe: 'Permitido / safe',
  unsafe: 'Proibido / não safe',
  uncertain: 'Incerto / revisar',
};
interface GalleryElements {
  container: HTMLDivElement;
  summary: HTMLParagraphElement;
  pagination: HTMLDivElement;
  original: HTMLDivElement;
  status: HTMLParagraphElement;
}
function button(text: string, click: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.addEventListener('click', click);
  return node;
}
function scoreRows(entry: EvaluationCase): HTMLDListElement {
  const rows = document.createElement('dl');
  for (const label of [...evaluationLabels].sort(
    (a, b) => entry.scores[b] - entry.scores[a],
  )) {
    const name = document.createElement('dt'),
      score = document.createElement('dd');
    name.textContent = label;
    score.textContent = `${(entry.scores[label] * 100).toFixed(2)}%`;
    rows.append(name, score);
  }
  return rows;
}
export class CalibrationGalleryView {
  private round: EvaluationRound | null = null;
  private page = 0;
  private controller = new AbortController();
  private urls: string[] = [];
  private originalUrl: string | null = null;
  private readonly api: EvaluationApi;
  private readonly elements: GalleryElements;
  constructor(api: EvaluationApi, elements: GalleryElements) {
    this.api = api;
    this.elements = elements;
  }

  message(error: unknown): void {
    this.elements.status.textContent =
      error instanceof Error ? error.message : 'Galeria indisponível.';
  }
  dispose(): void {
    this.controller.abort();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    this.closeOriginal();
  }
  private closeOriginal(): void {
    if (this.originalUrl) URL.revokeObjectURL(this.originalUrl);
    this.originalUrl = null;
    this.elements.original.replaceChildren();
  }
  async refresh(reset = false): Promise<void> {
    this.round = evaluationRound(await this.api.json('/api/cases'));
    if (reset) this.page = 0;
    await this.render();
  }
  private async render(): Promise<void> {
    const round = this.round;
    if (!round) return;
    this.dispose();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.page = Math.min(
      this.page,
      Math.max(0, Math.ceil(round.cases.length / 12) - 1),
    );
    this.elements.summary.textContent = `${round.cases.length} casos · ${(round.usedBytes / 1024 / 1024).toFixed(1)} MiB · expira até ${new Date(round.expiresAt).toLocaleString('pt-BR')}.`;
    this.elements.container.replaceChildren();
    const pending = round.cases
      .slice(this.page * 12, this.page * 12 + 12)
      .map((entry) => this.card(entry));
    this.paginate(round.cases.length);
    // Two bounded thumbnail readers; navigating cancels the previous page and revokes its blobs.
    const worker = async (): Promise<void> => {
      for (;;) {
        const item = pending.shift();
        if (!item || signal.aborted) return;
        try {
          const blob = await this.api.image(item.entry, 'preview', signal);
          if (signal.aborted) return;
          const url = URL.createObjectURL(blob);
          this.urls.push(url);
          item.image.src = url;
        } catch (error) {
          if (!signal.aborted) this.message(error);
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }
  private paginate(count: number): void {
    const pages = Math.max(1, Math.ceil(count / 12));
    const move = (delta: number): void => {
      this.page += delta;
      void this.render().catch((error: unknown) => this.message(error));
    };
    const previous = button('Anteriores', () => move(-1)),
      next = button('Próximos', () => move(1));
    previous.disabled = this.page === 0;
    next.disabled = this.page + 1 >= pages;
    const label = document.createElement('span');
    label.textContent = `Página ${this.page + 1} de ${pages}`;
    this.elements.pagination.replaceChildren(previous, label, next);
  }
  private card(entry: EvaluationCase): {
    entry: EvaluationCase;
    image: HTMLImageElement;
  } {
    const card = document.createElement('article'),
      title = document.createElement('h3');
    const identity = document.createElement('code'),
      image = document.createElement('img');
    title.textContent = `Caso ${entry.id.slice(0, 8)}`;
    identity.textContent = entry.id;
    image.alt = `Miniatura do caso ${entry.id.slice(0, 8)}`;
    image.width = 320;
    image.height = 320;
    const info = document.createElement('p');
    info.className = 'small';
    info.textContent = `${new Date(entry.createdAt).toLocaleString('pt-BR')} · inferência ${(entry.elapsedMs / 1000).toFixed(2)} s`;
    const label = document.createElement('label'),
      reference = document.createElement('select');
    reference.id = `reference-${entry.id}`;
    label.htmlFor = reference.id;
    label.textContent = 'Sua avaliação deste caso';
    for (const value of evaluationReferences) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = names[value];
      reference.append(option);
    }
    reference.value = entry.reference;
    reference.addEventListener('change', () => {
      reference.disabled = true;
      void this.annotate(entry, reference)
        .catch((error: unknown) => {
          reference.value = entry.reference;
          this.message(error);
        })
        .finally(() => {
          reference.disabled = false;
        });
    });
    const open = button('Ver imagem original', () => {
      open.disabled = true;
      void this.openOriginal(entry)
        .catch((error: unknown) => this.message(error))
        .finally(() => {
          open.disabled = false;
        });
    });
    card.append(
      title,
      identity,
      image,
      info,
      scoreRows(entry),
      label,
      reference,
      open,
    );
    this.elements.container.append(card);
    return { entry, image };
  }
  private async annotate(
    entry: EvaluationCase,
    select: HTMLSelectElement,
  ): Promise<void> {
    const saved = evaluationCase(
      await this.api.annotate(entry, evaluationReference(select.value)),
    );
    if (saved.id !== entry.id || saved.imageHash !== entry.imageHash)
      throw new Error('Anotação divergente do caso.');
    entry.reference = saved.reference;
    this.elements.status.textContent = `Referência do caso ${entry.id.slice(0, 8)} salva. Scores preservados.`;
  }
  private async openOriginal(entry: EvaluationCase): Promise<void> {
    const signal = this.controller.signal;
    const blob = await this.api.image(entry, 'image', signal);
    if (signal.aborted) return;
    this.closeOriginal();
    this.originalUrl = URL.createObjectURL(blob);
    const title = document.createElement('h3'),
      image = document.createElement('img');
    title.textContent = `Original do caso ${entry.id.slice(0, 8)} — SHA-256 conferido`;
    image.alt = `Imagem original do caso ${entry.id}`;
    image.src = this.originalUrl;
    this.elements.original.append(
      title,
      image,
      button('Fechar original', () => this.closeOriginal()),
    );
    this.elements.original.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}
