type SafariVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export async function toggleVideoFullscreen(
  stage: HTMLElement,
  video: SafariVideo,
): Promise<void> {
  const document = stage.ownerDocument;
  if (document.fullscreenElement === stage) {
    await document.exitFullscreen();
  } else if (nativePlayer(video)) {
    // iPhone's video fullscreen player owns its own controls. Element
    // fullscreen in the iOS app showed a system banner over a black screen
    // that only a restart cleared (12/11/2026).
    video.controls = true;
    try {
      video.webkitEnterFullscreen?.();
    } catch (error: unknown) {
      video.controls = false;
      throw error;
    }
  } else if (document.fullscreenEnabled) {
    await stage.requestFullscreen();
  }
}

/** Touch devices with iOS's video player use it; others keep element fullscreen. */
function nativePlayer(video: SafariVideo): boolean {
  return (
    typeof video.webkitEnterFullscreen === 'function' &&
    (!video.ownerDocument.fullscreenEnabled ||
      matchMedia('(pointer: coarse)').matches)
  );
}

export function releaseVideoFullscreen(
  stage: HTMLElement,
  video: SafariVideo,
): void {
  const document = stage.ownerDocument;
  if (document.fullscreenElement === stage)
    void document.exitFullscreen().catch(() => undefined);
  else if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
}
