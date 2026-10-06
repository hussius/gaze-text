import type { ErosionStyle } from '../effects/erosion';
import type { MutationStyle } from '../effects/livingWord';

export type Mode = 'erosion' | 'living' | 'both' | 'off';
export type SourceKind = 'mouse' | 'simulated';

export interface Settings {
  mode: Mode;
  intensity: number;
  erosionStyle: ErosionStyle;
  mutationStyle: MutationStyle;
  source: SourceKind;
  noise: number;
  zoneRadius: number;
  debug: boolean;
}

export const defaults: Settings = {
  mode: 'erosion',
  intensity: 0.5,
  erosionStyle: 'rewrite+blur',
  mutationStyle: 'variant',
  source: 'mouse',
  noise: 0,
  zoneRadius: 60,
  debug: true,
};

const STORAGE_KEY = 'gaze-text-settings';

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...defaults, ...saved };
  } catch {
    return { ...defaults };
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings just won't persist
  }
}

interface Handlers {
  onChange(s: Settings, key: keyof Settings): void;
  onReset(): void;
}

/** Operator panel. Hidden for visitors; toggle with C. */
export class Controls {
  private panel = document.createElement('aside');
  visible = true;

  constructor(private settings: Settings, private handlers: Handlers) {
    this.panel.className = 'controls';
    this.panel.innerHTML = `
      <h2>Controls <small>C hide · D debug · R reset · F fullscreen</small></h2>
      <label>Mode
        <select data-key="mode">
          <option value="erosion">Erosion of the past</option>
          <option value="living">Living word</option>
          <option value="both">Both</option>
          <option value="off">Off</option>
        </select></label>
      <label>Intensity <output data-for="intensity"></output>
        <input data-key="intensity" type="range" min="0" max="1" step="0.01"></label>
      <label>Erosion style
        <select data-key="erosionStyle">
          <option value="rewrite+blur">Rewrite, then blur</option>
          <option value="rewrite">Rewrite</option>
          <option value="blur">Blur</option>
          <option value="fade">Fade / ink bleed</option>
        </select></label>
      <label>Mutation style
        <select data-key="mutationStyle">
          <option value="variant">Swap words</option>
          <option value="scramble">Scramble letters</option>
          <option value="decay">Decay letters</option>
        </select></label>
      <hr>
      <label>Gaze source
        <select data-key="source">
          <option value="mouse">Mouse</option>
          <option value="simulated">Simulated reader</option>
        </select></label>
      <label>Simulated webcam noise <output data-for="noise"></output>
        <input data-key="noise" type="range" min="0" max="120" step="1"></label>
      <label>Gaze zone radius <output data-for="zoneRadius"></output>
        <input data-key="zoneRadius" type="range" min="20" max="200" step="1"></label>
      <label class="row"><input data-key="debug" type="checkbox"> Debug overlay</label>
      <button type="button" data-action="reset">Reset page</button>
    `;
    document.body.append(this.panel);

    for (const input of this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]')) {
      const key = input.dataset.key as keyof Settings;
      this.write(input, key);
      input.addEventListener('input', () => {
        const value =
          input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked
          : input instanceof HTMLInputElement && input.type === 'range' ? Number(input.value)
          : input.value;
        (this.settings as unknown as Record<string, unknown>)[key] = value;
        this.showValue(key);
        saveSettings(this.settings);
        this.handlers.onChange(this.settings, key);
      });
      this.showValue(key);
    }
    this.panel.querySelector('[data-action="reset"]')!.addEventListener('click', () => this.handlers.onReset());
  }

  /** Reflect a setting changed elsewhere (e.g. a keyboard shortcut). */
  sync(key: keyof Settings): void {
    const input = this.panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (input) this.write(input, key);
    saveSettings(this.settings);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.hidden = !this.visible;
    document.body.classList.toggle('operator-hidden', !this.visible);
  }

  private write(input: HTMLInputElement | HTMLSelectElement, key: keyof Settings): void {
    const v = this.settings[key];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
  }

  private showValue(key: keyof Settings): void {
    const out = this.panel.querySelector(`output[data-for="${key}"]`);
    if (!out) return;
    const v = this.settings[key] as number;
    out.textContent = key === 'intensity' ? `${Math.round(v * 100)}%` : `${v}px`;
  }
}
