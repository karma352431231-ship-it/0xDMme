// Minimal DOM surface for the real community UI; layout/media use browser smoke.
export class CommunityNode extends EventTarget {
  readonly tag: string;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: CommunityNode[] = [];
  parent: CommunityNode | null = null;
  className = '';
  value = '';
  disabled = false;
  hidden = false;
  innerHTML = '';
  replacements = 0;
  private text = '';
  constructor(tag = 'div') {
    super();
    this.tag = tag;
  }
  classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(' '), ...names]),
      ].join(' ');
    },
  };
  get textContent(): string {
    return this.text + this.children.map((node) => node.textContent).join('');
  }
  set textContent(value: string) {
    this.text = value;
    this.replaceChildren();
  }
  get parentElement(): CommunityNode | null {
    return this.parent;
  }
  get lastElementChild(): CommunityNode | null {
    return this.children.at(-1) ?? null;
  }
  get selectedOptions(): CommunityNode[] {
    return this.children.filter((node) => node.value === this.value);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  append(...nodes: CommunityNode[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  prepend(node: CommunityNode): void {
    node.remove();
    node.parent = this;
    this.children.unshift(node);
  }
  after(node: CommunityNode): void {
    if (!this.parent) return;
    node.remove();
    const index = this.parent.children.indexOf(this);
    node.parent = this.parent;
    this.parent.children.splice(index + 1, 0, node);
  }
  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    this.parent.children.splice(index, 1);
    this.parent = null;
  }
  replaceChildren(...nodes: CommunityNode[]): void {
    this.replacements++;
    for (const node of this.children) node.parent = null;
    this.children = [];
    this.append(...nodes);
  }
  contains(node: CommunityNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  private matches(selector: string): boolean {
    if (selector.startsWith('.'))
      return this.className.split(' ').includes(selector.slice(1));
    return selector === this.tag;
  }
  querySelectorAll(selector: string): CommunityNode[] {
    const selectors = selector.split(',');
    return this.children.flatMap((node) => [
      ...(selectors.some((selector) => node.matches(selector)) ? [node] : []),
      ...node.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string): CommunityNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  click(): void {
    if (!this.disabled) this.dispatchEvent(new Event('click'));
  }
}

export function communityDocument() {
  return Object.assign(new CommunityNode('#document'), {
    visibilityState: 'visible',
    createElement: (tag: string) => new CommunityNode(tag),
    createElementNS: (_namespace: string, tag: string) =>
      new CommunityNode(tag),
    createTextNode: (text: string) => {
      const node = new CommunityNode('#text');
      node.textContent = text;
      return node;
    },
  });
}
