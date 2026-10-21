import { verifyHistory } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { recoveryKey, verifyRecoveryKey } from '../../shared/messages/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';

/** Authorize a new encryption destination, separately from historical decryption. */
export async function currentRecoveryKey(
  input: unknown,
  history: DirectoryEvent[],
  accountId: string,
): Promise<RecoveryKey> {
  const key = recoveryKey(input);
  const current = await verifyHistory(history, accountId);
  const signer = history[key.authorityRevision - 1];
  if (
    !current ||
    !signer ||
    key.accountId !== accountId ||
    key.epoch !== current.epoch ||
    !current.devices.some((device) => device.id === key.deviceId)
  )
    throw new Error(
      'Recovery key not authorized for the current account, epoch or device.',
    );
  return verifyRecoveryKey(key, signer);
}
