export type FrameVerdict = 'allow' | 'hold' | 'reject';
/** A detector's preprocessing and policy must be validated before supplying this interface. */
export interface ResizedFrameDetector {
  model: { hash: string; runtime: string };
  size: number;
  classify(
    frames: readonly Uint8Array[],
    signal: AbortSignal,
  ): Promise<readonly FrameVerdict[]>;
}
export interface PreparedFrameInput {
  bytes: Uint8Array;
  type: 'image/png' | 'image/jpeg' | 'image/gif' | 'video/mp4';
  maximumFrames: number;
}
export interface PreparedFrameShape {
  native: { width: number; height: number };
  context: { width: number; height: number; left: number; top: number };
}
export interface PreparedRgbaFrame {
  native: Uint8Array;
  context: Uint8Array;
}
export interface PreparedRgbaDetector {
  model: { hash: string; runtime: string };
  classifyPrepared(
    frames: readonly PreparedRgbaFrame[],
    shape: PreparedFrameShape,
    signal: AbortSignal,
  ): Promise<readonly FrameVerdict[]>;
}
export type PublicFrameDetector = ResizedFrameDetector | PreparedRgbaDetector;
