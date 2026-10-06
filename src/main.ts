import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import './style.css';

import { GazeFilter } from './gaze/filter';
import { MouseSource } from './gaze/mouseSource';
import { WebcamNoise } from './gaze/noise';
import { SimulatedReader } from './gaze/simulatedReader';
import type { GazeSource } from './gaze/types';
import { Erosion } from './effects/erosion';
import { LivingWord } from './effects/livingWord';
import type { Effect } from './effects/types';
import { ReadingModel } from './reading/model';
import { placeholder } from './text/content';
import { TextRenderer } from './text/renderer';
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
  const sources: Record<Settings['source'], GazeSource> = {
    mouse: new MouseSource(noise),
    simulated: new SimulatedReader(renderer, noise),
  };
  for (const s of Object.values(sources)) s.onSample((sample) => filter.push(sample));
  let source = sources[settings.source];

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
    filter.dispersionPx = 90 + settings.noise * 2.5;
    model.params.zoneRadius = settings.zoneRadius;
    overlay.visible = settings.debug;
    if (key === 'source') {
      source.stop();
      source = sources[settings.source];
      reset();
    }
  };

  const reset = () => {
    source.stop();
    filter.reset();
    model.reset();
    for (const e of [erosion, living]) {
      e.reset();
      e.clear({ renderer });
    }
    renderer.resetEffects();
    source.start();
  };

  const controls = new Controls(settings, {
    onChange: (_s, key) => apply(key),
    onReset: reset,
  });
  apply();
  source.start();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    switch (e.key.toLowerCase()) {
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

  if (import.meta.env.DEV) Object.assign(window, { app: { settings, renderer, model, filter, erosion, living } });

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
