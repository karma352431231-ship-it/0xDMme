const icons = {
  back: '<path d="m14 6-6 6 6 6"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  phone:
    '<path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2z"/>',
  emoji:
    '<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/>',
  clip: '<path d="m8 12 7-7a3 3 0 0 1 4 4L9 19a5 5 0 0 1-7-7L12 2m-6 12 9-9"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  send: '<path d="m3 3 18 9-18 9 3-9zM6 12h15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
} as const;

export function chatIcon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

export function directChat(): string {
  return `<article class="card chat-panel">
    <div class="chat-welcome"><div class="empty-symbol" aria-hidden="true">#</div><h2>Vamos conversar?</h2><p>Escolha uma conversa no menu.</p></div>
    <div class="chat-feedback"><p data-message-status role="status"></p><details class="chat-options"><summary>Conexão</summary><div class="chat-popover"><p data-message-live role="status"></p><button data-message-refresh type="button">Sincronizar agora</button></div></details></div>
    <div class="chat-layout"><section data-direct-conversation class="chat-conversation">
      <header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Voltar às conversas">${chatIcon('back')}</button><span data-chat-avatar class="chat-peer-avatar" aria-hidden="true">#</span><div class="chat-peer"><h3 data-message-peer></h3><p data-peer-presence></p></div><button data-call-start class="chat-icon" type="button" aria-label="Ligar por voz" title="Ligar por voz">${chatIcon('phone')}</button><details class="chat-options"><summary class="chat-icon" aria-label="Opções da conversa" title="Opções da conversa">${chatIcon('more')}</summary><div class="chat-popover"><details><summary>Autorizações de representantes</summary><div data-representative-chat></div></details><a href="#perfil">Perfil e configurações</a></div></details></header>
      <div class="chat-thread"><p data-message-gate class="chat-gate" role="status"></p><button data-message-older class="chat-older" type="button" hidden>Mensagens anteriores</button><div data-message-history class="chat-history" tabindex="0" aria-label="Mensagens da conversa" hidden></div><ul data-message-pending class="chat-pending" aria-label="Envios pendentes deste aparelho"></ul></div>
      ${chatComposer('message')}
    </section><section data-group-conversation class="chat-conversation" hidden></section></div>
  </article>`;
}

/** Authored markup only. Account names and decrypted text never enter this template. */
export function chatComposer(scope: 'message' | 'group'): string {
  const form = scope === 'message' ? 'message-form' : 'group-compose';
  return `<form data-${form} class="chat-composer">
    ${scope === 'message' ? `<div data-compose-bar class="compose-context" hidden><p data-compose-context></p><button data-compose-cancel class="chat-icon" type="button" aria-label="Cancelar resposta ou edição">${chatIcon('close')}</button></div>` : ''}
    <div class="compose-preview"><div data-attachment-preview></div><button data-attachment-clear type="button" hidden>Remover prévia</button></div>
    <p data-voice-status class="compose-notice" role="status"></p>
    <div class="voice-controls"><button data-voice-stop type="button" hidden>Parar e conferir</button><button data-voice-cancel type="button" hidden>Cancelar gravação</button></div>
    <div class="compose-row">
      <div class="compose-input">
        <button data-${scope}-emoji class="chat-icon" type="button" aria-label="Escolher emoji" title="Escolher emoji">${chatIcon('emoji')}</button>
        <textarea data-${scope}-text rows="1" aria-label="Mensagem" placeholder="Mensagem…"></textarea>
        <details class="chat-options attach-options"><summary class="chat-icon" aria-label="Anexar foto ou arquivo" title="Anexar foto ou arquivo">${chatIcon('clip')}</summary><div class="chat-popover"><button data-chat-attachment="photo" type="button">Foto otimizada</button><button data-chat-attachment="file" type="button">Arquivo original · até 3 MB</button><p>Vídeos ainda não são aceitos.</p></div></details>
      </div>
      <button data-voice-record class="chat-icon compose-primary" type="button" aria-label="Gravar mensagem de voz" title="Gravar voz">${chatIcon('mic')}</button>
      <button data-compose-send class="chat-icon compose-primary" type="submit" aria-label="Enviar mensagem" title="Enviar" hidden>${chatIcon('send')}</button>
    </div>
    <select data-attachment-mode aria-label="Modo do anexo" hidden><option value="photo">Foto otimizada</option><option value="file">Arquivo original</option></select>
    <input data-attachment-file type="file" aria-label="Foto ou arquivo" hidden>
  </form>`;
}

export function composerState(input: {
  text: string;
  attachment: boolean;
  recording: boolean;
  blocked: boolean;
}): { send: boolean; record: boolean; disabled: boolean } {
  const content = input.text.trim().length > 0 || input.attachment;
  return {
    send: content && !input.recording,
    record: !content && !input.recording,
    disabled: input.blocked || input.recording,
  };
}

export function updateChatComposer(
  form: HTMLElement | null,
  input: { blocked: boolean; recording: boolean; attachment: boolean },
): void {
  if (!form) return;
  const text = form.querySelector<HTMLTextAreaElement>('textarea');
  const state = composerState({ ...input, text: text?.value ?? '' });
  const send = form.querySelector<HTMLButtonElement>('[data-compose-send]');
  if (send) {
    send.hidden = !state.send;
    send.disabled = state.disabled;
  }
  const record = form.querySelector<HTMLElement>('[data-voice-record]');
  if (record) record.hidden = !state.record;
  const clear = form.querySelector<HTMLElement>('[data-attachment-clear]');
  if (clear) clear.hidden = !input.attachment;
  // Draft typing is local. Keep the keyboard/focus during background sync;
  // sending and media actions remain blocked until the verified history opens.
  if (text) text.disabled = input.recording;
  form
    .querySelectorAll<HTMLButtonElement>(
      '[data-chat-attachment], [data-message-emoji], [data-group-emoji]',
    )
    .forEach((button) => {
      button.disabled = state.disabled;
    });
  form.dataset['recording'] = String(input.recording);
}

export function bindChatComposer(form: HTMLElement, changed: () => void): void {
  const text = form.querySelector<HTMLTextAreaElement>('textarea');
  const resize = () => {
    if (text) {
      text.style.height = 'auto';
      text.style.height = `${Math.min(text.scrollHeight, 128)}px`;
    }
    changed();
  };
  text?.addEventListener('input', resize);
  text?.addEventListener('keydown', (event) => {
    // Touch keyboards keep Enter as a newline; desktop Ctrl/Cmd+Enter sends.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const send = form.querySelector<HTMLButtonElement>('[data-compose-send]');
      if (send && !send.hidden && !send.disabled) send.click();
    }
  });
  form
    .querySelectorAll<HTMLButtonElement>('[data-chat-attachment]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const mode = form.querySelector<HTMLSelectElement>(
          '[data-attachment-mode]',
        );
        const file = form.querySelector<HTMLInputElement>(
          '[data-attachment-file]',
        );
        if (!mode || !file || file.disabled) return;
        mode.value = button.dataset['chatAttachment'] ?? 'photo';
        file.accept =
          mode.value === 'photo' ? 'image/png,image/jpeg,image/webp' : '';
        button.closest('details')?.removeAttribute('open');
        file.click();
      });
    });
}

export function bindChatOptions(host: HTMLElement): void {
  host.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const opened = host.querySelector<HTMLDetailsElement>(
      '.chat-options[open]',
    );
    if (!opened) return;
    opened.open = false;
    opened.querySelector<HTMLElement>('summary')?.focus();
    event.stopPropagation();
  });
  host.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    host
      .querySelectorAll<HTMLDetailsElement>('.chat-options[open]')
      .forEach((menu) => {
        if (!menu.contains(target)) menu.open = false;
      });
  });
}

/** Keep the reading position on refresh; only follow messages when already at the bottom. */
const positions = new WeakMap<HTMLElement, { top: number; follow: boolean }>();
const newConversations = new WeakSet<HTMLElement>();

export function resetHistoryPosition(history: HTMLElement | null): void {
  if (history) newConversations.add(history);
}

export function historyPosition(history: HTMLElement): () => void {
  if (newConversations.delete(history)) {
    positions.set(history, { top: 0, follow: true });
  } else if (!history.hidden) {
    const top = history.scrollTop;
    positions.set(history, {
      top,
      follow:
        history.childElementCount === 0 ||
        history.scrollHeight - top - history.clientHeight < 80,
    });
  }
  const position = positions.get(history) ?? { top: 0, follow: true };
  return () => {
    if (!history.hidden)
      history.scrollTop = position.follow ? history.scrollHeight : position.top;
  };
}
