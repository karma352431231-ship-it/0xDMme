import { t } from '../../shared/i18n/index.ts';
import type { GroupMember } from '../../shared/groups/index.ts';
import { chatIcon } from '../chat-ui/index.ts';

/** Administrators first, then the longest-standing members. */
function successorOrder(a: GroupMember, b: GroupMember): number {
  if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
  return a.joined - b.joined;
}

/**
 * The owner picks who takes over before leaving (owner decision, 24/10/2026):
 * the chosen member becomes the owner immediately, without accepting. Resolves
 * with that account, or null when the dialog is closed. The dialog exists only
 * while the choice is open.
 */
export function chooseGroupSuccessor(input: {
  host: HTMLElement;
  owner: string;
  members: readonly GroupMember[];
  name: (account: string) => string;
}): Promise<string | null> {
  const dialog = document.createElement('dialog');
  dialog.className = 'group-dialog group-handover';
  dialog.setAttribute('aria-label', t('Choose the new owner'));
  const header = document.createElement('header'),
    heading = document.createElement('h2'),
    close = document.createElement('button'),
    hint = document.createElement('p'),
    list = document.createElement('ul');
  heading.textContent = t('Choose the new owner');
  close.type = 'button';
  close.className = 'group-close';
  close.setAttribute('aria-label', t('Close'));
  close.innerHTML = chatIcon('close');
  header.append(heading, close);
  hint.className = 'group-hint';
  hint.textContent = t(
    'They become the owner right away, without accepting. You leave the group and lose access to the remote vault.',
  );
  list.className = 'group-handover-list';
  dialog.append(header, hint, list);
  return new Promise((resolve) => {
    let chosen: string | null = null;
    for (const member of input.members
      .filter((m) => m.accountId !== input.owner)
      .toSorted(successorOrder)) {
      const item = document.createElement('li'),
        pick = document.createElement('button');
      pick.type = 'button';
      pick.textContent = input.name(member.accountId);
      if (member.role === 'admin') {
        const role = document.createElement('small');
        role.textContent = t('Administrator');
        pick.append(role);
      }
      pick.addEventListener('click', () => {
        chosen = member.accountId;
        dialog.close();
      });
      item.append(pick);
      list.append(item);
    }
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(chosen);
    });
    input.host.append(dialog);
    dialog.showModal();
  });
}
