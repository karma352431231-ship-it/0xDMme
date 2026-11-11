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
  } else if (document.fullscreenEnabled) {
    await stage.requestFullscreen();
  } else if (video.webkitEnterFullscreen) {
    // iPhone's video fullscreen player owns its own controls.
    video.controls = true;
    try {
      video.webkitEnterFullscreen();
    } catch (error: unknown) {
      video.controls = false;
      throw error;
    }
  }
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
