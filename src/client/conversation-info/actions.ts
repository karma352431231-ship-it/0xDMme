import { menuIcon } from '../menu-icons/index.ts';
import type { MenuIconName } from '../menu-icons/index.ts';

export interface InfoAction {
  id: string;
  label: string;
  icon: MenuIconName;
  perform: () => void;
}

/** The round shortcuts under a contact's or group's name (call, search…). */
export function infoActionBar(actions: readonly InfoAction[]): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'info-actions';
  for (const action of actions) {
    const button = document.createElement('button'),
      label = document.createElement('span');
    button.type = 'button';
    button.dataset['infoAction'] = action.id;
    label.textContent = action.label;
    button.append(menuIcon(action.icon), label);
    button.addEventListener('click', action.perform);
    bar.append(button);
  }
  bar.hidden = !actions.length;
  return bar;
}

/** A full-width row that opens another screen or runs one action. */
export function infoRow(input: {
  label: string;
  icon: MenuIconName;
  detail?: string;
  /** A short value at the end of the row, such as a count. */
  end?: string;
  danger?: boolean;
  perform: () => void;
}): HTMLButtonElement {
  const row = document.createElement('button'),
    copy = document.createElement('span'),
    label = document.createElement('span');
  row.type = 'button';
  row.className = input.danger ? 'info-row info-row-danger' : 'info-row';
  copy.className = 'info-row-copy';
  label.textContent = input.label;
  copy.append(label);
  if (input.detail) {
    const detail = document.createElement('small');
    detail.textContent = input.detail;
    copy.append(detail);
  }
  row.append(menuIcon(input.icon), copy);
  if (input.end) {
    const end = document.createElement('span');
    end.className = 'info-row-end';
    end.textContent = input.end;
    row.append(end);
  }
  row.addEventListener('click', input.perform);
  return row;
}

/** A header name acting as a button: click, Enter or Space opens the info. */
export function bindInfoTrigger(
  trigger: HTMLElement | null,
  open: () => void,
): void {
  trigger?.addEventListener('click', open);
  trigger?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
}
