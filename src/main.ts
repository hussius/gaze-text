import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import './style.css';

import { GazeFilter } from './gaze/filter';
import { MouseSource } from './gaze/mouseSource';
import { WebcamNoise } from './gaze/noise';
import { SimulatedReader } from './gaze/simulatedReader';
import { WebGazerSource } from './gaze/webgazerSource';
import type { GazeSource } from './gaze/types';
import { Erosion } from './effects/erosion';
import { LivingWord } from './effects/livingWord';
import type { Effect } from './effects/types';
import { ReadingModel } from './reading/model';
import { placeholder } from './text/content';
import { TextRenderer } from './text/renderer';
import { Calibration } from './ui/calibration';
import { Controls, loadSettings, type Settings } from './ui/controls';
import { DebugOverlay } from './ui/debugOverlay';

async function main(): Promise<void> {
  const settings = loadSettings();

  const page = document.getElementById('page')!;
  const renderer = new TextRenderer(page, placeholder);
  await document.fonts.ready;
  renderer.layout();

  const model = new ReadingModel(renderer, {
    zoneRadius: settings.zoneRadius,
    wordReadSeconds: 0.12,
    lineCoverage: 0.5,
  });
  const erosion = new Erosion();
  const living = new LivingWord();
  const overlay = new DebugOverlay();

  const noise = new WebcamNoise();
  const filter = new GazeFilter();
  const webcam = new WebGazerSource();
  const sources: Record<Settings['source'], GazeSource> = {
    mouse: new MouseSource(noise),
    simulated: new SimulatedReader(renderer, noise),
    webcam,
  };
  let calibrating = false;
  /** Median validation error of the last webcam calibration, px. */
  let webcamErrorPx: number | null = null;
  for (const s of Object.values(sources)) {
    s.onSample((sample) => {
      if (!calibrating) filter.push(sample);
    });
  }
  let source = sources[settings.source];

  const textArea = () => {
    const { lines } = renderer;
    const left = Math.min(...lines.map((l) => l.left));
    const right = Math.max(...lines.map((l) => l.right));
    return new DOMRect(left, lines[0].top, right - left, lines[lines.length - 1].bottom - lines[0].top);
  };
  const calibration = new Calibration(webcam, textArea);

  const effects = (): { on: Effect[]; off: Effect[] } => {
    const on: Effect[] = [];
    if (settings.mode === 'erosion' || settings.mode === 'both') on.push(erosion);
    if (settings.mode === 'living' || settings.mode === 'both') on.push(living);
    return { on, off: [erosion, living].filter((e) => !on.includes(e)) };
  };

  const apply = (key?: keyof Settings) => {
    erosion.style = settings.erosionStyle;
    living.style = settings.mutationStyle;
    noise.amount = settings.noise;
    // noisier signal → looser fixation detection
    const noisePx = settings.source === 'webcam' ? Math.min(webcamErrorPx ?? 100, 300) * 0.4 : settings.noise;
    filter.dispersionPx = 90 + noisePx * 2.5;
    model.params.zoneRadius = settings.zoneRadius;
    overlay.visible = settings.debug;
    if (key === 'source') void switchSource();
  };

  const startSource = async () => {
    try {
      await source.start();
    } catch (err) {
      console.error(err);
      controls.setStatus(`Webcam unavailable: ${err instanceof Error ? err.message : err}. Back to mouse.`);
      settings.source = 'mouse';
      controls.sync('source');
      source = sources.mouse;
      apply();
      await source.start();
      return false;
    }
    return true;
  };

  const switchSource = async () => {
    source.stop();
    source = sources[settings.source];
    controls.setStatus(settings.source === 'webcam' ? 'Starting webcam…' : '');
    clearPage();
    if ((await startSource()) && settings.source === 'webcam') await calibrate();
  };

  const clearPage = () => {
    filter.reset();
    model.reset();
    for (const e of [erosion, living]) {
      e.reset();
      e.clear({ renderer });
    }
    renderer.resetEffects();
  };

  const reset = () => {
    clearPage();
    // the simulated reader restarts from the top; the others just keep streaming
    if (source === sources.simulated) {
      source.stop();
      void source.start();
    }
  };

  const calibrate = async () => {
    if (settings.source !== 'webcam') {
      controls.setStatus('Calibration needs the webcam source.');
      return;
    }
    if (calibrating) return;
    calibrating = true;
    controls.setStatus('Calibrating…');
    try {
      const { errorPx, tuning } = await calibration.run(controls.visible || settings.debug);
      webcamErrorPx = errorPx;
      if (Number.isFinite(errorPx)) {
        // the gaze zone should roughly cover the tracker's error
        settings.zoneRadius = Math.round(Math.max(40, Math.min(200, errorPx * 0.5)));
        controls.sync('zoneRadius');
        const tuned = tuning
          ? ` · leave-one-dot-out test: tuned ±${Math.round(tuning.errorPx)} px vs WebGazer default ±${Math.round(tuning.defaultErrorPx)} px`
          : '';
        controls.setStatus(`Webcam accuracy ≈ ±${Math.round(errorPx)} px (zone radius ${settings.zoneRadius}px)${tuned}`);
        overlay.note = `webcam ±${Math.round(errorPx)} px`;
      } else {
        controls.setStatus('No face seen during the accuracy check. Recalibrate (K).');
        overlay.note = 'webcam: no face during check';
      }
    } catch (err) {
      controls.setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      calibrating = false;
      apply();
      clearPage();
    }
  };

  const controls = new Controls(settings, {
    onChange: (_s, key) => apply(key),
    onReset: reset,
    onCalibrate: () => void calibrate(),
  });
  apply();
  void switchSource();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (calibrating) return;
    switch (e.key.toLowerCase()) {
      case 'k': void calibrate(); break;
      case 'c': controls.toggle(); break;
      case 'd':
        settings.debug = !settings.debug;
        controls.sync('debug');
        apply();
        break;
      case 'r': reset(); break;
      case 'f':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
        break;
    }
  });

  // Geometry changes invalidate the reading state; on a gallery screen this
  // only happens at startup or when entering fullscreen.
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderer.layout();
      reset();
    }, 150);
  });

  if (import.meta.env.DEV) Object.assign(window, { app: { settings, renderer, model, filter, erosion, living, webcam } });

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    model.update(now, dt, filter.state);
    const { on, off } = effects();
    for (const e of off) e.clear({ renderer });
    const ctx = { now, dt, renderer, model, intensity: settings.intensity };
    for (const e of on) e.update(ctx);
    renderer.commit();
    overlay.draw(filter.state, model, renderer);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
