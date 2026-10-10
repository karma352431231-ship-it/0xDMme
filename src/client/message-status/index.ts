export type DeliveryState = 'accepted' | 'received';
export function messageChecks(input: {
  own: boolean;
  delivery?: DeliveryState;
  read: boolean;
}): { text: string; label: string; color: 'gray' | 'blue' } | null {
  if (!input.own || !input.delivery) return null;
  if (input.read)
    return { text: '✓✓', label: 'Lida pelo destinatário', color: 'blue' };
  if (input.delivery === 'received')
    return {
      text: '✓✓',
      label: 'Recebida por um aparelho do destinatário',
      color: 'gray',
    };
  return {
    text: '✓',
    label:
      'Aceita pelo servidor; recebimento do destinatário ainda não confirmado',
    color: 'gray',
  };
}

const svgNs = 'http://www.w3.org/2000/svg';
/**
 * Drawn ticks, small enough to sit beside the time: one when the server
 * accepted, two when a recipient device received, colored when read.
 */
export function checksIcon(checks: {
  text: string;
  label: string;
  color: 'gray' | 'blue';
}): SVGSVGElement {
  const double = [...checks.text].length > 1;
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', double ? '0 0 19 12' : '0 0 13 12');
  svg.setAttribute('class', `message-checks ${checks.color}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', checks.label);
  const title = document.createElementNS(svgNs, 'title');
  title.textContent = checks.label;
  svg.append(title);
  // Two whole ticks side by side, the second clearly to the right.
  for (const d of double
    ? ['M1.5 6.2 5 9.7 11.5 2.3', 'M9 8.2 10.5 9.7 17.5 2.3']
    : ['M1.5 6.2 5 9.7 11.5 2.3']) {
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
