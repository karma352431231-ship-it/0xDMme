import { t } from '../../shared/i18n/index.ts';
import { settingsGlyph } from './icons.ts';
import type { SettingsGlyph } from './icons.ts';
export { settingsGlyph, settingsGlyphElement } from './icons.ts';
export type { SettingsGlyph } from './icons.ts';

/**
 * Presentation for settings screens: compact rows with an icon, a label and a
 * control, explanations in a tip shown on hover, keyboard focus or a tap on
 * the info button, and a save bar shown only while a draft differs. Each
 * feature keeps its own state and behavior; these builders return static
 * authored markup, so callers pass translated text, never account data.
 */

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escape(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => escapes[character]!);
}

let tipCount = 0;
function tipId(): string {
  tipCount += 1;
  return `set-tip-${tipCount}`;
}

/** The info button and its tip; `subject` names what the tip explains. */
export function settingTip(subject: string, text: string): string {
  const id = tipId();
  return `<button type="button" class="set-info" data-set-info aria-label="${escape(t('About {0}', [subject]))}" aria-describedby="${id}" aria-expanded="false">${settingsGlyph('info')}</button><span class="set-tip" id="${id}" role="tooltip">${escape(text)}</span>`;
}

export interface SettingRow {
  icon: SettingsGlyph;
  label: string;
  /** Hover or tap explanation; keeps the row to one line. */
  tip?: string;
  /** A short second line, such as an address or a state. */
  meta?: string;
  /** Attributes for the second line when the feature fills it later. */
  metaAttributes?: string;
  /** The id of the control the label names (switch, radio). */
  for?: string;
  /** Authored control markup on the right: a switch, button or value. */
  control?: string;
  /** Extra classes and attributes for the row element. */
  attributes?: string;
}

/** One line of a settings group. */
export function settingRow(row: SettingRow): string {
  const meta =
    row.meta === undefined && row.metaAttributes === undefined
      ? ''
      : `<span class="set-meta"${row.metaAttributes ? ` ${row.metaAttributes}` : ''}>${escape(row.meta ?? '')}</span>`;
  const text = `<span class="set-tile">${settingsGlyph(row.icon)}</span><span class="set-text"><span class="set-label">${escape(row.label)}</span>${meta}</span>`;
  const main = row.for
    ? `<label class="set-main" for="${row.for}">${text}</label>`
    : `<span class="set-main">${text}</span>`;
  return `<div class="set-row"${row.attributes ? ` ${row.attributes}` : ''}>${main}${row.tip ? settingTip(row.label, row.tip) : ''}<span class="set-fill"></span>${row.control ?? ''}</div>`;
}

/** A native checkbox drawn as a switch; feature code reads `checked`. */
export function settingSwitch(input: {
  id: string;
  attributes: string;
  checked?: boolean;
}): string {
  return `<input type="checkbox" role="switch" class="set-switch" id="${input.id}" ${input.attributes}${input.checked === false ? '' : ' checked'}>`;
}

/** A titled group of rows; `aside` sits at the end of the title line. */
export function settingGroup(input: {
  title: string;
  rows: string;
  tip?: string;
  aside?: string;
  attributes?: string;
}): string {
  return `<section class="set-group"${input.attributes ? ` ${input.attributes}` : ''}><h3 class="set-group-title"><span>${escape(input.title)}</span>${input.tip ? settingTip(input.title, input.tip) : ''}<span class="set-fill"></span>${input.aside ?? ''}</h3><div class="set-card">${input.rows}</div></section>`;
}

/** Hidden until the owning feature reports a draft. The save button submits
 * the surrounding form; discard is a plain button the feature handles. */
export function settingSaveBar(attributes: string): string {
  return `<div class="set-savebar" ${attributes} hidden><span class="set-dot" aria-hidden="true"></span><span class="set-savebar-text" role="status">${escape(t('Unsaved changes'))}</span><button type="button" class="set-btn set-quiet" data-set-discard>${escape(t('Discard'))}</button><button type="submit" class="set-btn set-primary">${escape(t('Save changes'))}</button></div>`;
}

/**
 * Tap support for tips: hover and focus are CSS, but touch screens have no
 * hover and Safari does not focus buttons on tap. One delegated listener per
 * document opens the tapped tip and closes it on the next tap or Escape.
 */
const bound = new WeakSet<Document>();
export function bindSettingTips(root: Document): void {
  if (bound.has(root)) return;
  bound.add(root);
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('[data-set-info]');
    const open = root.querySelector<HTMLButtonElement>(
      '[data-set-info][aria-expanded="true"]',
    );
    if (open && open !== button) open.setAttribute('aria-expanded', 'false');
    if (!button) return;
    event.preventDefault();
    button.setAttribute(
      'aria-expanded',
      button.getAttribute('aria-expanded') === 'true' ? 'false' : 'true',
    );
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    root
      .querySelector('[data-set-info][aria-expanded="true"]')
      ?.setAttribute('aria-expanded', 'false');
  });
}
