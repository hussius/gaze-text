import type { GazeState } from '../gaze/filter';
import type { ReadingModel } from '../reading/model';
import type { TextRenderer } from '../text/renderer';

/** Full-screen canvas showing what the system thinks the eye is doing. */
export class DebugOverlay {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  visible = false;
  /** Extra text for the corner label, e.g. the last calibration accuracy. */
  note = '';

  constructor() {
    this.canvas.className = 'debug-overlay';
    document.body.append(this.canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(gaze: GazeState, model: ReadingModel, renderer: TextRenderer): void {
    const c = this.ctx;
    c.clearRect(0, 0, innerWidth, innerHeight);
    this.canvas.style.display = this.visible ? '' : 'none';
    if (!this.visible) return;

    // per-word attention as underline heat
    for (const w of renderer.words) {
      const s = Math.min(1, model.wordScore[w.index] / model.params.wordReadSeconds);
      if (s <= 0) continue;
      c.fillStyle = s >= 1 ? 'rgba(30,120,60,0.55)' : `rgba(200,120,0,${0.15 + s * 0.4})`;
      c.fillRect(w.rect.left, w.rect.bottom - 2, w.rect.width, 3);
    }

    // line state in the left margin: green = read, grey = passed by the read front
    for (const line of renderer.lines) {
      const x = line.left - 18;
      if (model.lineRead[line.index]) c.fillStyle = 'rgba(30,120,60,0.8)';
      else if (line.index <= model.readFront) c.fillStyle = 'rgba(120,120,120,0.6)';
      else continue;
      c.fillRect(x, line.top + 4, 4, line.bottom - line.top - 8);
    }
    const front = renderer.lines[model.readFront];
    if (front) {
      c.strokeStyle = 'rgba(30,120,60,0.5)';
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(front.left - 30, front.bottom);
      c.lineTo(front.right + 10, front.bottom);
      c.stroke();
      c.setLineDash([]);
    }

    // zone words
    for (const { index, weight } of model.zone) {
      const r = renderer.words[index].rect;
      c.strokeStyle = `rgba(200,40,40,${weight * 0.3})`;
      c.strokeRect(r.left - 1, r.top, r.width + 2, r.height);
    }

    const note = this.note ? `${this.note}  · ` : '';
    if (!model.gazeActive) {
      label(c, `${note}gaze lost`, 12, 20);
      return;
    }
    // smoothed gaze point (red), ringed while fixating (blue)
    const offscreen = gaze.x < 0 || gaze.y < 0 || gaze.x > innerWidth || gaze.y > innerHeight;
    if (offscreen) {
      // pin a marker to the screen edge in the direction of the estimate
      const ex = Math.min(innerWidth - 8, Math.max(8, gaze.x));
      const ey = Math.min(innerHeight - 8, Math.max(8, gaze.y));
      dot(c, ex, ey, 8, 'rgba(200,40,40,0.35)');
    } else {
      dot(c, gaze.x, gaze.y, 7, 'rgba(255,255,255,0.6)');
      dot(c, gaze.x, gaze.y, 5, 'rgba(200,40,40,0.7)');
    }
    if (gaze.fixating) {
      c.strokeStyle = 'rgba(40,80,200,0.3)';
      c.beginPath();
      c.arc(gaze.fixX, gaze.fixY, 9, 0, Math.PI * 2);
      c.stroke();
    }
    const where = offscreen ? '  · gaze off screen' : gaze.fixating ? '  · fixating' : '';
    label(c, `${note}front: line ${model.readFront + 1}/${renderer.lines.length}${where}`, 12, 20);
  }
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  c.font = '12px ui-monospace, monospace';
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillText(text, x, y);
}
