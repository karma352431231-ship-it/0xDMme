import { click, field, node, until } from './native-product-dom.ts';
import { openNativeInvitationEditor } from './native-product-contacts.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

/** Actual camera lifecycle only: observes track/frame metadata and releases the
 * product camera through its public close control. No images leave the phone.
 */
async function cameraLifecycle({ signal }: NativeActionInput): Promise<string> {
  await openNativeInvitationEditor(signal);
  click('[data-contact-action="scan"]');
  return cameraFramesAndClose(signal);
}

async function nativeCameraLifecycle({
  signal,
}: NativeActionInput): Promise<string> {
  await openNativeInvitationEditor(signal);
  // The actual XCTest UI executor performs the public camera-button tap.
  return cameraFramesAndClose(signal);
}

async function cameraFramesAndClose(signal: AbortSignal): Promise<string> {
  const video = node<HTMLVideoElement>('[data-contact-camera]');
  let stream: MediaStream | null = null;
  try {
    await until(
      () => {
        cameraFailure();
        stream =
          video.srcObject instanceof MediaStream ? video.srcObject : null;
        return (
          stream
            ?.getVideoTracks()
            .some((track) => track.readyState === 'live') === true &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        );
      },
      signal,
      'The actual camera stream and decoded frame dimensions',
    );
  } finally {
    if (!video.hidden) click('[data-contact-action="stop-camera"]');
  }
  const tracks = (stream as MediaStream | null)?.getTracks() ?? [];
  if (
    tracks.length === 0 ||
    tracks.some((track) => track.readyState !== 'ended') ||
    video.srcObject !== null ||
    !video.paused ||
    !video.hidden
  )
    throw new Error('The public close action did not release the camera.');
  return 'Actual camera frames opened and all tracks stopped on explicit close.';
}

export const cameraActions: ReadonlyMap<string, NativeAction> = new Map([
  ['camera-lifecycle', cameraLifecycle],
  ['camera-native-lifecycle', nativeCameraLifecycle],
  ['camera-invitation', cameraInvitation],
  ['camera-native-invitation', nativeCameraInvitation],
]);

function cameraFailure(): void {
  const notice = node('[data-contact-editor-status]').textContent ?? '';
  if (notice.includes('Não foi possível ler pela câmera.'))
    throw new Error(
      'The product camera permission/capture request was rejected.',
    );
  if (notice.includes('O prazo para abrir a câmera terminou.'))
    throw new Error('The product camera opening deadline expired.');
  if (notice.includes('Câmera indisponível.'))
    throw new Error('The product reported that camera capture is unavailable.');
}

async function cameraInvitation({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await prepareOpticalInvitation(value, signal);
  click('[data-contact-action="scan"]');
  return opticalInvitationResult(value, signal);
}

async function nativeCameraInvitation({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await prepareOpticalInvitation(value, signal);
  return opticalInvitationResult(value, signal);
}

async function prepareOpticalInvitation(
  value: string,
  signal: AbortSignal,
): Promise<void> {
  if (
    !/^https:\/\/0xdmme\.app\/#contatos\?convite=[a-f0-9-]{36}\.[a-f0-9]{64}$/u.test(
      value,
    )
  )
    throw new Error('Expected the exact synthetic canonical invitation.');
  await openNativeInvitationEditor(signal);
  field('[data-contact-received]', '');
}

async function opticalInvitationResult(
  value: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    await until(
      () => {
        cameraFailure();
        return (
          node<HTMLInputElement>('[data-contact-received]').value === value
        );
      },
      signal,
      'The exact invitation decoded from the physical camera',
    );
    const video = node<HTMLVideoElement>('[data-contact-camera]');
    if (!video.hidden || video.srcObject !== null || !video.paused)
      throw new Error(
        'The QR reader did not release its camera after decoding.',
      );
  } finally {
    const close = node<HTMLButtonElement>(
      '[data-contact-action="stop-camera"]',
    );
    if (!close.hidden) click('[data-contact-action="stop-camera"]');
  }
  return 'The physical QR scan matched the exact canonical invitation and released the camera.';
}
