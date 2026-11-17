/**
 * What kind of device this is, read from what the browser already exposes.
 * Nothing is fetched: the user agent, touch support, Chromium's model hint and
 * the native app bridge. Safari never reveals the iPhone or iPad model.
 */
export const deviceKinds = [
  'mac',
  'windows',
  'linux',
  'chromeos',
  'iphone',
  'ipad',
  'android-phone',
  'android-tablet',
  'unknown',
] as const;
export type DeviceKind = (typeof deviceKinds)[number];

export const deviceClients = [
  'app',
  'chrome',
  'safari',
  'firefox',
  'edge',
  'opera',
  'brave',
  'browser',
] as const;
export type DeviceClient = (typeof deviceClients)[number];

export interface DeviceDescription {
  kind: DeviceKind;
  /** A model name when the platform reveals one, such as "Pixel 9". */
  model: string | null;
  client: DeviceClient;
}

export interface DeviceSignals {
  userAgent: string;
  maxTouchPoints: number;
  /** Running inside the 0xDMme iOS or Android app. */
  native: boolean;
  /** Chromium's high-entropy model hint, when granted. */
  modelHint?: string | null;
  brave?: boolean;
}

export const modelLimit = 40;

/** Printable, single-line and bounded; anything else is no model at all. */
export function cleanModel(value: string | null | undefined): string | null {
  const model = (value ?? '').replace(/\s+/gu, ' ').trim();
  if (!model || model.length > modelLimit) return null;
  if (!/^[\p{L}\p{N} ._()+-]+$/u.test(model)) return null;
  // Reduced user agents replace the model with "K"; WebViews add "wv".
  if (model === 'K' || model === 'wv') return null;
  return model;
}

function kindOf(signals: DeviceSignals): DeviceKind {
  const agent = signals.userAgent;
  if (/iPad/u.test(agent)) return 'ipad';
  if (/iPhone|iPod/u.test(agent)) return 'iphone';
  if (/Android/u.test(agent))
    return /Mobile/u.test(agent) ? 'android-phone' : 'android-tablet';
  if (/CrOS/u.test(agent)) return 'chromeos';
  // iPadOS Safari asks for desktop sites and reports a Mac with touch.
  if (/Macintosh|Mac OS X/u.test(agent))
    return signals.maxTouchPoints > 1 ? 'ipad' : 'mac';
  if (/Windows/u.test(agent)) return 'windows';
  if (/Linux|X11/u.test(agent)) return 'linux';
  return 'unknown';
}

function clientOf(signals: DeviceSignals): DeviceClient {
  const agent = signals.userAgent;
  if (signals.native) return 'app';
  if (/Edg(?:e|A|iOS)?\//u.test(agent)) return 'edge';
  if (/OPR\/|OPiOS\//u.test(agent)) return 'opera';
  if (/Firefox\/|FxiOS\//u.test(agent)) return 'firefox';
  if (signals.brave) return 'brave';
  if (/Chrome\/|CriOS\//u.test(agent)) return 'chrome';
  if (/Safari\//u.test(agent)) return 'safari';
  return 'browser';
}

function androidModel(agent: string): string | null {
  const match = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/u.exec(agent);
  return cleanModel(match?.[1]);
}

export function describeDevice(signals: DeviceSignals): DeviceDescription {
  const kind = kindOf(signals);
  const android = kind === 'android-phone' || kind === 'android-tablet';
  return {
    kind,
    model: android
      ? (cleanModel(signals.modelHint) ?? androidModel(signals.userAgent))
      : null,
    client: clientOf(signals),
  };
}

interface HighEntropyHints {
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
  brands?: { brand: string }[];
}

async function modelHintOf(
  hints: HighEntropyHints | undefined,
): Promise<string | null> {
  try {
    return (await hints?.getHighEntropyValues?.(['model']))?.model ?? null;
  } catch {
    // Browsers may refuse high-entropy hints; the user agent still applies.
    return null;
  }
}

function insideNativeApp(): boolean {
  const bridge = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}

/** This browser's description. The model hint is optional and best effort. */
export async function detectThisDevice(): Promise<DeviceDescription> {
  const hints = (navigator as Navigator & { userAgentData?: HighEntropyHints })
    .userAgentData;
  return describeDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    native: insideNativeApp(),
    modelHint: await modelHintOf(hints),
    brave: hints?.brands?.some((entry) => entry.brand === 'Brave') === true,
  });
}
