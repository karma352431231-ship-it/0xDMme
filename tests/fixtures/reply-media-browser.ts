import { mountPublicPicture } from '../../src/client/public-media/picture.ts';
import { setActiveLanguage } from '../../src/shared/i18n/index.ts';
import type { AppLanguage } from '../../src/shared/i18n/index.ts';

// Manual layout regression with real app CSS and the public picture/viewer lifecycle.
export async function replyMediaFixture(
  root: HTMLElement,
  language: AppLanguage,
) {
  setActiveLanguage(language);
  const lifetime = new AbortController();
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 560;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'lightgray';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'darkslategray';
  context.fillText('Synthetic reply media', 24, 40);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Synthetic PNG could not be created.'));
    }),
  );
  const source = URL.createObjectURL(blob);
  root.innerHTML = `<style>
    body { display: block; overflow: auto; }
    #app-shell, .fixture-scope { display: block; height: auto; padding: 16px; }
    .fixture-scope .community-card { display: block; width: 100%; padding: 0 !important; margin: 16px 0; }
    .fixture-scope figure.chat-gif { margin: 0; }
  </style><div id="app-shell" data-page="comunidades" class="app fixture-scope"></div>
  <section class="community-scope fixture-scope" data-scope="panel"></section>`;
  for (const scope of root.querySelectorAll<HTMLElement>('.fixture-scope')) {
    for (const kind of ['root', 'thread', 'focused', 'feed']) {
      const card = document.createElement('article');
      card.className = 'community-card community-post';
      card.dataset['case'] = kind;
      if (kind === 'thread') card.classList.add('community-reply');
      if (kind === 'focused') card.classList.add('community-post-focus');
      if (kind !== 'root') card.classList.add('community-post-is-reply');
      card.innerHTML = `<p class="community-text">Synthetic ${kind}</p>
        <div class="community-public-media"><figure data-picture></figure></div>
        <div class="community-public-media"><figure class="community-public-video" style="--video-ratio: 1.142857"><video width="640" height="560" class="community-media-preview"></video></figure></div>
        <div class="community-external-gif"><figure class="chat-gif"><img src="${source}" width="640" height="560" alt="Synthetic GIF"></figure></div>
        <div class="community-external-gif"><figure class="chat-gif"><video poster="${source}" width="640" height="560"></video></figure></div>`;
      scope.append(card);
      mountPublicPicture(
        card.querySelector('[data-picture]')!,
        {
          id: crypto.randomUUID(),
          review: crypto.randomUUID(),
          result: {
            kind: 'photo',
            type: 'image/png',
            bytes: blob.size,
            width: 640,
            height: 560,
            seconds: 0,
            fps: 0,
            thumbnailBytes: 0,
            normalized: true,
          },
        },
        { signal: lifetime.signal, load: () => Promise.resolve(blob) },
      );
    }
  }
  return {
    close: () => {
      lifetime.abort();
      URL.revokeObjectURL(source);
    },
  };
}
