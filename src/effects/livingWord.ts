import type { Word } from '../text/renderer';
import { lerp, type Effect, type EffectContext } from './types';

export type MutationStyle = 'scramble' | 'variant' | 'decay';

/**
 * "Living word": words in the gaze zone accumulate attention; once enough
 * builds up, the word mutates and the counter restarts. Looking at a word
 * long enough guarantees it changes under you.
 *
 * Owns: mutated.
 */
export class LivingWord implements Effect {
  style: MutationStyle = 'variant';
  private attention = new Map<number, number>();
  private generation = new Map<number, number>();

  update({ dt, renderer, model, intensity }: EffectContext): void {
    if (intensity <= 0) return;
    // seconds of direct gaze before a word mutates
    const threshold = lerp(1.2, 0.08, intensity);
    for (const { index, weight } of model.zone) {
      if (weight < 0.3) continue;
      const a = (this.attention.get(index) ?? 0) + weight * dt;
      if (a >= threshold) {
        this.attention.set(index, 0);
        this.mutate(renderer.words[index], renderer.words);
      } else {
        this.attention.set(index, a);
      }
    }
  }

  private mutate(w: Word, all: Word[]): void {
    const gen = (this.generation.get(w.index) ?? 0) + 1;
    this.generation.set(w.index, gen);
    const current = w.mutated ?? w.base;
    switch (this.style) {
      case 'scramble':
        w.mutated = scramble(current);
        break;
      case 'variant':
        // first the parallel text's word, then words drifting in from elsewhere on the page
        if (gen === 1 && w.variant !== w.base) {
          w.mutated = w.variant;
        } else {
          const donor = all[Math.floor(Math.random() * all.length)];
          w.mutated = matchCase(Math.random() < 0.5 ? donor.base : donor.variant, current);
        }
        break;
      case 'decay':
        w.mutated = decay(current);
        break;
    }
  }

  clear({ renderer }: Pick<EffectContext, 'renderer'>): void {
    for (const w of renderer.words) w.mutated = null;
  }

  reset(): void {
    this.attention.clear();
    this.generation.clear();
  }
}

const LETTER = /\p{L}/u;

/** Shuffle the letters of a word, keeping first and last letter and punctuation in place. */
function scramble(word: string): string {
  const chars = [...word];
  const slots = chars.map((c, i) => (LETTER.test(c) ? i : -1)).filter((i) => i >= 0);
  const inner = slots.length > 3 ? slots.slice(1, -1) : slots;
  const letters = inner.map((i) => chars[i]);
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  inner.forEach((slot, k) => (chars[slot] = letters[k]));
  return chars.join('');
}

/** Remove one letter; when nothing is left the word is gone, leaving its space. */
function decay(word: string): string {
  const chars = [...word];
  const slots = chars.map((c, i) => (LETTER.test(c) ? i : -1)).filter((i) => i >= 0);
  if (slots.length === 0) return '';
  chars[slots[Math.floor(Math.random() * slots.length)]] = '';
  return chars.join('');
}

/** Carry over capitalisation and trailing punctuation from `like` onto `word`. */
function matchCase(word: string, like: string): string {
  let core = word.replace(/[^\p{L}'’-]/gu, '').toLowerCase();
  if (/^\p{Lu}/u.test(like)) core = core.charAt(0).toUpperCase() + core.slice(1);
  const trail = like.match(/[^\p{L}]*$/u)?.[0] ?? '';
  return core + trail;
}
