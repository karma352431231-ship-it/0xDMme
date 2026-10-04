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
