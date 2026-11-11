/** Independent draft/presentation controls do not need the crypto engine.
 * Other mutations keep their existing exclusive run/disabling contract. */
export function applyMessageAvailability(
  hosts: readonly (HTMLElement | null)[],
  busy: boolean,
): void {
  for (const host of hosts) {
    if (!host) continue;
    for (const control of host.querySelectorAll<HTMLInputElement>(
      'button,input,select,textarea',
    )) {
      if (localControl(control)) continue;
      control.disabled = busy;
    }
  }
}
function localControl(control: HTMLElement): boolean {
  return (
    !!control.closest('[data-message-form]') ||
    control.matches(
      '[data-chat-back], [data-conversation], [data-draft-action], [data-message-text], [data-group-text]',
    )
  );
}
