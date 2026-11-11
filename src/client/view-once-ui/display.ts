import { installedApplication } from '../application-origin/index.ts';

export interface ProtectedDisplay {
  download?(input: {
    id: string;
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
  }): Promise<void>;
  begin(input: { id: string; mime: string; bytes: number }): Promise<void>;
  append(input: { id: string; offset: number; bytes: string }): Promise<void>;
  show(input: { id: string; text: string }): Promise<void>;
  presented?(input: { id: string; signal: AbortSignal }): Promise<{
    state: 'native-draw' | 'video-frame' | 'unavailable' | 'timeout';
    elapsedMs: number;
  }>;
  active(input: { id: string }): Promise<boolean>;
  close(input: { id: string }): Promise<void>;
}
let display: ProtectedDisplay | null = null;

/** Only the installed entry can supply the native protected display. */
export function installProtectedDisplay(port: ProtectedDisplay): void {
  if (!installedApplication() || display)
    throw new Error('Protected display is unavailable.');
  display = port;
}
export function protectedDisplay(): ProtectedDisplay | null {
  return installedApplication() ? display : null;
}
