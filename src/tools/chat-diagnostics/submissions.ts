import type { RecordEvent } from './recording.ts';
import { CompositionMetadata } from './composition.ts';

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

/** Observe gestures and fixed controls; only file MIME categories and sizes
 * enter metadata. Never read input values, content, filenames or identities. */
export function observeSubmissions(record: RecordEvent): () => void {
  const abort = new AbortController(),
    signal = abort.signal,
    previous = new Map<string, string>(),
    metadata = new CompositionMetadata();
  let gesture: Gesture | undefined,
    sequence = 0;
  let gestureTimer: ReturnType<typeof setTimeout> | undefined;
  const gestureFor = (form: Element, cause: string) => {
    if (gesture?.form === form && followsGesture(gesture, cause)) {
      gesture.clicked ||= cause === 'button';
      gesture.submitted ||= cause === 'submit';
      return gesture.id;
    }
    const current: Gesture = {
      form,
      id: ++sequence,
      cause,
      clicked: cause === 'button',
      submitted: cause === 'submit',
    };
    gesture = current;
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => {
      gesture = undefined;
    }, 0);
    return current.id;
  };
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
    const context = compositionForm(target);
    if (!context) return;
    const { form, scope } = context;
    changed();
    record('send-action', {
      scope,
      cause,
      gesture: gestureFor(form, cause),
      ...sendState(form),
      ...metadata.read(form),
    });
  };
  const clearSelection = (target: EventTarget | null) => {
    if (
      !(target instanceof Element) ||
      !target.closest('[data-attachment-clear]')
    )
      return;
    const context = compositionForm(target);
    if (!context) return;
    metadata.clear(context.form);
    record('attachment-cleared', {
      scope: context.scope,
      ...metadata.read(context.form),
    });
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
    'change',
    (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.matches('[data-attachment-file]')
      )
        return;
      const input = event.target as HTMLInputElement;
      const context = compositionForm(input);
      if (!context || !input.files?.length) return;
      metadata.select({ ...context, files: input.files }, record);
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'click',
    (event) => {
      clearSelection(event.target);
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
    gesture = undefined;
    clearTimeout(gestureTimer);
    metadata.stop();
  };
}

function compositionForm(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  for (const [scope, selector] of scopes) {
    const form = target.closest(selector);
    if (form) return { scope, form };
  }
  return null;
}

interface Gesture {
  form: Element;
  id: number;
  cause: string;
  clicked: boolean;
  submitted: boolean;
}
function followsGesture(gesture: Gesture, cause: string): boolean {
  if (cause === 'submit') return !gesture.submitted;
  return cause === 'button' && gesture.cause === 'enter' && !gesture.clicked;
}
