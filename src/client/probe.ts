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
let stage = 'preparação da sessão';

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
        ? 'WASM incompatível'
        : 'operação rejeitada';
    status.textContent = `Falha na ${stage} (${kind}). Confira as chaves e a sessão; nenhum envio em texto aberto será feito.`;
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
    if (!response.ok) throw new Error('O laboratório rejeitou a operação.');
    return boundedResponse(response);
  };
}

async function initialize(): Promise<void> {
  const role = location.hash.slice(1);
  if (!isRole(role)) throw new Error('Cliente inválido.');
  const config = await fetch('/api/config', {
    signal: AbortSignal.timeout(5_000),
  });
  if (!config.ok) throw new Error('Configuração indisponível.');
  const token = text(parseObject(await boundedResponse(config))[role]);
  stage = 'inicialização do motor criptográfico';
  const initialized = await ProbeClient.create(role, transport(role, token));
  stage = 'publicação das chaves públicas';
  try {
    await initialized.publishKeys();
  } catch (error: unknown) {
    initialized.close();
    throw error;
  }
  client = initialized;
  stage = 'operação solicitada';
  element('name', HTMLHeadingElement).textContent =
    `Cliente ${role === 'alice' ? 'Alice' : 'Bob'}`;
  element('fingerprint', HTMLTextAreaElement).value = client.fingerprint;
  status.textContent =
    'Cliente iniciado. Copie a chave pública da outra tela para autorizar.';
  document.title = `Hash-Talk · ${role}`;
  confirm.addEventListener('click', () => {
    void run(async () => {
      authorized = false;
      if (!client) throw new Error('Cliente indisponível.');
      await client.confirmPeer(expected.value);
      authorized = true;
      expected.readOnly = true;
      status.textContent = 'Chave confirmada. Pronto para enviar e receber.';
    });
  });
  send.addEventListener('click', () => {
    void run(async () => {
      if (!client) throw new Error('Cliente indisponível.');
      await client.send(message.value);
      message.value = '';
      status.textContent =
        'Pacote cifrado recebido pelo laboratório. O destinatário pode buscar.';
    });
  });
  receive.addEventListener('click', () => {
    void run(async () => {
      if (!client) throw new Error('Cliente indisponível.');
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
      status.textContent =
        'Busca concluída. As mensagens recebidas estão abaixo.';
    });
  });
  revoke.addEventListener('click', () => {
    void run(async () => {
      authorized = false;
      if (!client) throw new Error('Cliente indisponível.');
      await client.revokePeer();
      await client.send(
        'Texto fictício posterior à revogação; somente para o remetente.',
      );
      status.textContent =
        'Dispositivo revogado e sessão rotacionada. O outro cliente não abre o novo pacote; cópias anteriores continuam legíveis.';
    });
  });
}

window.addEventListener('pagehide', () => client?.close(), { once: true });
void run(initialize);
