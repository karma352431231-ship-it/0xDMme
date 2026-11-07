import { observeProductBlobs } from './native-product-blobs.ts';
import { node, until, click, page } from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

function selectArchive(blob: Blob): void {
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], 'native-synthetic.0xdm'));
  const input = node<HTMLInputElement>('[data-backup-file]');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Exercises the actual encrypted archive and import, without claiming OS saving. */
async function roundtrip({ signal }: NativeActionInput): Promise<string> {
  await page('cofre', '[data-backup-save]', signal);
  await until(
    () =>
      node('[data-vault-quota]').textContent?.includes('disponíveis') === true,
    signal,
    'The authenticated vault usage',
  );
  const observed = observeProductBlobs(16 * 1024 * 1024);
  try {
    click('[data-backup-save]');
    await until(
      () => !node<HTMLElement>('[data-backup-download]').hidden,
      signal,
      'The actual completed encrypted archive',
    );
    if (
      !node('[data-backup-status]').textContent?.startsWith('Backup preparado.')
    )
      throw new Error('The generated archive was incomplete.');
    const url = node<HTMLAnchorElement>('[data-backup-download]').href;
    const blob = observed.read(url);
    if (!blob || blob.size < 100)
      throw new Error('The product archive Blob is unavailable.');
    selectArchive(blob);
    await until(
      () =>
        node('[data-backup-status]').textContent?.startsWith(
          'Arquivo íntegro e completo.',
        ) === true && !node<HTMLButtonElement>('[data-backup-save]').disabled,
      signal,
      'The authenticated complete archive import',
    );
    selectArchive(blob.slice(0, blob.size - 1));
    await until(
      () => {
        const status = node('[data-backup-status]').textContent ?? '';
        return (
          !node<HTMLButtonElement>('[data-backup-save]').disabled &&
          status.length > 0 &&
          !status.startsWith('Validando') &&
          !status.startsWith('Arquivo íntegro')
        );
      },
      signal,
      'The rejected truncated archive',
    );
    if (!node<HTMLButtonElement>('[data-backup-clean]').disabled)
      throw new Error('An invalid archive enabled destructive cleanup.');
    return 'Actual encrypted archive generated, completely imported and truncation rejected with cleanup disabled. OS saving remains separate.';
  } finally {
    observed.dispose();
    node<HTMLInputElement>('[data-backup-file]').value = '';
  }
}

export const vaultActions: ReadonlyMap<string, NativeAction> = new Map([
  ['backup-roundtrip', roundtrip],
]);
