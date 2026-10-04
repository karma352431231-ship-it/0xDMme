export interface CaptureEvents {
  chunk: (chunk: Int16Array) => void;
  ended: () => void;
  interrupted: (notice: string) => void;
}
export interface VoiceCapture {
  start(): Promise<void>;
  stop(): Promise<void>;
  close(): void;
}
export type CaptureFactory = (events: CaptureEvents) => VoiceCapture;
