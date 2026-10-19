import { t } from '../shared/i18n/index.ts';
import { startLanguage } from './language/index.ts';
import { element } from './probe-ui/index.ts';
import { boundedResponse } from './probe-transport/index.ts';
import {
  newRecoverySecret,
  openHistory,
  sealHistory,
} from './vault-probe/index.ts';
import { identity, parseObject, text } from '../shared/crypto-probe/index.ts';
import { parseEnvelope } from '../shared/vault-probe/index.ts';

startLanguage();
const owner = identity('alice').user;
const secret = element('secret', HTMLInputElement);
const envelope = element('envelope', HTMLTextAreaElement);
const message = element('history-message', HTMLTextAreaElement);
const revision = element('revision', HTMLInputElement);
const status = element('vault-status', HTMLParagraphElement);
const restored = element('restored', HTMLParagraphElement);
const buttons = Array.from(document.querySelectorAll('button'));
let busy = false;

async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  for (const button of buttons) button.disabled = true;
  try {
    await action();
  } catch {
    status.textContent = t(
      'Operation rejected. Check the secret, identity, revision and integrity; no plaintext history was sent.',
    );
  } finally {
    busy = false;
    for (const button of buttons) button.disabled = false;
  }
}

async function relay(
  operation: 'vault-save' | 'vault-load',
  body: string,
): Promise<string> {
  const config = await fetch('/api/config', {
    signal: AbortSignal.timeout(5_000),
  });
  if (!config.ok) throw new Error('Session unavailable.');
  const token = text(parseObject(await boundedResponse(config)).alice);
  const response = await fetch(`/api/alice/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Vault rejected by the relay.');
  return boundedResponse(response);
}

element('generate-secret', HTMLButtonElement).addEventListener('click', () => {
  secret.value = newRecoverySecret();
  status.textContent = t(
    'Fictional secret generated only in this browser. Copy it for the recovery test.',
  );
});
element('seal', HTMLButtonElement).addEventListener('click', () => {
  void run(async () => {
    const started = performance.now();
    const sealed = await sealHistory(
      {
        owner,
        revision: Number(revision.value),
        messages: [{ id: 'synthetic-history', body: message.value }],
      },
      secret.value,
    );
    envelope.value = JSON.stringify(sealed);
    status.textContent = t(
      'Vault encrypted locally in {0} ms. Only the envelope may be stored on the relay.',
      [(performance.now() - started).toFixed(1)],
    );
  });
});
element('store', HTMLButtonElement).addEventListener('click', () => {
  void run(async () => {
    const sealed = parseEnvelope(envelope.value);
    if (sealed.owner !== owner) throw new Error('Invalid identity.');
    await relay('vault-save', JSON.stringify(sealed));
    status.textContent = t(
      'The relay received only the encrypted envelope in memory. The secret and history stayed on the client.',
    );
  });
});
element('load', HTMLButtonElement).addEventListener('click', () => {
  void run(async () => {
    envelope.value = JSON.stringify(
      parseEnvelope(await relay('vault-load', '{}')),
    );
    status.textContent = t(
      'Encrypted envelope received. Enter the secret to open it locally.',
    );
  });
});
element('open', HTMLButtonElement).addEventListener('click', () => {
  restored.textContent = '';
  void run(async () => {
    const started = performance.now();
    const snapshot = await openHistory(envelope.value, secret.value, owner);
    restored.textContent = snapshot.messages
      .map((entry) => entry.body)
      .join('\n');
    status.textContent = t(
      'History recovered locally in {0} ms (revision {1}). No session or device permission was restored.',
      [(performance.now() - started).toFixed(1), snapshot.revision],
    );
  });
});
