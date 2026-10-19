import { object, uuid } from '../../shared/account/index.ts';

export interface DmMessageState {
  id: string;
  received: boolean;
  read: boolean;
}
export function dmMessageStates(value: unknown): DmMessageState[] {
  if (!Array.isArray(value) || value.length > 16)
    throw new Error('Invalid DM confirmations.');
  return value.map((item) => {
    const data = object(item);
    if (
      typeof data['received'] !== 'boolean' ||
      typeof data['read'] !== 'boolean' ||
      (data['read'] && !data['received'])
    )
      throw new Error('Invalid DM confirmations.');
    return {
      id: uuid(data['id']),
      received: data['received'],
      read: data['read'],
    };
  });
}
