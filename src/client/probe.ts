import { t } from '../shared/i18n/index.ts';
import { startLanguage } from './language/index.ts';
import { ProbeClient } from './crypto-probe/index.ts';
import { boundedResponse } from './probe-transport/index.ts';
import { element } from './probe-ui/index.ts';
import {
  identity,
  isRole,
  parseObject,
  peer,
  text,
} from '../shared/crypto-probe/index.ts';
import type { ProbeTransport, Role } from '../shared/crypto-probe/index.ts';

startLanguage();
const status = element('status', HTMLParagraphElement);
const confirm = element('confirm', HTMLButtonElement);
const send = element('send', HTMLButtonElement);
const receive = element('receive', HTMLButtonElement);
const revoke = element('revoke', HTMLButtonElement);
const expected = element('expected', HTMLTextAreaElement);
const message = element('message', HTMLTextAreaElement);
const messages = element('messages', HTMLUListElement);
const displayed = new Set<string>();
let client: ProbeClient | undefined;
let authorized = false;
let busy = false;
let stage = t('session preparation');

function controls(): void {
  confirm.disabled = busy || !client;
  send.disabled = receive.disabled = busy || !authorized;
  revoke.disabled = busy || !authorized;
}

async function run(operation: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  controls();
  try {
    await operation();
  } catch (error: unknown) {
    const kind =
      error instanceof WebAssembly.CompileError
        ? t('Incompatible WASM')
        : t('operation rejected');
    status.textContent = t(
      'Failure in {0} ({1}). Check the keys and session; no plaintext will be sent.',
      [stage, kind],
    );
  } finally {
    busy = false;
    controls();
  }
}

function transport(role: Role, token: string): ProbeTransport {
  return async (operation, body) => {
    const response = await fetch(`/api/${role}/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('The laboratory rejected the operation.');
    return boundedResponse(response);
  };
}

async function initialize(): Promise<void> {
  const role = location.hash.slice(1);
  if (!isRole(role)) throw new Error('Invalid client.');
  const config = await fetch('/api/config', {
    signal: AbortSignal.timeout(5_000),
  });
  if (!config.ok) throw new Error('Settings unavailable.');
  const token = text(parseObject(await boundedResponse(config))[role]);
  stage = t('cryptographic engine initialization');
  const initialized = await ProbeClient.create(role, transport(role, token));
  stage = t('public key publication');
  try {
    await initialized.publishKeys();
  } catch (error: unknown) {
    initialized.close();
    throw error;
  }
  client = initialized;
  stage = t('operation requested');
  element('name', HTMLHeadingElement).textContent = t('Client {0}', [
    role === 'alice' ? 'Alice' : 'Bob',
  ]);
  element('fingerprint', HTMLTextAreaElement).value = client.fingerprint;
  status.textContent = t(
    'Client started. Copy the public key from the other screen to authorize.',
  );
  document.title = t('0xDMme · {0}', [role]);
  confirm.addEventListener('click', () => {
    void run(async () => {
      authorized = false;
      if (!client) throw new Error('Client unavailable.');
      await client.confirmPeer(expected.value);
      authorized = true;
      expected.readOnly = true;
      status.textContent = t('Key confirmed. Ready to send and receive.');
    });
  });
  send.addEventListener('click', () => {
    void run(async () => {
      if (!client) throw new Error('Client unavailable.');
      await client.send(message.value);
      message.value = '';
      status.textContent = t(
        'Encrypted package received by the laboratory. The recipient can retrieve it.',
      );
    });
  });
  receive.addEventListener('click', () => {
    void run(async () => {
      if (!client) throw new Error('Client unavailable.');
      for (const event of await client.receive()) {
        const id = text(event.event_id);
        if (event.sender !== identity(peer(role)).user || displayed.has(id))
          continue;
        const plaintext = await client.decrypt(event);
        const item = document.createElement('li');
        item.textContent = plaintext;
        messages.append(item);
        displayed.add(id);
      }
      status.textContent = t('Search completed. Received messages are below.');
    });
  });
  revoke.addEventListener('click', () => {
    void run(async () => {
      authorized = false;
      if (!client) throw new Error('Client unavailable.');
      await client.revokePeer();
      await client.send(t('Fictional text after revocation; sender only.'));
      status.textContent = t(
        'Device revoked and session rotated. The other client cannot open the new package; previous copies remain readable.',
      );
    });
  });
}

window.addEventListener('pagehide', () => client?.close(), { once: true });
void run(initialize);
