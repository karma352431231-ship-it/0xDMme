// SPDX-License-Identifier: GPL-3.0-only
import {
  AccountError,
  base64,
  encode,
  keys,
  object,
} from '../../shared/account/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import {
  communityMediaLimits,
  communityMediaPartBytes,
  communityMediaSet,
  communityMediaState,
} from '../../shared/community-media/index.ts';
import type {
  CommunityMediaKind,
  CommunityMediaSource,
  CommunityMediaState,
} from '../../shared/community-media/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import { showToast } from '../toast/index.ts';

export interface CommunityMediaAccess {
  community: string;
  request: (
    operation: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  valid: () => boolean;
  signal: AbortSignal;
}
async function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(new Error('Envio interrompido.'));
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function selectedMediaKind(file: File): CommunityMediaKind {
  if (file.type === 'image/gif' || /\.gif$/iu.test(file.name)) return 'gif';
  if (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/iu.test(file.name))
    return 'video';
  return 'photo';
}
export function validateMediaSelection(files: File[]): void {
  communityMediaSet(
    files.map((file) => ({
      id: '',
      hash: '',
      bytes: file.size,
      kind: selectedMediaKind(file),
    })),
  );
  for (const file of files) {
    const kind = selectedMediaKind(file),
      limit = kind === 'photo' ? 20_000_000 : communityMediaLimits[kind].source;
    if (!file.size || file.size > limit)
      throw new Error(`Arquivo excede ${limit / 1_000_000} MB.`);
  }
}
async function request(
  access: CommunityMediaAccess,
  operation: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const deadline = Date.now() + 180_000;
  while (true) {
    if (!access.valid()) throw new Error('Sessão ou comunidade alterada.');
    access.signal.throwIfAborted();
    try {
      return await access.request(operation, { id: access.community, ...data });
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        error.status !== 429 ||
        Date.now() > deadline
      )
        throw error;
      await pause(5_000, access.signal);
    }
  }
}
async function preparedSource(
  file: File,
): Promise<{ blob: Blob; kind: CommunityMediaKind; hash: string }> {
  const kind = selectedMediaKind(file);
  const blob =
    kind === 'photo'
      ? new Blob([(await prepareAttachment(file, true)).bytes])
      : file;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await bytesHash(bytes);
  bytes.fill(0);
  return { blob, kind, hash };
}
async function upload(
  access: CommunityMediaAccess,
  source: CommunityMediaSource,
  blob: Blob,
  onProgress: (text: string) => void,
): Promise<string> {
  let state = communityMediaState(
    await request(access, 'media-reserve', { source }),
  );
  const parts = Math.ceil(source.bytes / communityMediaPartBytes);
  for (
    let index = state.received;
    index < parts && state.status === 'uploading';
    index++
  ) {
    onProgress(`Enviando arquivo: ${Math.round((index / parts) * 100)}%.`);
    const bytes = new Uint8Array(
      await blob
        .slice(
          index * communityMediaPartBytes,
          (index + 1) * communityMediaPartBytes,
        )
        .arrayBuffer(),
    );
    state = communityMediaState(
      await request(access, 'media-part', {
        media: source.id,
        index,
        bytes: encode(bytes),
      }),
    );
  }
  if (state.status === 'uploading')
    state = communityMediaState(
      await request(access, 'media-finish', { media: source.id }),
    );
  const deadline = Date.now() + 390_000;
  while (state.status === 'processing') {
    onProgress(
      'Preparando arquivo e miniatura. Isso pode reduzir a qualidade.',
    );
    if (Date.now() > deadline)
      throw new Error(
        'Preparação ainda em andamento. Tente novamente para retomar.',
      );
    await pause(1000, access.signal);
    state = communityMediaState(
      await request(access, 'media-status', { media: source.id }),
    );
  }
  if (state.status !== 'ready')
    throw new Error(
      state.error ?? 'Mídia ainda não preparada. Retome o envio.',
    );
  return source.id;
}
/** Bounded discovery of the author's unfinished uploads enables retry/reselection without a new copy. */
export async function uploadCommunityMedia(
  access: CommunityMediaAccess,
  files: File[],
  onProgress: (text: string) => void,
): Promise<string[]> {
  validateMediaSelection(files);
  const result: string[] = [],
    pending = await request(access, 'media-pending', {});
  if (!Array.isArray(pending) || pending.length > 32)
    throw new Error('Estado de uploads inválido.');
  const candidates = pending.map(communityMediaState);
  for (const file of files) {
    const prepared = await preparedSource(file);
    const old = candidates.find(
      (s) =>
        s.source.hash === prepared.hash &&
        s.source.bytes === prepared.blob.size &&
        s.source.kind === prepared.kind &&
        !result.includes(s.source.id),
    );
    const source = old?.source ?? {
      id: crypto.randomUUID(),
      kind: prepared.kind,
      hash: prepared.hash,
      bytes: prepared.blob.size,
    };
    result.push(await upload(access, source, prepared.blob, onProgress));
  }
  return result;
}
const clipIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg>';
function selectionSummary(files: readonly File[]): string {
  if (files.length > 1) return `${files.length} arquivos`;
  return files[0]?.name ?? '';
}
/**
 * Photos, GIFs or a video for a post or reply: only the clip button, a short
 * summary of the choice and a drop zone on the whole form. Limit refusals
 * appear as a notice at the bottom of the screen.
 */
export function mediaEditor(
  container: HTMLElement,
  ids: string[],
  access: CommunityMediaAccess,
): () => Promise<string[]> {
  const field = document.createElement('div');
  field.className = 'media-picker';
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.accept =
    'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm';
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'media-picker-button';
  pick.innerHTML = clipIcon;
  pick.setAttribute('aria-label', 'Anexar fotos, GIFs ou vídeo');
  pick.title = 'Até 4 fotos, 3 GIFs ou 1 vídeo';
  const summary = document.createElement('span');
  summary.className = 'media-picker-summary';
  const status = document.createElement('small');
  status.setAttribute('role', 'status');
  const remove = document.createElement('input');
  remove.type = 'checkbox';
  const removeLabel = document.createElement('label');
  removeLabel.append(remove, document.createTextNode('Remover a mídia atual'));
  field.append(input, pick, summary, status);
  if (ids.length) field.append(removeLabel);
  container.append(field);
  dropFilesInto(container, input);
  pick.addEventListener('click', () => {
    input.click();
  });
  let prepared: string[] | null = null;
  input.addEventListener('change', () => {
    prepared = null;
    status.textContent = '';
    try {
      validateMediaSelection(Array.from(input.files ?? []));
    } catch (error: unknown) {
      input.value = '';
      showToast(error instanceof Error ? error.message : 'Seleção inválida.');
    }
    summary.textContent = selectionSummary(Array.from(input.files ?? []));
  });
  return async () => {
    const files = Array.from(input.files ?? []);
    if (remove.checked) return [];
    if (!files.length) return ids;
    prepared ??= await uploadCommunityMedia(access, files, (text) => {
      if (access.valid() && field.isConnected) status.textContent = text;
    });
    status.textContent = '';
    return prepared;
  };
}
export function restrictedMedia(
  container: HTMLElement,
  ids: string[],
  access: CommunityMediaAccess,
): () => void {
  const urls: string[] = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const url of urls) URL.revokeObjectURL(url);
  };
  access.signal.addEventListener('abort', stop, { once: true });
  for (const id of ids) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Ver minha mídia preparada (restrita)';
    container.append(button);
    button.addEventListener('click', () => {
      button.disabled = true;
      void preview(id)
        .catch((e: unknown) => {
          if (!stopped)
            button.textContent =
              e instanceof Error ? e.message : 'Prévia indisponível.';
        })
        .finally(() => {
          button.disabled = false;
        });
    });
    async function preview(media: string): Promise<void> {
      const state = communityMediaState(
        await request(access, 'media-status', { media }),
      );
      if (!state.result) throw new Error('Arquivo ainda em preparação.');
      const blob = await download(access, media, state);
      if (stopped || !access.valid()) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const node =
        state.result.kind === 'video'
          ? document.createElement('video')
          : document.createElement('img');
      node.className = 'community-media-preview';
      if (node instanceof HTMLVideoElement) {
        node.controls = true;
        node.preload = 'metadata';
      } else node.alt = 'Mídia preparada restrita ao autor';
      node.src = url;
      button.replaceWith(node);
    }
  }
  return stop;
}
async function download(
  access: CommunityMediaAccess,
  id: string,
  state: CommunityMediaState,
): Promise<Blob> {
  const result = state.result!;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (
    let index = 0;
    index < Math.ceil(result.bytes / communityMediaPartBytes);
    index++
  ) {
    const data = object(
      await request(access, 'media-get', {
        media: id,
        index,
        thumbnail: false,
      }),
    );
    keys(data, ['bytes']);
    const bytes = base64(data['bytes'], communityMediaPartBytes);
    if (
      bytes.length !==
      Math.min(
        communityMediaPartBytes,
        result.bytes - index * communityMediaPartBytes,
      )
    )
      throw new Error('Mídia incompleta.');
    chunks.push(Uint8Array.from(bytes));
  }
  return new Blob(chunks, { type: result.type });
}
