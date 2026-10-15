import { CommunityNode } from './community-dom.ts';

/** DOM operations needed by history projection; no layout or transport simulation. */
export class ChatNode extends CommunityNode {
  scrollTop = 0;
  scrollHeight = 1200;
  clientHeight = 400;
  get parentNode(): CommunityNode | null {
    return this.parent;
  }
  get childNodes(): CommunityNode[] {
    return this.children;
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get firstChild(): CommunityNode | null {
    return this.children[0] ?? null;
  }
  get nextSibling(): CommunityNode | null {
    if (!this.parent) return null;
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
  getClientRects(): object[] {
    return this.hidden ? [] : [{}];
  }
  override append(...nodes: (CommunityNode | string)[]): void {
    super.append(
      ...nodes.map((node) => {
        if (typeof node !== 'string') return node;
        const text = new ChatNode('#text');
        text.textContent = node;
        return text;
      }),
    );
  }
  override prepend(...nodes: (CommunityNode | string)[]): void {
    super.prepend(
      ...nodes.map((node) => {
        if (typeof node !== 'string') return node;
        const text = new ChatNode('#text');
        text.textContent = node;
        return text;
      }),
    );
  }
  insertBefore(node: CommunityNode, before: CommunityNode | null): void {
    if (node === before) return;
    node.remove();
    node.parent = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, node);
  }
  replaceWith(node: CommunityNode): void {
    (this.parent as ChatNode).insertBefore(node, this);
    this.remove();
  }
  isEqualNode(node: CommunityNode): boolean {
    return (
      this.textContent === node.textContent &&
      JSON.stringify([...this.attributes]) ===
        JSON.stringify([...node.attributes]) &&
      JSON.stringify(this.children.map((child) => [...child.attributes])) ===
        JSON.stringify(node.children.map((child) => [...child.attributes]))
    );
  }
  override querySelectorAll(selector: string): CommunityNode[] {
    if (selector !== '[data-message]') return super.querySelectorAll(selector);
    return this.children.flatMap((node) => [
      ...('message' in node.dataset ? [node] : []),
      ...node.querySelectorAll(selector),
    ]);
  }
}
