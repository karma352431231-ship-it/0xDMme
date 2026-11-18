/**
 * Whether this page runs inside the installed iPhone or Android app. The
 * Capacitor bridge defines this global before the app's scripts load; browsers
 * never have it, so the web build keeps its own behavior.
 */
export function insideNativeApp(): boolean {
  const bridge = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}
