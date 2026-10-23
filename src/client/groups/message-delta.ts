import { AccountError, object, uuid } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import { groupSnapshot, wire } from './message-index.ts';
import type { Snapshot } from './message-index.ts';
import type { GroupReadContext } from './reader.ts';

/** A warm read's snapshot, first change page and that page's packets, fetched
 * in one request instead of three. The server builds them from one finite cut
 * under one membership check. Nothing here is trusted on its own: the reader
 * consumes the parts exactly as if `group-message-changes` and
 * `group-message-objects` had answered, through the same validation, and the
 * final `group-message-confirm` still proves the cut before anything is
 * shown. Each part answers only the identical request, once. */
export class GroupDelta {
  readonly snapshot: Snapshot;
  private changes: { request: string; response: unknown } | null;
  private objects: { scope: string; ids: string; response: unknown } | null;
  private constructor(
    snapshot: Snapshot,
    from: number,
    raw: Record<string, unknown>,
  ) {
    this.snapshot = snapshot;
    const scope = wire(snapshot);
    this.changes = {
      request: canonical({ ...scope, from, after: from }),
      response: raw['changes'],
    };
    const objects = raw['objects'] === null ? null : object(raw['objects']);
    this.objects = objects && {
      scope: canonical(scope),
      ids: idSet(objects['ids']),
      response: objects['page'],
    };
  }
  /** The reader's transport: the matching requests are answered from this
   * response, everything else, a later page among them, reaches the server. */
  serve(api: AttachmentApi): AttachmentApi {
    return (operation, payload) => {
      const answer = this.answer(operation, payload);
      return answer === undefined
        ? api(operation, payload)
        : Promise.resolve(answer);
    };
  }
  private answer(operation: string, payload: Record<string, unknown>) {
    if (operation === 'group-message-changes' && this.changes) {
      if (canonical(payload) !== this.changes.request) return undefined;
      const { response } = this.changes;
      this.changes = null;
      return response;
    }
    if (operation === 'group-message-objects' && this.objects) {
      const { ids, ...scope } = payload;
      if (
        canonical(scope) !== this.objects.scope ||
        idSet(ids) !== this.objects.ids
      )
        return undefined;
      const { response } = this.objects;
      this.objects = null;
      return response;
    }
    return undefined;
  }
  /** One request for the group's changes since the confirmed revision `from`;
   * null when the server does not offer it, so the reader asks part by part. */
  static async read(
    c: Pick<GroupReadContext, 'api' | 'group' | 'authority'>,
    from: number,
  ): Promise<GroupDelta | null> {
    let raw: Record<string, unknown>;
    try {
      raw = object(
        await c.api('group-message-delta', {
          groupId: c.group.state.groupId,
          head: c.group.head,
          from,
        }),
      );
    } catch (error: unknown) {
      if (unavailable(error)) return null;
      throw error;
    }
    return new GroupDelta(groupSnapshot(c, raw['snapshot']), from, raw);
  }
}
/** A server from before this operation answers with its unknown-operation
 * error; any other failure is the read's own. */
function unavailable(error: unknown): boolean {
  return (
    error instanceof AccountError &&
    error.status === 404 &&
    error.message === 'Message operation unavailable.'
  );
}
function idSet(value: unknown): string {
  if (!Array.isArray(value) || value.length > 16)
    throw new Error('Invalid group delta.');
  return canonical([...new Set(value.map(uuid))].sort());
}
