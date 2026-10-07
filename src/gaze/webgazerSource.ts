import type { WebGazer } from 'webgazer';
import type { GazeSource, SampleListener } from './types';
import { tuneLambda, type TrainingSample, type TuningResult } from './ridgeTuning';

const WEBGAZER_DIR = `${import.meta.env.BASE_URL}webgazer`;

/**
 * WebGazer's regression keeps only the last 50 calibration samples, which
 * silently discards most of a full calibration. Room for this many instead.
 */
const TRAINING_SAMPLES = 300;

/**
 * Webcam gaze via WebGazer. The library (TensorFlow.js + MediaPipe, ~2 MB plus
 * model files) is only loaded when this source is first started. It's the
 * prebuilt script copied to public/ by scripts/copy-webgazer.mjs.
 *
 * WebGazer normally trains itself on every mouse click and movement; that's
 * switched off, since in the gallery all training comes from the calibration
 * screen. Training data is never persisted, so each visitor starts clean.
 */
export class WebGazerSource implements GazeSource {
  readonly name = 'webcam';
  private listeners: SampleListener[] = [];
  private wg: WebGazer | null = null;
  private running = false;

  /** Rejects if the camera is unavailable or permission is denied. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (!this.wg) {
      const wg = await loadWebGazer();
      wg.params.faceMeshSolutionPath = `${WEBGAZER_DIR}/mediapipe/face_mesh`;
      wg.saveDataAcrossSessions(false)
        .applyKalmanFilter(true)
        .setRegression('ridge')
        .setGazeListener((data) => {
          if (!data || !this.running) return;
          const sample = { x: data.x, y: data.y, t: performance.now() };
          for (const l of this.listeners) l(sample);
        });
      try {
        await wg.begin();
      } catch (err) {
        this.running = false;
        throw err;
      }
      wg.removeMouseEventListeners();
      wg.showPredictionPoints(false);
      this.wg = wg;
      this.enlargeTrainingWindow();
      this.showCamera(false);
    } else {
      await this.wg.resume();
    }
  }

  stop(): void {
    this.running = false;
    this.wg?.pause();
    this.showCamera(false);
  }

  onSample(listener: SampleListener): void {
    this.listeners.push(listener);
  }

  /** Tell the model that the eyes are currently looking at (x, y). */
  train(x: number, y: number): void {
    this.wg?.recordScreenPosition(x, y, 'click');
  }

  /** Forget all calibration (between visitors). */
  async clearCalibration(): Promise<void> {
    await this.wg?.clearData();
    // clearData re-initialises the regression with its default 50-sample window
    this.enlargeTrainingWindow();
  }

  /**
   * Choose the regression's regularisation from the calibration data just
   * collected (see ridgeTuning.ts). Call after training, before validating.
   */
  tuneRegularization(): TuningResult | null {
    if (!this.wg) return null;
    const regs = this.wg.getRegression() as unknown as RidgeInternals[];
    const reg = regs[0];
    if (!reg) return null;
    const feats = reg.eyeFeaturesClicks.data;
    const xs = reg.screenXClicksArray.data;
    const ys = reg.screenYClicksArray.data;
    const samples: TrainingSample[] = feats.map((features, i) => ({ features, x: xs[i][0], y: ys[i][0] }));
    const result = tuneLambda(samples);
    if (result) for (const r of regs) r.ridgeParameter = result.lambda;
    return result;
  }

  private enlargeTrainingWindow(): void {
    if (!this.wg) return;
    const { DataWindow } = this.wg.util;
    for (const reg of this.wg.getRegression()) {
      for (const key of ['screenXClicksArray', 'screenYClicksArray', 'eyeFeaturesClicks', 'dataClicks']) {
        reg[key] = new DataWindow(TRAINING_SAMPLES);
      }
    }
  }

  /** Camera preview with face-position feedback, used while the visitor gets into place. */
  showCamera(show: boolean): void {
    if (!this.wg) return;
    // showVideoPreview(true) alone won't bring the video back: hiding it also
    // stored showVideo=false, which showVideoPreview then respects. Set each part.
    this.wg.showVideoPreview(show).showVideo(show).showFaceOverlay(show).showFaceFeedbackBox(show);
    if (show) this.wg.setVideoViewerSize(400, 300);
  }
}

function loadWebGazer(): Promise<WebGazer> {
  const existing = (window as { webgazer?: WebGazer }).webgazer;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${WEBGAZER_DIR}/webgazer.js`;
    script.onload = () => {
      const wg = (window as { webgazer?: WebGazer }).webgazer;
      if (wg) resolve(wg);
      else reject(new Error('webgazer.js loaded but did not define window.webgazer'));
    };
    script.onerror = () => reject(new Error(`could not load ${script.src} (run npm install)`));
    document.head.append(script);
  });
}

/** The fields of WebGazer's ridge regression object that tuning reads and writes. */
interface RidgeInternals {
  ridgeParameter: number;
  eyeFeaturesClicks: { data: number[][] };
  screenXClicksArray: { data: number[][] };
  screenYClicksArray: { data: number[][] };
}
