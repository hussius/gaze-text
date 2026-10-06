/** One gaze estimate in viewport pixels. `t` is performance.now() milliseconds. */
export interface GazeSample {
  x: number;
  y: number;
  t: number;
}

export type SampleListener = (sample: GazeSample) => void;

/**
 * Anything that produces gaze samples: a webcam tracker, the mouse,
 * a simulated reader, a recorded session. Everything downstream only
 * sees this interface.
 */
export interface GazeSource {
  readonly name: string;
  start(): void | Promise<void>;
  stop(): void;
  onSample(listener: SampleListener): void;
}
