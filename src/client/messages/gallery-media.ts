import { attachmentContent } from '../../shared/attachments/index.ts';
import { downloadAttachment } from '../attachments/index.ts';
import { historyWait, timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import { withSigner } from '../vault-authority/index.ts';
import type {
  SigningAuthority,
  VaultAccess,
} from '../vault-authority/index.ts';
import { localLocator } from '../vault-storage/index.ts';
import { indexedPacket } from './history.ts';
import { syncMessageApi } from './sync-transport.ts';
import type { MessageView } from './message-view.ts';

export async function readPrivateGalleryMedia(input: {
  access: VaultAccess;
  view: MessageView;
  thumbnail: boolean;
  signal: AbortSignal;
  guard: () => void;
  diagnostic: LoadTrace | undefined;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { access, view, thumbnail, signal, guard, diagnostic } = input;
  guard();
  const download = (
    account: string,
    network: Awaited<ReturnType<typeof authorize>> | null,
  ) => {
    const content = attachmentContent(JSON.parse(view.text) as unknown);
    const file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Thumbnail missing.');
    return downloadAttachment({
      account,
      message: view.id,
      file,
      thumbnail,
      image: thumbnail || content.image,
      api: network?.api ?? null,
      snapshot: network?.snapshot,
      guard,
      diagnostic,
      signal,
      transient: true,
    });
  };
  if (!networkAvailable()) {
    const locator = await localLocator();
    if (!locator) throw new Error('Local copy not authorized.');
    await access.withLocalVault(locator, () => {
      guard();
      return Promise.resolve();
    });
    return download(locator.accountId, null);
  }
  const authorization = await authorize(input);
  const bytes = await download(authorization.account, authorization);
  try {
    await timedLoad(diagnostic, 'confirm', () =>
      authorization.api('confirm', { snapshot: authorization.snapshot }),
    );
    guard();
    return bytes;
  } catch (error: unknown) {
    bytes.fill(0);
    throw error;
  }
}

async function authorize(input: Parameters<typeof readPrivateGalleryMedia>[0]) {
  const { access, view, signal, guard, diagnostic } = input;
  const admitted = historyWait(diagnostic, 'vault');
  const request = (
    authority: SigningAuthority,
    operation: string,
    data: Record<string, unknown>,
  ) => syncMessageApi(authority, operation, data, { signal, guard });
  const verified = await timedLoad(diagnostic, 'permissions', () =>
    withSigner(access, async (authority) => {
      admitted();
      const snapshot = await request(authority, 'snapshot', {});
      await indexedPacket(
        await request(authority, 'object', { id: view.id, snapshot }),
        view,
      );
      return { account: authority.session.accountId, snapshot };
    }),
  );
  const api = (operation: string, data: Record<string, unknown>) =>
    withSigner(access, (authority) => request(authority, operation, data));
  return { ...verified, api };
}
