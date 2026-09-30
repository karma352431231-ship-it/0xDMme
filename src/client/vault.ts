import { element } from './probe-ui/index.ts';
import { boundedResponse } from './probe-transport/index.ts';
import {
  newRecoverySecret,
  openHistory,
  sealHistory,
} from './vault-probe/index.ts';
import { identity, parseObject, text } from '../shared/crypto-probe/index.ts';
import { parseEnvelope } from '../shared/vault-probe/index.ts';

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
    status.textContent =
      'Operação rejeitada. Confira segredo, identidade, revisão e integridade; nenhum histórico foi enviado em texto aberto.';
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
  if (!config.ok) throw new Error('Sessão indisponível.');
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
  if (!response.ok) throw new Error('Cofre rejeitado pelo relay.');
  return boundedResponse(response);
}

element('generate-secret', HTMLButtonElement).addEventListener('click', () => {
  secret.value = newRecoverySecret();
  status.textContent =
    'Segredo fictício gerado somente neste navegador. Copie para o ensaio de recuperação.';
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
    status.textContent = `Cofre cifrado localmente em ${(performance.now() - started).toFixed(1)} ms. Apenas o envelope pode ser guardado no relay.`;
  });
});
element('store', HTMLButtonElement).addEventListener('click', () => {
  void run(async () => {
    const sealed = parseEnvelope(envelope.value);
    if (sealed.owner !== owner) throw new Error('Identidade inválida.');
    await relay('vault-save', JSON.stringify(sealed));
    status.textContent =
      'Relay recebeu apenas o envelope cifrado, em memória. Segredo e histórico ficaram no cliente.';
  });
});
element('load', HTMLButtonElement).addEventListener('click', () => {
  void run(async () => {
    envelope.value = JSON.stringify(
      parseEnvelope(await relay('vault-load', '{}')),
    );
    status.textContent =
      'Envelope cifrado obtido. Informe o segredo para abrir localmente.';
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
    status.textContent = `Histórico recuperado localmente em ${(performance.now() - started).toFixed(1)} ms (revisão ${snapshot.revision}). Nenhuma sessão ou permissão de aparelho foi restaurada.`;
  });
});
