/** Fixed synthetic cue only: no microphone samples, recording or local playback. */
async function deadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => {
      const reason: unknown = signal.reason;
      reject(
        reason instanceof Error ? reason : new Error('Test tone cancelled.'),
      );
    };
    timer = setTimeout(() => reject(new Error('Test tone timed out.')), 1500);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

function cue() {
  const context = new AudioContext({ sampleRate: 48000 });
  const output = context.createMediaStreamDestination();
  output.channelCount = 1;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.frequency.value = 640;
  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(output);
  let started = false;
  return {
    track: output.stream.getAudioTracks()[0]!,
    ready: context.resume(),
    play() {
      const at = context.currentTime;
      gain.gain.setValueAtTime(0, at);
      gain.gain.setValueAtTime(0, at + 0.3);
      gain.gain.linearRampToValueAtTime(0.05, at + 0.31);
      gain.gain.setValueAtTime(0.05, at + 0.49);
      gain.gain.linearRampToValueAtTime(0, at + 0.5);
      const ended = new Promise<void>((resolve) => {
        oscillator.onended = () => resolve();
      });
      oscillator.start();
      started = true;
      oscillator.stop(at + 1.2);
      return ended;
    },
    close() {
      if (started) oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
      for (const track of output.stream.getTracks()) track.stop();
      return context.close();
    },
  };
}
/** Replace only the negotiated local sender, then restore the same live track. */
export async function sendCallTestTone(
  sender: RTCRtpSender,
  signal: AbortSignal,
) {
  const previous = sender.track;
  if (
    !previous ||
    previous.readyState !== 'live' ||
    !previous.enabled ||
    signal.aborted
  )
    throw new Error('Live microphone required for test tone.');
  const tone = cue();
  try {
    await deadline(tone.ready, signal);
    await deadline(sender.replaceTrack(tone.track), signal);
    await deadline(tone.play(), signal);
  } finally {
    // Restoration still runs after user cancellation, without opening capture.
    const restore = new AbortController();
    try {
      await deadline(
        sender.replaceTrack(previous.readyState === 'live' ? previous : null),
        restore.signal,
      );
    } finally {
      await deadline(tone.close(), restore.signal);
    }
  }
}
