import {
  postForm,
  replyForm,
} from '../../src/client/communities/post-forms.ts';
import { mountPublicPicture } from '../../src/client/public-media/picture.ts';
import type { CommunityMediaState } from '../../src/shared/community-media/index.ts';
import type { ExternalMediaConsent } from '../../src/client/external-media/index.ts';
import type { PostEditorAccess } from '../../src/client/communities/post-editor-media.ts';

async function syntheticFiles(): Promise<File[]> {
  const files: File[] = [];
  for (const [index, width, height] of [
    [0, 1280, 720],
    [1, 786, 964],
    [2, 640, 640],
  ] as const) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = ['#2785a3', '#e4ba74', '#995ca6'][index]!;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.font = '40px sans-serif';
    context.fillText(`Synthetic ${width} × ${height}`, 32, 64);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('No synthetic image.')),
        'image/jpeg',
      ),
    );
    files.push(
      new File([blob], `synthetic-${index}.jpg`, { type: 'image/jpeg' }),
    );
  }
  return files;
}
function mediaAccess(signal: AbortSignal): PostEditorAccess {
  const states = new Map<string, CommunityMediaState>();
  function request(operation: string, data: Record<string, unknown>): unknown {
    if (operation === 'media-pending') return [...states.values()];
    if (operation === 'media-reserve') {
      const source = data['source'] as CommunityMediaState['source'];
      const state: CommunityMediaState = {
        source,
        status: 'uploading',
        received: 0,
        result: null,
        error: null,
      };
      states.set(source.id, state);
      return state;
    }
    const state = states.get(data['media'] as string)!;
    if (operation === 'media-part') state.received++;
    if (operation === 'media-finish') {
      state.status = 'ready';
      state.result = {
        kind: 'photo',
        type: 'image/jpeg',
        bytes: 100,
        width: 640,
        height: 480,
        seconds: 0,
        fps: 0,
        thumbnailBytes: 50,
        normalized: true,
      };
    }
    return state;
  }
  return {
    community: crypto.randomUUID(),
    valid: () => !signal.aborted,
    signal,
    privacy: {
      signal,
      authorize: () => Promise.resolve(false),
      subscribe: () => () => {},
      permitted: () => false,
    } as unknown as ExternalMediaConsent,
    request: (operation, data) => Promise.resolve(request(operation, data)),
  };
}
async function imageCards(
  list: Element,
  files: File[],
  signal: AbortSignal,
): Promise<void> {
  for (const [index, file] of files.entries()) {
    const bitmap = await createImageBitmap(file),
      card = document.createElement('article');
    card.className = 'community-card community-post';
    card.dataset['case'] = String(index);
    card.innerHTML =
      '<div class="community-public-media"><figure></figure></div>';
    list.append(card);
    mountPublicPicture(
      card.querySelector('figure')!,
      {
        id: crypto.randomUUID(),
        review: crypto.randomUUID(),
        result: {
          kind: 'photo',
          type: 'image/jpeg',
          bytes: file.size,
          width: bitmap.width,
          height: bitmap.height,
          seconds: 0,
          fps: 0,
          thumbnailBytes: 50,
          normalized: true,
        },
      },
      { signal, load: () => Promise.resolve(file) },
    );
    bitmap.close();
  }
}
function checkRemoveButtons(form: HTMLElement): void {
  const buttons = form.querySelectorAll<HTMLButtonElement>(
    '.media-picker-remove',
  );
  if (buttons.length !== 3) throw new Error('Multiple selection failed.');
  for (const button of buttons) {
    const box = button.getBoundingClientRect(),
      tile = button.parentElement!.getBoundingClientRect();
    if (
      getComputedStyle(button).position !== 'absolute' ||
      box.right > tile.right ||
      box.top < tile.top
    )
      throw new Error('Remove control is hidden.');
  }
  buttons[1]!.click();
}
function checkGifRemoval(form: HTMLElement): void {
  const text = form.querySelector('textarea')!;
  text.value =
    'Keep this caption\nhttps://static.klipy.com/ii/synthetic/one.gif\nhttps://static.klipy.com/ii/synthetic/two.gif';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  const gifs = form.querySelectorAll<HTMLButtonElement>(
    '.gif-draft-previews .media-picker-remove',
  );
  if (gifs.length !== 2) throw new Error('GIF previews missing.');
  gifs[0]!.click();
  if (
    !text.value.includes('Keep this caption') ||
    text.value.includes('one.gif') ||
    !text.value.includes('two.gif')
  )
    throw new Error('GIF removal changed another attachment.');
}
async function checkForm(
  dialog: HTMLDialogElement,
  mode: string,
  files: File[],
  access: PostEditorAccess,
): Promise<void> {
  const form = document.createElement('section');
  dialog.append(form);
  const tag = crypto.randomUUID(),
    value = { title: 'Synthetic post', text: 'Synthetic reply', tags: [tag] };
  const content =
    mode === 'reply'
      ? replyForm(form, value, access)
      : postForm(
          form,
          value,
          {
            page: {
              items: [
                { id: tag, label: 'Synthetic', active: true, revision: 1 },
              ],
              next: null,
            },
            load: () => Promise.reject(new Error('Unexpected pagination.')),
            run: (work) => work(),
          },
          access,
        );
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  const input = form.querySelector<HTMLInputElement>('input[type=file]')!;
  input.files = data.files;
  input.dispatchEvent(new Event('change'));
  checkRemoveButtons(form);
  const media = (await content()).media;
  if (media?.length !== 2 || new Set(media).size !== 2)
    throw new Error('Multiple-image upload failed.');
  checkGifRemoval(form);
}
/** Real worker, forms and CSS with local synthetic media. The upload adapter
 * confirms preparation without using a database or external media provider. */
export async function mediaNavigationFixture(root: HTMLElement): Promise<void> {
  const lifetime = new AbortController(),
    files = await syntheticFiles();
  root.innerHTML = `<style>body{display:block;overflow:auto}#app-shell{display:block;height:auto;padding:24px}.fixture-media{max-width:850px;margin:auto}</style><div id="app-shell" class="app" data-page="comunidades"><section class="fixture-media"><h1>Image proportions</h1></section></div>`;
  const output = document.createElement('output');
  root.prepend(output);
  await imageCards(
    root.querySelector('.fixture-media')!,
    files,
    lifetime.signal,
  );
  const dialog = document.createElement('dialog');
  dialog.className = 'community-scope post-composer-dialog';
  dialog.innerHTML = '<h2>Multiple-image post and reply regression</h2>';
  root.append(dialog);
  dialog.showModal();
  try {
    const access = mediaAccess(lifetime.signal);
    for (const mode of ['post', 'reply']) {
      await checkForm(dialog, mode, files, access);
      output.textContent += `${mode}: two images uploaded; individual image/GIF removal works. `;
    }
    const close = document.createElement('button');
    close.textContent = 'Show image layouts';
    close.type = 'button';
    close.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });
    dialog.append(close);
    output.textContent += 'PASS';
  } catch (error: unknown) {
    output.textContent =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
}
