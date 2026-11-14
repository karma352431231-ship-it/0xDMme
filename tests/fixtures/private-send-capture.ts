import type { TestContext } from 'node:test';
import {
  installChatSyncDiagnostics,
  beginPrivateSend,
  privateSendContext,
  traceSend,
} from '../../src/client/chat-sync-diagnostics/index.ts';
import { chatSyncControl } from '../../src/shared/chat-sync-diagnostics/index.ts';
import { observeReuseDecisions } from '../../src/tools/chat-diagnostics/reuse.ts';
import { Recording } from '../../src/tools/chat-diagnostics/recording.ts';

export function privateSendCapture(t: TestContext) {
  let now = 1000,
    next = 0;
  t.mock.method(performance, 'now', () => now);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const host = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  installChatSyncDiagnostics(host as Window);
  const recording = new Recording();
  const stop = observeReuseDecisions(recording.record);
  t.after(() => {
    stop();
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return {
    recording,
    at(ms: number) {
      now = 1000 + ms;
    },
    send(
      id = `synthetic-${++next}`,
      scope: 'private' | 'group' = 'private',
      mode: 'text' | 'image' = 'text',
    ) {
      const slot = ++next;
      const event = new Event('submit');
      recording.record('send-action', {
        scope,
        composer: 1,
        gesture: slot,
        cause: 'button',
        sendDisabled: false,
        sendHidden: false,
        formHidden: false,
        mediaKind: mode,
        viewOnce: false,
      });
      host.dispatchEvent(
        new CustomEvent(chatSyncControl, {
          detail: {
            privateSubmission: {
              event,
              mediaMode: mode === 'text' ? 'text' : 'ordinary',
              composer: 1,
              gesture: slot,
              clock: now,
            },
          },
        }),
      );
      beginPrivateSend(id, event, scope);
      return {
        id,
        context: privateSendContext(id),
        accepted() {
          traceSend('accepted', id);
          traceSend('check-render', id);
        },
      };
    },
  };
}
