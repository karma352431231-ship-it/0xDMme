/** In-memory presentation for this app visit. No plaintext goes into browser storage. */
export class NavigationVisits {
  private session: string | undefined;
  setSession(session: { csrf: string } | null): void {
    if (this.session !== session?.csrf) this.clear();
    this.session = session?.csrf;
  }
  private contacts: HTMLElement | null = null;
  private readonly positions = new Map<
    string,
    { workspace: number; document: number }
  >();
  save(page: string, content: HTMLElement, workspace: HTMLElement): void {
    // Feed/filter routes own their anchored position; other feature pages
    // retain their normal explicit navigation behavior.
    if (!['contatos', 'conversas'].includes(page)) return;
    this.positions.set(page, {
      workspace: workspace.scrollTop,
      document: document.scrollingElement?.scrollTop ?? 0,
    });
    if (page === 'contatos')
      this.contacts = content.querySelector<HTMLElement>(
        '[data-contacts-container]',
      );
  }
  restoreContacts(content: HTMLElement): void {
    if (!this.contacts) return;
    content
      .querySelector('[data-contacts-container]')
      ?.replaceWith(this.contacts);
    this.contacts = null;
  }
  restorePosition(page: string, workspace: HTMLElement): void {
    const saved = this.positions.get(page);
    workspace.scrollTop = saved?.workspace ?? 0;
    if (document.scrollingElement)
      document.scrollingElement.scrollTop = saved?.document ?? 0;
  }
  clear(): void {
    this.contacts = null;
    this.positions.clear();
  }
}
