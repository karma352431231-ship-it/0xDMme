import { themes } from '../appearance/index.ts';
import { externalMediaNotice } from '../external-media/index.ts';
import { presetPack, presets } from './record.ts';
import type { PresetId, SettingsPack } from './record.ts';

const discoveryOptions = [
  ['invite', 'Somente com meu link de convite'],
  ['wallet', 'Por wallet exata ou convite'],
  ['contacts', 'Somente contatos já aprovados'],
] as const;

// Static authored markup; values are set through DOM properties afterwards.
const choiceStep = `<section data-wizard-step="choose"><h2>Configurações iniciais</h2><p>Escolha um ponto de partida. Você revisa cada opção antes de salvar e pode mudar tudo depois em Perfil.</p><div class="settings-pack-presets">${presets
  .map(
    (preset) =>
      `<button type="button" class="settings-pack-preset" data-preset="${preset.id}"><strong>${preset.label}</strong><small>${preset.hint}</small></button>`,
  )
  .join(
    '',
  )}</div><div class="settings-actions"><button type="button" data-wizard-skip>Agora não</button></div></section>`;

const reviewStep = `<form data-wizard-step="review" hidden><h2>Revise suas configurações</h2><p>Valem para a sua conta em todos os aparelhos.</p>
<fieldset><legend>Aparência</legend><div class="settings-pack-themes">${themes
  .map(
    (theme) =>
      `<label><input type="radio" name="theme" value="${theme.id}"> ${theme.label}</label>`,
  )
  .join('')}</div></fieldset>
<fieldset><legend>Privacidade</legend><label>Quem pode pedir conversa<select name="discovery">${discoveryOptions
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join(
    '',
  )}</select></label><label><input type="checkbox" name="online"> Exibir online para contatos aprovados</label><label><input type="checkbox" name="readReceipts"> Enviar confirmação de leitura</label></fieldset>
<fieldset><legend>Mídias externas</legend><label><input type="checkbox" name="externalMedia"> Mostrar GIFs e vídeos externos</label><small data-wizard-media></small></fieldset>
<fieldset><legend>Notificações</legend><label><input type="checkbox" name="pushEnabled"> Receber notificações push</label><div class="settings-pack-push"><label><input type="checkbox" name="messages"> Mensagens e respostas</label><label><input type="checkbox" name="calls"> Chamadas</label><label><input type="checkbox" name="showCalls"> Identificar aviso como chamada de voz</label></div><small>Ao salvar, o navegador pede a permissão de notificações. O nome do contato nunca aparece.</small><label><input type="checkbox" name="sound"> Sons dentro do app</label></fieldset>
<fieldset><legend>Backup</legend><label><input type="checkbox" name="backupReminder"> Lembrar de salvar um backup a cada sete dias</label></fieldset>
<div class="settings-actions"><button type="button" data-wizard-back>Voltar</button><button type="submit" class="primary">Salvar e começar</button></div></form>`;

const resultStep = `<section data-wizard-step="result" hidden><h2>Configurações iniciais</h2><p data-wizard-result role="status"></p><ul data-wizard-problems></ul><div class="settings-actions"><button type="button" class="primary" data-wizard-close>Fechar</button></div></section>`;

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

function fill(form: HTMLFormElement, pack: SettingsPack): void {
  const { settings, privacy } = pack;
  for (const [name, value] of [
    ['online', privacy.online],
    ['readReceipts', privacy.readReceipts],
    ['backupReminder', privacy.backupReminder],
    ['externalMedia', settings.externalMedia],
    ['sound', settings.sound],
    ['pushEnabled', settings.push.enabled],
    ['messages', settings.push.messages],
    ['calls', settings.push.calls],
    ['showCalls', settings.push.showCalls],
  ] as const)
    field(form, name).checked = value;
  form.querySelector<HTMLSelectElement>('select[name="discovery"]')!.value =
    pack.discovery;
  form
    .querySelectorAll<HTMLInputElement>('input[name="theme"]')
    .forEach((input) => {
      input.checked = input.value === settings.theme;
    });
}

function read(form: HTMLFormElement, base: SettingsPack): SettingsPack {
  const checked = (name: string) => field(form, name).checked;
  const theme =
    themes.find(
      (item) =>
        item.id ===
        form.querySelector<HTMLInputElement>('input[name="theme"]:checked')
          ?.value,
    )?.id ?? base.settings.theme;
  const discovery =
    discoveryOptions.find(
      ([value]) =>
        value ===
        form.querySelector<HTMLSelectElement>('select[name="discovery"]')
          ?.value,
    )?.[0] ?? base.discovery;
  return {
    settings: {
      version: 1,
      theme,
      sound: checked('sound'),
      externalMedia: checked('externalMedia'),
      push: {
        enabled: checked('pushEnabled'),
        messages: checked('messages'),
        calls: checked('calls'),
        showCalls: checked('showCalls'),
      },
    },
    privacy: {
      online: checked('online'),
      lastSeen: false,
      readReceipts: checked('readReceipts'),
      backupReminder: checked('backupReminder'),
    },
    discovery,
  };
}

function show(dialog: HTMLDialogElement, step: string): void {
  dialog.querySelectorAll<HTMLElement>('[data-wizard-step]').forEach((node) => {
    node.hidden = node.dataset['wizardStep'] !== step;
  });
  dialog.querySelector<HTMLElement>(`[data-wizard-step="${step}"] h2`)?.focus();
}

function showResult(dialog: HTMLDialogElement, problems: string[]): void {
  dialog.querySelector('[data-wizard-result]')!.textContent = problems.length
    ? 'Parte das configurações não foi aplicada. Ajuste o que faltou em Perfil.'
    : 'Pronto. Suas configurações foram salvas na conta.';
  const list = dialog.querySelector('[data-wizard-problems]')!;
  list.replaceChildren(
    ...problems.map((problem) => {
      const item = document.createElement('li');
      item.textContent = problem;
      return item;
    }),
  );
  show(dialog, 'result');
}

/**
 * Configurações iniciais. `confirm` runs inside the submit gesture, so the
 * browser can show the notification permission prompt; it returns the
 * problems to list. Closing without saving keeps every current setting.
 */
export function openSettingsWizard(input: {
  initial: SettingsPack;
  confirm: (pack: SettingsPack) => Promise<string[]>;
  signal: AbortSignal;
}): Promise<'saved' | 'skipped'> {
  const { initial, confirm, signal } = input;
  if (signal.aborted) return Promise.resolve('skipped');
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'settings-pack card';
    dialog.setAttribute('aria-label', 'Configurações iniciais');
    dialog.innerHTML = choiceStep + reviewStep + resultStep;
    dialog
      .querySelectorAll('h2')
      .forEach((heading) => heading.setAttribute('tabindex', '-1'));
    dialog.querySelector('[data-wizard-media]')!.textContent =
      externalMediaNotice;
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    let outcome: 'saved' | 'skipped' = 'skipped';
    let saving = false;
    const finish = () => {
      signal.removeEventListener('abort', finish);
      dialog.remove();
      resolve(outcome);
    };
    dialog.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const preset = target?.closest<HTMLElement>('[data-preset]');
      if (preset) {
        fill(form, presetPack(preset.dataset['preset'] as PresetId, initial));
        show(dialog, 'review');
      } else if (target?.closest('[data-wizard-back]')) show(dialog, 'choose');
      else if (target?.closest('[data-wizard-skip], [data-wizard-close]'))
        finish();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = true;
      // Called before any await: the permission prompt needs this gesture.
      confirm(read(form, initial))
        .then((problems) => {
          outcome = 'saved';
          showResult(dialog, problems);
        })
        .catch((error: unknown) => {
          saving = false;
          showResult(dialog, [
            error instanceof Error
              ? error.message
              : 'Não foi possível salvar as configurações.',
          ]);
        });
    });
    dialog.addEventListener('cancel', (event) => {
      if (saving && outcome === 'skipped') event.preventDefault();
      else finish();
    });
    signal.addEventListener('abort', finish, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error: unknown) {
      signal.removeEventListener('abort', finish);
      dialog.remove();
      reject(
        error instanceof Error
          ? error
          : new Error('Configurações iniciais indisponíveis.'),
      );
    }
  });
}
