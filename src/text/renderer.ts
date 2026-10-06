import type { PageContent } from './content';

export interface Word {
  index: number;
  paragraph: number;
  line: number;
  base: string;
  /** Word at the same relative position in the parallel text. */
  variant: string;
  /** Stable random number in [0,1): lets effects affect words in a fixed scattered order. */
  seed: number;
  el: HTMLSpanElement;
  inner: HTMLSpanElement;
  /** Viewport rect, cached at layout time. */
  rect: DOMRect;

  // ---- written by effects every frame, applied by `commit()` ----
  /** Set by "living word": the word's current mutated form, or null. */
  mutated: string | null;
  /** Set by erosion "rewrite": show the variant instead. */
  swapped: boolean;
  blur: number; // px
  opacity: number; // 0..1
  bleed: number; // 0..1, ink spreading into the paper

  // ---- last values written to the DOM ----
  applied: { text: string; filter: string; opacity: string; shadow: string };
}

export interface Line {
  index: number;
  words: number[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Renders the page as one span per word and keeps a geometry cache for
 * hit-testing. After layout, each word box is frozen at the width of its
 * original word, so replacing a word never reflows the page: longer
 * replacements are compressed horizontally, like a compositor squeezing
 * a correction into the line.
 */
export class TextRenderer {
  words: Word[] = [];
  lines: Line[] = [];
  lineHeight = 0;
  private body: HTMLElement;

  constructor(private root: HTMLElement, content: PageContent) {
    root.innerHTML = '';
    const head = el('header', 'running-head', content.header);
    this.body = el('article', 'text');
    const folio = el('footer', 'folio', String(content.pageNumber));
    root.append(head, this.body, folio);

    content.base.forEach((para, p) => {
      const pEl = el('p');
      const baseTokens = tokens(para);
      const variantTokens = tokens(content.variant[p] ?? para);
      baseTokens.forEach((tok, i) => {
        const vi = Math.min(variantTokens.length - 1, Math.round((i * variantTokens.length) / baseTokens.length));
        const wEl = el('span', 'w');
        const inner = el('span', 'wi', tok);
        wEl.append(inner);
        if (i > 0) pEl.append(' ');
        pEl.append(wEl);
        this.words.push({
          index: this.words.length,
          paragraph: p,
          line: -1,
          base: tok,
          variant: variantTokens[vi],
          seed: Math.random(),
          el: wEl,
          inner,
          rect: new DOMRect(),
          mutated: null,
          swapped: false,
          blur: 0,
          opacity: 1,
          bleed: 0,
          applied: { text: tok, filter: '', opacity: '', shadow: '' },
        });
      });
      this.body.append(pEl);
    });
  }

  /** Measure and freeze word boxes. Call on start, on resize and after fonts load. */
  layout(): void {
    // 1. Back to natural flow with the original words.
    this.root.classList.remove('locked');
    for (const w of this.words) {
      w.el.style.width = '';
      w.inner.textContent = w.base;
      w.inner.style.transform = '';
    }
    this.fitType();
    // 2. Freeze each box at its natural width.
    const widths = this.words.map((w) => w.el.getBoundingClientRect().width);
    this.words.forEach((w, i) => (w.el.style.width = `${widths[i]}px`));
    this.root.classList.add('locked');
    // 3. Measure final geometry and group into lines.
    for (const w of this.words) w.rect = w.el.getBoundingClientRect();
    this.lineHeight = parseFloat(getComputedStyle(this.body).lineHeight) || this.words[0]?.rect.height || 20;
    this.groupLines();
    // 4. Restore whatever the effects currently want shown.
    for (const w of this.words) w.applied.text = w.base;
    this.commit(false);
  }

  /** Shrink the type until the whole text fits on the page (no scrolling while reading). */
  private fitType(): void {
    this.root.style.fontSize = '';
    let size = parseFloat(getComputedStyle(this.root).fontSize);
    while (this.body.scrollHeight > this.body.clientHeight + 1 && size > 10) {
      size *= 0.97;
      this.root.style.fontSize = `${size}px`;
    }
  }

  private groupLines(): void {
    this.lines = [];
    let current: Line | null = null;
    for (const w of this.words) {
      const r = w.rect;
      if (!current || r.top > current.top + this.lineHeight * 0.5) {
        current = { index: this.lines.length, words: [], top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        this.lines.push(current);
      }
      current.words.push(w.index);
      current.bottom = Math.max(current.bottom, r.bottom);
      current.right = Math.max(current.right, r.right);
      w.line = current.index;
    }
  }

  /** Clear all effect state. */
  resetEffects(): void {
    for (const w of this.words) {
      w.mutated = null;
      w.swapped = false;
      w.blur = 0;
      w.opacity = 1;
      w.bleed = 0;
    }
    this.commit(false);
  }

  /** Push effect state to the DOM, touching only what changed. */
  commit(animate = true): void {
    for (const w of this.words) {
      const text = w.swapped ? w.variant : (w.mutated ?? w.base);
      if (text !== w.applied.text) {
        w.applied.text = text;
        w.inner.textContent = text;
        this.fit(w);
        if (animate) {
          w.inner.animate(
            [{ opacity: 0.15, filter: 'blur(1.5px)' }, { opacity: 1, filter: 'blur(0)' }],
            { duration: 700, easing: 'ease-out' },
          );
        }
      }
      const filter = w.blur > 0.05 ? `blur(${w.blur.toFixed(1)}px)` : '';
      if (filter !== w.applied.filter) w.el.style.filter = w.applied.filter = filter;
      const opacity = w.opacity < 0.99 ? w.opacity.toFixed(2) : '';
      if (opacity !== w.applied.opacity) w.el.style.opacity = w.applied.opacity = opacity;
      const shadow = w.bleed > 0.02 ? `0 0 ${(w.bleed * 3).toFixed(1)}px rgba(40,30,20,${(w.bleed * 0.6).toFixed(2)})` : '';
      if (shadow !== w.applied.shadow) w.el.style.textShadow = w.applied.shadow = shadow;
    }
  }

  /** Squeeze text that is wider than its frozen box. */
  private fit(w: Word): void {
    w.inner.style.transform = '';
    const natural = w.inner.offsetWidth;
    const box = w.rect.width;
    if (natural > box && natural > 0) w.inner.style.transform = `scaleX(${(box / natural).toFixed(3)})`;
  }
}

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
