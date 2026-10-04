import { object } from '../../shared/account/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import type { GroupState } from './governance.ts';
export function groupAttachmentApi(
  group: GroupState,
  api: AttachmentApi,
): AttachmentApi {
  const scope = { groupId: group.state.groupId, head: group.head };
  return (op, d) => {
    const data = object(d);
    if (op === 'attachment-reserve')
      return api('group-attachment-reserve', {
        ...scope,
        message: data['message'],
        refs: data['refs'],
      });
    if (op === 'attachment-part')
      return api('group-attachment-part', {
        ...scope,
        id: data['id'],
        index: data['index'],
        ciphertext: data['ciphertext'],
      });
    if (op === 'attachment-finish')
      return api('group-attachment-finish', { ...scope, id: data['id'] });
    if (op === 'attachment-get')
      return api('group-attachment-get', {
        ...scope,
        message: data['message'],
        id: data['id'],
        index: data['index'],
      });
    throw new Error('Operação de mídia de grupo inválida.');
  };
}
