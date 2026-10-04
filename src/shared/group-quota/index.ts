import { AccountError } from '../account/index.ts';

export const groupQuota = 1_000_000_000;
export const groupMediaQuota = 750_000_000;
export const groupTextQuota = 250_000_000;
export const groupControlMargin = 1_000_000;
export const groupContentQuota = groupTextQuota - groupControlMargin;
export const groupMediaWarning = (groupMediaQuota * 90) / 100;
export const groupMediaTarget = (groupMediaQuota * 70) / 100;
interface GroupTierInput {
  balance: bigint;
  decimals: number;
  existingGroups: number;
}
export const groupCreationMinute = 60_000;
export const groupCreationHour = 3_600_000;
export const groupCreationsPerHour = 10;

function assertCreationWindow(input: {
  now: number;
  createdAt: readonly number[];
}): void {
  if (!Number.isSafeInteger(input.now) || input.now < 0)
    throw new AccountError(400, 'Horário de admissão inválido.');
  if (input.createdAt.length > groupCreationsPerHour)
    throw new AccountError(400, 'Janela de criação inválida.');
  for (const time of input.createdAt)
    if (!Number.isSafeInteger(time) || time < 0 || time > input.now)
      throw new AccountError(400, 'Registro de criação inválido.');
}

/** The store supplies at most ten successful creations from the current hour, under its account lock. */
export function groupCreationRetryAt(input: {
  now: number;
  createdAt: readonly number[];
}): number {
  assertCreationWindow(input);
  const recent = input.createdAt
    .filter((time) => time > input.now - groupCreationHour)
    .toSorted((a, b) => a - b);
  const minute = (recent.at(-1) ?? -groupCreationMinute) + groupCreationMinute;
  const hour =
    recent.length === groupCreationsPerHour
      ? (recent[0] ?? 0) + groupCreationHour
      : input.now;
  return Math.max(input.now, minute, hour);
}

function assertTierInput(input: GroupTierInput): void {
  if (
    typeof input.balance !== 'bigint' ||
    input.balance < 0n ||
    !Number.isInteger(input.decimals) ||
    input.decimals < 0 ||
    input.decimals > 255 ||
    !Number.isSafeInteger(input.existingGroups) ||
    input.existingGroups < 0
  )
    throw new AccountError(
      400,
      'Saldo, decimais ou contagem de grupos inválidos.',
    );
}

/** Approved tier only. RPC proof, ownership, concurrency and capacity are separate contracts. */
export function groupCreationTier(input: GroupTierInput): {
  limit: number | null;
  available: number | null;
  canCreate: boolean;
} {
  assertTierInput(input);
  const unit = 10n ** BigInt(input.decimals);
  const limit =
    input.balance >= 100_000n * unit
      ? null
      : input.balance >= 50_000n * unit
        ? 10
        : input.balance >= 10_000n * unit
          ? 2
          : 0;
  const available =
    limit === null ? null : Math.max(0, limit - input.existingGroups);
  return { limit, available, canCreate: available === null || available > 0 };
}

/** Exact bytes only; no rounding or empty-group preallocation. */
export function assertGroupQuota(input: {
  mediaBytes: number;
  textBytes: number;
}): void {
  for (const bytes of [input.mediaBytes, input.textBytes])
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new AccountError(400, 'Contabilização do cofre de grupo inválida.');
  if (input.mediaBytes > groupMediaQuota || input.textBytes > groupTextQuota)
    throw new AccountError(413, 'Cofre de grupo cheio nesta categoria.');
}
