/** Typed access to controls on disposable probe screens. */
export function element<T extends HTMLElement>(
  id: string,
  kind: { new (): T },
): T {
  const value = document.getElementById(id);
  if (!(value instanceof kind)) throw new Error('Test screen incomplete.');
  return value;
}
