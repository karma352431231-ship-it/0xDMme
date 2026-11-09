import {
  node,
  until,
  click,
  field,
  expand,
  page,
  textButton,
  labelledField,
  waitButton,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

async function publicProfile({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('perfil', '[data-public-input]', signal);
  expand('profile');
  await until(
    () =>
      !node<HTMLElement>('[data-public-owned]').hidden ||
      !node<HTMLButtonElement>('[data-public-action=create]').disabled,
    signal,
    'The public profile creation controls',
  );
  if (node<HTMLElement>('[data-public-owned]').hidden) {
    field('[data-public-input]', value);
    click('[data-public-action=create]');
    await until(
      () => !!document.querySelector('.external-media-consent[open]'),
      signal,
    );
    textButton('.external-media-consent', 'Manter somente links');
  }
  await until(
    () =>
      document.querySelector('[data-public-own-handle]')?.textContent ===
      `@${value}`,
    signal,
  );
  return `Public profile @${value} is visible; external media remains links only.`;
}

async function communityCreate({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('comunidades?view=create', '.community-card input', signal);
  await waitButton('[data-communities]', 'Criar comunidade', signal);
  labelledField('[data-communities]', 'Nome da comunidade', value);
  labelledField(
    '[data-communities]',
    'Descrição',
    'Synthetic installed-app community. No real data.',
  );
  labelledField(
    '[data-communities]',
    'Regras locais',
    'Synthetic test content only.',
  );
  textButton('[data-communities]', 'Criar comunidade');
  await until(
    () =>
      location.hash.startsWith('#comunidades?id=') &&
      !!document.querySelector('.community-hero'),
    signal,
    'The created community route and header',
  );
  if (!node('.community-hero').textContent?.includes(value))
    throw new Error('Created community did not open.');
  return location.hash;
}

function postInput(value: string): { hash: string; text: string } {
  const raw = JSON.parse(value) as unknown;
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('hash' in raw) ||
    !('text' in raw) ||
    typeof raw.hash !== 'string' ||
    typeof raw.text !== 'string' ||
    !/^#comunidades\?id=[a-f0-9-]{36}(?:&post=[a-f0-9-]{36})?$/u.test(raw.hash)
  )
    throw new Error('Expected a synthetic community and post.');
  return { hash: raw.hash, text: raw.text };
}

async function communityFollow({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  if (!/^#comunidades\?id=[a-f0-9-]{36}$/u.test(value))
    throw new Error('Expected the synthetic community route.');
  await page(value.slice(1), '.community-follow', signal);
  await until(
    () => !node<HTMLButtonElement>('.community-follow').disabled,
    signal,
  );
  if (node('.community-follow').getAttribute('aria-pressed') !== 'true')
    click('.community-follow');
  await until(
    () => node('.community-follow').getAttribute('aria-pressed') === 'true',
    signal,
  );
  return 'The independent synthetic account follows the community.';
}

async function communityRead({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = postInput(value);
  await page(input.hash.slice(1), '[data-post-id]', signal);
  await until(
    () =>
      [...document.querySelectorAll('[data-post-id]')].some((post) =>
        post.textContent?.includes(input.text),
      ),
    signal,
  );
  return 'The independently opened public view contains the expected post or reply.';
}

async function communityVote({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = postInput(value);
  await communityRead({ value, signal });
  const selector =
    '.community-post-focus .post-votes button[aria-label^="Votar a favor"]';
  await until(
    () =>
      !!document.querySelector(selector) &&
      !node<HTMLButtonElement>(selector).disabled,
    signal,
  );
  const score = Number(node('.community-post-focus .post-score').textContent);
  if (!Number.isSafeInteger(score))
    throw new Error('The initial public score is invalid.');
  click(selector);
  await until(
    () =>
      Number(node('.community-post-focus .post-score').textContent) ===
        score + 1 &&
      node('[data-communities]').textContent?.includes('Alteração salva.') ===
        true,
    signal,
    'The confirmed public vote score and completion notice',
  );
  if (!node('.community-post-focus').textContent?.includes(input.text))
    throw new Error('The vote changed the wrong synthetic post.');
  return 'The other account voted for the expected public post.';
}

async function communityReply({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = postInput(value);
  await page(input.hash.slice(1), '.community-post-focus', signal);
  const selector =
    '.community-post-focus button[aria-label="Responder à postagem"][aria-expanded]';
  await until(
    () =>
      !!document.querySelector(selector) &&
      !node<HTMLButtonElement>(selector).disabled,
    signal,
    'The authorized enabled public reply action',
  );
  click(selector);
  await until(
    () =>
      !!document.querySelector(
        '.community-post-focus .reply-box:not([hidden]) textarea',
      ),
    signal,
    'The opened actual reply composer',
  );
  labelledField(
    '.community-post-focus .reply-box',
    'Texto da resposta (opcional com mídia)',
    input.text,
  );
  await waitButton('.community-post-focus .reply-box', 'Responder', signal);
  textButton('.community-post-focus .reply-box', 'Responder');
  await until(
    () =>
      [...document.querySelectorAll('.community-reply')].some((reply) =>
        reply.textContent?.includes(input.text),
      ),
    signal,
    'The accepted public reply in its parent thread',
  );
  return 'The public reply was accepted and rendered in the actual parent thread.';
}

async function communityPost({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = postInput(value);
  await page(input.hash.slice(1), '.community-posts details', signal);
  await until(
    () =>
      [...document.querySelectorAll('.community-posts details')].some(
        (candidate) =>
          candidate.querySelector('summary')?.textContent === 'Criar postagem',
      ),
    signal,
    'The authorized public post composer',
  );
  const form = [...node('.community-posts').querySelectorAll('details')].find(
    (candidate) =>
      candidate.querySelector('summary')?.textContent === 'Criar postagem',
  );
  if (!form) throw new Error('The public post composer is unavailable.');
  if (!form.open) form.querySelector('summary')?.click();
  await waitButton('.community-posts', 'Publicar postagem', signal);
  labelledField(
    '.community-posts',
    'Título (opcional)',
    'Native synthetic post',
  );
  labelledField(
    '.community-posts',
    'Texto da postagem (opcional com mídia)',
    input.text,
  );
  textButton('.community-posts', 'Publicar postagem');
  await until(
    () =>
      [...document.querySelectorAll('[data-post-id]')].some((post) =>
        post.textContent?.includes(input.text),
      ),
    signal,
  );
  const post = [
    ...document.querySelectorAll<HTMLElement>('[data-post-id]'),
  ].find((item) => item.textContent?.includes(input.text));
  if (!post?.dataset['postId'])
    throw new Error('The published post has no public identity.');
  return `${input.hash}&post=${post.dataset['postId']}`;
}

export const publicActions: ReadonlyMap<string, NativeAction> = new Map([
  ['public-profile', publicProfile],
  ['community-create', communityCreate],
  ['community-post', communityPost],
  ['community-follow', communityFollow],
  ['community-read', communityRead],
  ['community-vote', communityVote],
  ['community-reply', communityReply],
]);
