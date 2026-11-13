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
    !!control.closest('[data-message-form], [data-group-compose]') ||
    // Showing a photo or playing a video only presents media; its loading has
    // its own queue. Disabling them dimmed every image while any operation,
    // such as a deletion, ran (owner, 13/11/2026).
    !!control.closest('.chat-attachment-preview, .chat-attachment-video') ||
    control.matches(
      '[data-chat-back], [data-conversation], [data-draft-action], [data-message-text], [data-group-text]',
    )
  );
}
