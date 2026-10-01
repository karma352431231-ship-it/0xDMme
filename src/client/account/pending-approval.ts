import { walletApprovalRequest } from './wallet-return.ts';
import type { WalletApprovalRequest } from './wallet-return.ts';

const key = '0xdmme:pending-wallet-approval:v1';
const lifetime = 300_000;
interface PendingApproval {
  request: WalletApprovalRequest;
  createdAt: number;
  expiresAt: number;
}

function deadline(createdAt: unknown, expiresAt: unknown) {
  if (
    typeof createdAt !== 'number' ||
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt !== createdAt + lifetime
  )
    throw new Error('Prazo inválido.');
  return { createdAt, expiresAt };
}

function decoded(value: string): PendingApproval {
  if (value.length > 512) throw new Error('Registro excedido.');
  const data: unknown = JSON.parse(value);
  if (
    typeof data !== 'object' ||
    data === null ||
    !('request' in data) ||
    !('createdAt' in data) ||
    !('expiresAt' in data) ||
    Object.keys(data).length !== 3
  )
    throw new Error('Registro inválido.');
  return {
    request: walletApprovalRequest(data.request),
    ...deadline(data.createdAt, data.expiresAt),
  };
}

/** Tab-scoped handoff only. It never restores a login or extends server expiry. */
export function createPendingApproval(expired: () => void) {
  let timer: number | undefined;
  let available = true;
  function remove(): void {
    window.clearTimeout(timer);
    timer = undefined;
    try {
      sessionStorage.removeItem(key);
    } catch {
      available = false;
    }
  }
  function read(): PendingApproval | null {
    let value: string | null;
    try {
      value = sessionStorage.getItem(key);
    } catch {
      available = false;
      return null;
    }
    if (value === null) return null;
    try {
      const record = decoded(value);
      const now = Date.now();
      if (now < record.createdAt || now >= record.expiresAt) {
        remove();
        return null;
      }
      return record;
    } catch {
      remove();
      return null;
    }
  }
  function schedule(record: PendingApproval): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        timer = undefined;
        check();
      },
      Math.max(0, record.expiresAt - Date.now()),
    );
  }
  function check(): void {
    const record = read();
    if (record) {
      schedule(record);
      return;
    }
    expired();
  }
  const resumed = () => {
    if (timer !== undefined) check();
  };
  window.addEventListener('pageshow', resumed);
  window.addEventListener('focus', resumed);
  document.addEventListener('visibilitychange', resumed);
  return {
    remember(request: WalletApprovalRequest): void {
      const previous = read();
      const createdAt =
        previous?.request.ticket === request.ticket
          ? previous.createdAt
          : Date.now();
      const record = { request, createdAt, expiresAt: createdAt + lifetime };
      remove();
      try {
        sessionStorage.setItem(key, JSON.stringify(record));
        available = true;
        schedule(record);
      } catch {
        available = false;
      }
    },
    restore(): WalletApprovalRequest | null {
      const record = read();
      if (!record) return null;
      schedule(record);
      return record.request;
    },
    clear(ticket?: string): void {
      if (ticket !== undefined && read()?.request.ticket !== ticket) return;
      remove();
    },
    availability: () => available,
    close(): void {
      window.clearTimeout(timer);
      window.removeEventListener('pageshow', resumed);
      window.removeEventListener('focus', resumed);
      document.removeEventListener('visibilitychange', resumed);
    },
  };
}
