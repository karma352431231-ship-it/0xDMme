/** Acesso tipado aos controles das telas descartáveis de ensaio. */
export function element<T extends HTMLElement>(
  id: string,
  kind: { new (): T },
): T {
  const value = document.getElementById(id);
  if (!(value instanceof kind)) throw new Error('Tela de ensaio incompleta.');
  return value;
}
