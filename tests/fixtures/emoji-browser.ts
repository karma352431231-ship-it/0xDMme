import {
  EmojiPicker,
  emojiIntoComposer,
  emojiText,
} from '../../src/client/emoji/index.ts';
import { messageActions } from '../../src/client/message-actions/index.ts';
import type { DailyRow, DailyView } from '../../src/client/daily-text/index.ts';

// Manual smoke surface with synthetic content only; never part of production build.
const picker = new EmojiPicker();
const root = document.querySelector('main');
if (!root) throw new Error('Fixture ausente.');
root.innerHTML = `<article class="card"><h1>Teste isolado de emojis</h1><p>Somente conteúdo sintético. Mesmos módulos do compositor, renderer e ações do app.</p><label>Mensagem de teste<textarea rows="3"></textarea></label><button type="button" data-picker>Escolher emoji</button><h2>Mensagem renderizada</h2><p data-preview></p><div data-actions></div><p data-reaction role="status"></p><button type="button" data-reset>Trocar sessão sintética</button><p data-status role="status"></p></article>`;
const input = root.querySelector('textarea'),
  trigger = root.querySelector<HTMLButtonElement>('[data-picker]'),
  preview = root.querySelector<HTMLElement>('[data-preview]'),
  actions = root.querySelector('[data-actions]'),
  reaction = root.querySelector<HTMLElement>('[data-reaction]'),
  status = root.querySelector('[data-status]');
if (!input || !trigger || !preview || !actions || !reaction || !status)
  throw new Error('Controles de teste ausentes.');
const renderedText = 'Teste: 😀 👩🏽‍💻 🇧🇷 <script>texto literal</script>';
emojiText(preview, renderedText);
function action(label: string, work: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    void work().catch((error: unknown) => {
      if (status)
        status.textContent =
          error instanceof Error ? error.message : 'Falha de teste.';
    });
  });
  return button;
}
trigger.addEventListener('click', () => {
  void emojiIntoComposer(picker, trigger, input)
    .then(() => emojiText(preview, input.value))
    .catch(() => {
      status.textContent = 'Falha no compositor de teste.';
    });
});
const view: DailyView<DailyRow> = {
  id: 'synthetic-message',
  hash: 'synthetic-hash',
  text: renderedText,
  own: true,
  kind: 'text',
  peer: 'synthetic-peer',
  content: { text: renderedText, reply: null, forwarded: false },
  edited: false,
  reactions: [],
};
actions.append(
  messageActions({
    view,
    peers: [],
    picker,
    action,
    choose: () => {
      status.textContent = 'Contexto de teste selecionado.';
    },
    react: (_view, emoji) => {
      emojiText(
        reaction,
        emoji ? `Reação Unicode: ${emoji}` : 'Reação removida.',
      );
      return Promise.resolve();
    },
    forward: () => Promise.resolve(),
  }),
);
root.querySelector('[data-reset]')?.addEventListener('click', () => {
  picker.reset();
  status.textContent = 'Recentes limpos na troca de sessão.';
});
