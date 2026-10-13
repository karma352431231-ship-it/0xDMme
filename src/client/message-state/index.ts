import { staticText } from '../../shared/i18n/index.ts';

// These legacy values are also used for filtering and verified-window decisions.
export const messageStates = {
  suspended: 'Suspensa',
  received: 'Recebida e preservada',
  accepted: 'Aceita · entrega por aparelho pendente',
  history: 'Histórico local',
  offline: 'Cópia local offline · estado remoto ainda não conferido',
  profileOffline: 'Perfil recebido · cópia local offline',
} as const;

/** Translate only at presentation; message rules never depend on a locale. */
export function messageStateText(state: string): string {
  return staticText(state);
}
