/**
 * Synthesized alert tones: no audio files, no network and no content. Private
 * messages use a two-stroke marimba (rising for a direct chat, falling for a
 * private group) so the source is audible without looking at the screen;
 * incoming calls keep the short plain beep.
 */
export type NotificationTone = 'direct' | 'group' | 'call';
export type ToneAudio = Pick<
  BaseAudioContext,
  'createOscillator' | 'createGain' | 'currentTime' | 'destination'
>;
type ToneVoice = {
  frequency: number;
  offset: number;
  peak: number;
  attack: number;
  decay: number;
};

const marimbaGap = 0.12;
/** Fundamental plus a short fourth-harmonic click gives the wooden strike. */
function marimbaStrike(frequency: number, offset: number): ToneVoice[] {
  return [
    { frequency, offset, peak: 0.2, attack: 0.005, decay: 0.28 },
    {
      frequency: frequency * 4,
      offset,
      peak: 0.05,
      attack: 0.005,
      decay: 0.04,
    },
  ];
}
const tones: Record<NotificationTone, ToneVoice[]> = {
  direct: [...marimbaStrike(880, 0), ...marimbaStrike(1319, marimbaGap)],
  group: [...marimbaStrike(1319, 0), ...marimbaStrike(880, marimbaGap)],
  call: [{ frequency: 660, offset: 0, peak: 0.05, attack: 0.001, decay: 0.12 }],
};

const silence = 0.0001;
function playVoice(audio: ToneAudio, voice: ToneVoice): void {
  const oscillator = audio.createOscillator(),
    gain = audio.createGain(),
    at = audio.currentTime + voice.offset,
    peakAt = at + voice.attack,
    end = peakAt + voice.decay;
  oscillator.frequency.value = voice.frequency;
  gain.gain.setValueAtTime(silence, at);
  gain.gain.exponentialRampToValueAtTime(voice.peak, peakAt);
  gain.gain.exponentialRampToValueAtTime(silence, end);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(at);
  oscillator.stop(end + 0.02);
}

export function playTone(audio: ToneAudio, tone: NotificationTone): void {
  for (const voice of tones[tone]) playVoice(audio, voice);
}
