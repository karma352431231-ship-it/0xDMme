import type { RecordEvent } from './recording.ts';

const scopes = [
  ['private', '[data-message-form]'],
  ['handle', '[data-public-compose]'],
  ['group', '[data-group-compose]'],
] as const;

function sendState(form: Element | null) {
  const send = form?.querySelector<HTMLButtonElement>('[data-compose-send]'),
    text = form?.querySelector<HTMLTextAreaElement>('textarea');
  return {
    present: form !== null,
    sendPresent: !!send,
    sendDisabled: send?.disabled ?? true,
    sendHidden: send?.hidden ?? true,
    textDisabled: text?.disabled ?? true,
    formHidden: !!form?.closest('[hidden]'),
  };
}

/** Observe only Enter intent, actual click/submit events and fixed control
 * states. Never read input values, message DOM, identities or arbitrary keys. */
export function observeSubmissions(record: RecordEvent): () => void {
  const abort = new AbortController(),
    signal = abort.signal,
    previous = new Map<string, string>();
  const changed = () => {
    for (const [scope, selector] of scopes) {
      const form = document.querySelector(selector),
        state = sendState(form),
        serialized = JSON.stringify(state);
      if (previous.get(scope) === serialized) continue;
      previous.set(scope, serialized);
      record('send-state', { scope, ...state });
    }
  };
  const action = (target: EventTarget | null, cause: string) => {
    if (!(target instanceof Element)) return;
    for (const [scope, selector] of scopes) {
      const form = target.closest(selector);
      if (!form) continue;
      changed();
      record('send-action', { scope, cause, ...sendState(form) });
      return;
    }
  };
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      if (event.target instanceof Element && event.target.matches('textarea'))
        action(event.target, 'enter');
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'click',
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-compose-send]')
      )
        action(event.target, 'button');
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'submit',
    (event) => action(event.target, 'submit'),
    {
      signal,
      capture: true,
    },
  );
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden'],
  });
  changed();
  return () => {
    abort.abort();
    observer.disconnect();
    previous.clear();
  };
}
