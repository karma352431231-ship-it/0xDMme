import { AccountError } from '../../shared/account/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

/** In-flight metadata uses memory; durable reservations remain charged to storage. */
export async function withUploadAdmission<T>(
  work: () => Promise<T>,
): Promise<T> {
  const release = reserveOperationMemory(1_048_576);
  if (!release) throw new AccountError(503, 'Transfers busy. Resume later.');
  try {
    return await work();
  } finally {
    release();
  }
}
