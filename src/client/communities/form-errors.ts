/**
 * Points at a required part of a form that is missing (16/10/2026): a red
 * outline on the control, a red line right under it and focus on it. Editing
 * the control clears the mark. The text arrives already translated.
 */
export function markMissing(control: HTMLElement, text: string): void {
  const anchor = control.closest('label') ?? control;
  let note = anchor.nextElementSibling;
  if (!note?.classList.contains('form-missing')) {
    note = document.createElement('p');
    note.className = 'form-missing';
    note.setAttribute('role', 'alert');
    anchor.after(note);
  }
  note.textContent = text;
  control.setAttribute('aria-invalid', 'true');
  const clear = (): void => {
    control.removeAttribute('aria-invalid');
    note.remove();
  };
  control.addEventListener('input', clear, { once: true });
  control.addEventListener('click', clear, { once: true });
  control.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (control.tabIndex >= 0 || control.matches('input, textarea'))
    control.focus({ preventScroll: true });
}
