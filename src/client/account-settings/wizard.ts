import { t, translatedError } from '../../shared/i18n/index.ts';
import { themes } from '../appearance/index.ts';
import { externalMediaNotice } from '../external-media/index.ts';
import { presetPack, presets } from './record.ts';
import type { PresetId, SettingsPack } from './record.ts';
import {
  languageSelect,
  saveLanguageChoice,
  languageFailure,
} from '../language/index.ts';
import { isAppLanguage } from '../../shared/i18n/index.ts';

const discoveryOptions = [
  ['invite', t('Somente com meu link de convite')],
  ['wallet', t('Por wallet exata ou convite')],
  ['contacts', t('Somente contatos já aprovados')],
] as const;

// Static authored markup; values are set through DOM properties afterwards.
const choiceStep = t('html.12c90e74741c', [
  presets
    .map(
      (preset) =>
        `<button type="button" class="settings-pack-preset" data-preset="${preset.id}"><strong>${preset.label}</strong><small>${preset.hint}</small></button>`,
    )
    .join(''),
]);

const reviewStep = t('html.0930613867e2', [
  themes
    .map(
      (theme) =>
        `<label><input type="radio" name="theme" value="${theme.id}"> ${theme.label}</label>`,
    )
    .join(''),
  discoveryOptions
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join(''),
]);

const resultStep = t('html.91580e468fc5');

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
    ? t(
        'Parte das configurações não foi aplicada. Ajuste o que faltou em Perfil.',
      )
    : t('Pronto. Suas configurações foram salvas na conta.');
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
  saveLanguage?: (language: 'en' | 'zh-CN') => Promise<void>;
  languageBlocked?: () => string | null;
  signal: AbortSignal;
}): Promise<'saved' | 'skipped'> {
  const { initial, confirm, signal } = input;
  if (signal.aborted) return Promise.resolve('skipped');
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'settings-pack card';
    dialog.setAttribute('aria-label', t('Configurações iniciais'));
    dialog.innerHTML = choiceStep + reviewStep + resultStep;
    const languageLabel = document.createElement('label');
    languageLabel.className = 'settings-pack-language';
    languageLabel.textContent = t('Idioma do aplicativo');
    const language = languageSelect();
    languageLabel.append(language);
    dialog
      .querySelector('[data-wizard-step="choose"] h2')!
      .after(languageLabel);
    language.addEventListener('change', () => {
      if (!isAppLanguage(language.value)) return;
      const reason = input.languageBlocked?.();
      if (reason) {
        showResult(dialog, [reason]);
        return;
      }
      language.disabled = true;
      dialog.inert = true;
      saving = true;
      const choice = language.value;
      void saveLanguageChoice({
        language: choice,
        save: input.saveLanguage ?? (() => Promise.resolve()),
        blocked: input.languageBlocked ?? (() => null),
        signal,
      })
        .then(() => location.reload())
        .catch((error: unknown) => {
          if (signal.aborted) return;
          saving = false;
          dialog.inert = false;
          language.disabled = false;
          dialog.querySelector('[data-wizard-result]')!.textContent =
            languageFailure(error);
          show(dialog, 'result');
        });
    });
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
              ? translatedError(error.message)
              : t('Não foi possível salvar as configurações.'),
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
