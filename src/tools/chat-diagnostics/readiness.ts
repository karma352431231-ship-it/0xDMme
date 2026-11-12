import { handleDiagnosticRevision } from '../../shared/chat-sync-diagnostics/handle.ts';
import type { ClockBounds } from './clock.ts';
export function deliveryReadiness(input: {
  active: boolean;
  handleDelivery: {
    available: boolean;
    revision: number;
    paired: boolean;
    pairUnavailable: boolean;
    pairFingerprint: string | null;
  };
  clock: ClockBounds;
}) {
  const delivery = input.handleDelivery;
  if (!input.active)
    return { state: 'stopped', label: 'Capture ended · local report only' };
  if (!delivery.available)
    return {
      state: 'app-unavailable',
      label:
        'Handle delivery unavailable · update this app build before measuring',
    };
  if (delivery.revision !== handleDiagnosticRevision)
    return {
      state: 'incompatible',
      label: 'Incompatible app/meter revisions · update both before measuring',
    };
  if (delivery.pairUnavailable)
    return {
      state: 'pair-failed',
      label: 'Pairing failed · restart the capture',
    };
  if (!delivery.paired || !delivery.pairFingerprint)
    return {
      state: 'unpaired',
      label: 'Handle module ready · use the same pair(code) on both devices',
    };
  if (!input.clock.available)
    return {
      state: 'clock-pending',
      label:
        'Paired locally · waiting for server clock; server and native bridge must also be updated',
    };
  if (!input.clock.consistent)
    return {
      state: 'clock-inconsistent',
      label: 'Clock samples disagree · restart before measuring',
    };
  return {
    state: 'ready-local',
    label: `Ready locally · pair ${delivery.pairFingerprint?.slice(0, 8)} · confirm ready and same pair on BOTH devices before sending`,
  };
}
