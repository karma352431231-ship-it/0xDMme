import { profileActions } from './native-product-profile.ts';
import { contactActions } from './native-product-contacts.ts';
import { publicActions } from './native-product-public.ts';
import { messageActions } from './native-product-messages.ts';
import { groupActions } from './native-product-groups.ts';
import { statusActions } from './native-product-status.ts';
import { attachmentActions } from './native-product-attachments.ts';
import { vaultActions } from './native-product-vault.ts';
import { socialActions } from './native-product-social.ts';
import { socialVoiceActions } from './native-product-social-voice.ts';
import { conversationToolActions } from './native-product-conversation-tools.ts';
import { receiptActions } from './native-product-receipts.ts';
import { cameraActions } from './native-product-camera.ts';
import { contactVisibilityActions } from './native-product-contact-visibility.ts';

const actions = new Map([
  ...profileActions,
  ...contactActions,
  ...publicActions,
  ...messageActions,
  ...groupActions,
  ...statusActions,
  ...attachmentActions,
  ...vaultActions,
  ...socialActions,
  ...socialVoiceActions,
  ...conversationToolActions,
  ...receiptActions,
  ...cameraActions,
  ...contactVisibilityActions,
]);

/** Owns only the single test action, deadline, cancellation and result lifecycle.
 * Feature drivers use the public DOM; none imports product/API/storage internals.
 */
export function installNativeProductActions(): void {
  let active = false;
  const state: { status: string; value: string } = {
    status: 'idle',
    value: '',
  };
  Object.assign(window, {
    syntheticNativeProduct: {
      state,
      start(action: string, value = '') {
        if (active || value.length > 1024)
          throw new Error('Synthetic native action unavailable.');
        active = true;
        state.status = 'running';
        state.value = '';
        const controller = new AbortController();
        const cancel = () => controller.abort();
        const timer = setTimeout(cancel, 60_000);
        window.addEventListener('pagehide', cancel, { once: true });
        const execute = actions.get(action);
        const operation = execute
          ? execute({ value, signal: controller.signal })
          : Promise.reject(
              new Error('Unknown synthetic native product action.'),
            );
        void operation
          .then(
            (result) => {
              state.status = 'passed';
              state.value = result;
            },
            (error: unknown) => {
              state.status = 'failed';
              state.value =
                error instanceof Error
                  ? error.message.slice(0, 180)
                  : 'The public product flow failed or timed out.';
            },
          )
          .finally(() => {
            clearTimeout(timer);
            window.removeEventListener('pagehide', cancel);
            active = false;
          });
      },
    },
  });
}
