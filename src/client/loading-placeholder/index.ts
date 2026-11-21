import { pingElement } from '../ping/index.ts';

/**
 * Loading screens (owner choice C, 21/11/2026): the shape of the coming page
 * pulses in place of a "Loading…" sentence, and Ping waits on top of it only
 * when the read takes longer than three seconds. The delay is a CSS
 * animation, so the placeholder has no timer: removing it ends everything.
 */
export type LoadingShape = 'profile' | 'posts' | 'rows';

const marker = 'loading-placeholder';

/** A pulsing silhouette; `label` stays readable for screen readers only. */
export function loadingPlaceholder(
  shape: LoadingShape,
  label: string,
): HTMLElement {
  const node = document.createElement('div'),
    text = document.createElement('span'),
    shapes = document.createElement('div'),
    ping = document.createElement('div');
  node.className = marker;
  node.dataset['shape'] = shape;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-busy', 'true');
  text.className = 'visually-hidden';
  text.textContent = label;
  shapes.className = 'loading-shapes';
  shapes.setAttribute('aria-hidden', 'true');
  if (shape === 'profile') shapes.append(profileShape(), postShape());
  else
    for (let index = 0; index < 3; index++)
      shapes.append(shape === 'posts' ? postShape() : rowShape());
  ping.className = 'loading-ping';
  ping.append(pingElement('typing', 'md'));
  node.append(text, shapes, ping);
  return node;
}

/** Ends the loading look in `host`, for reads that fail or keep old content. */
export function clearLoading(host: ParentNode | null | undefined): void {
  host?.querySelectorAll(`.${marker}`).forEach((node) => {
    node.remove();
  });
}

function block(kind: string): HTMLElement {
  const node = document.createElement('span');
  node.className = `loading-block loading-${kind}`;
  return node;
}

function group(className: string, ...children: HTMLElement[]): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children);
  return node;
}

function profileShape(): HTMLElement {
  return group(
    'loading-profile',
    block('banner'),
    block('portrait'),
    block('line loading-name'),
    block('line loading-short'),
    block('line loading-wide'),
    block('pill'),
  );
}

function postShape(): HTMLElement {
  return group(
    'loading-post',
    block('avatar'),
    group(
      'loading-lines',
      block('line loading-short'),
      block('line loading-title'),
      block('line loading-wide'),
      block('line loading-half'),
      group('loading-actions', block('chip'), block('chip'), block('chip')),
    ),
  );
}

function rowShape(): HTMLElement {
  return group(
    'loading-row',
    block('avatar'),
    group(
      'loading-lines',
      block('line loading-half'),
      block('line loading-short'),
    ),
  );
}
