/**
 * Picks WebGazer's ridge regularisation per calibration.
 *
 * WebGazer maps 120 raw eye-patch pixel values to screen x/y with ridge
 * regression and a fixed lambda of 1e-5, which for 0–255 pixel features is
 * effectively unregularised. With ~130 samples that overfits badly and makes
 * results swing from one calibration to the next. Here lambda is chosen by
 * leave-one-point-out cross-validation: train on all calibration dots but one,
 * predict the held-out dot, repeat for each dot and each candidate lambda.
 */

export interface TrainingSample {
  features: number[];
  x: number;
  y: number;
}

export interface TuningResult {
  lambda: number;
  /** Median held-out error with that lambda, px. */
  errorPx: number;
  /** Median held-out error with WebGazer's default lambda, for comparison. */
  defaultErrorPx: number;
}

export const WEBGAZER_DEFAULT_LAMBDA = 1e-5;
const LAMBDAS = [1e-5, 1e2, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7, 1e8];

export function tuneLambda(samples: TrainingSample[]): TuningResult | null {
  // group samples by calibration dot
  const groups = new Map<string, TrainingSample[]>();
  for (const s of samples) {
    const key = `${Math.round(s.x)},${Math.round(s.y)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const folds = [...groups.values()];
  if (folds.length < 4) return null;

  const errorFor = (lambda: number) => {
    const errors: number[] = [];
    for (let k = 0; k < folds.length; k++) {
      const train = folds.flatMap((f, i) => (i === k ? [] : f));
      const [wx, wy] = fit(train, lambda);
      for (const s of folds[k]) {
        errors.push(Math.hypot(dot(wx, s.features) - s.x, dot(wy, s.features) - s.y));
      }
    }
    return median(errors);
  };

  let best = { lambda: WEBGAZER_DEFAULT_LAMBDA, errorPx: Infinity };
  let defaultErrorPx = Infinity;
  for (const lambda of LAMBDAS) {
    const errorPx = errorFor(lambda);
    if (lambda === WEBGAZER_DEFAULT_LAMBDA) defaultErrorPx = errorPx;
    if (errorPx < best.errorPx) best = { lambda, errorPx };
  }
  return { ...best, defaultErrorPx };
}

/** Ridge fit for both axes, same formulation as WebGazer (no intercept). */
function fit(samples: TrainingSample[], lambda: number): [number[], number[]] {
  const d = samples[0].features.length;
  const A: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const bx = new Array(d).fill(0);
  const by = new Array(d).fill(0);
  for (const { features: f, x, y } of samples) {
    for (let i = 0; i < d; i++) {
      const fi = f[i];
      bx[i] += fi * x;
      by[i] += fi * y;
      const row = A[i];
      for (let j = i; j < d; j++) row[j] += fi * f[j];
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < i; j++) A[i][j] = A[j][i];
    A[i][i] += lambda;
  }
  const L = cholesky(A);
  return [cholSolve(L, bx), cholSolve(L, by)];
}

function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) L[i][i] = Math.sqrt(Math.max(sum, 1e-12));
      else L[i][j] = sum / L[j][j];
    }
  }
  return L;
}

function cholSolve(L: number[][], b: number[]): number[] {
  const n = L.length;
  const z = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * z[k];
    z[i] = s / L[i][i];
  }
  const w = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * w[k];
    w[i] = s / L[i][i];
  }
  return w;
}

function dot(w: number[], f: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * f[i];
  return s;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
