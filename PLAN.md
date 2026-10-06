# Gaze-Reactive Text — Project Plan (draft)

An art experiment: a text on screen that reacts to where the reader is looking,
captured with an ordinary webcam. Passages already read can dissolve, blur, or
turn into a different text, and words being read right now can mutate under the gaze.

---

## 1. The key constraint: webcam gaze accuracy

Webcam eye tracking is imprecise, and that limit shapes everything else in this plan.

| Tracker | Typical error | Notes |
|---|---|---|
| Dedicated IR tracker (Tobii etc.) | ~0.5° (≈ 15–25 px) | Hardware, not in scope for now |
| WebGazer.js | ~4° (≈ 100–200 px), jittery | Free, runs in the browser, easy to start with; needs frequent calibration |
| MediaPipe Face Landmarker (iris) + our own regression | Similar to or slightly better than WebGazer, steadier | More work, better maintained, we fully control it |
| Commercial SDKs (e.g. Eyedid/SeeSo, GazeRecorder) | Somewhat better | Licensing and cost; consider later if needed |

**Design consequences**
- **"Already read" mode works well.** It only needs to know roughly which *line or
  paragraph* the reader is on and that they are moving downward. That is reliable.
- **"Currently read word" mode needs adjustments.** Exact word targeting won't work. We
  use a *zone of influence* (a soft radius around the estimated gaze point)
  combined with reading-direction inference (left→right sweep along a line).
  The imprecision then works as part of the aesthetic, since words near the gaze change.
- Large type, generous line height and a narrow text column help a lot.
  This is also a design decision for the piece.

**Recommendation:** start with WebGazer to get running quickly. Put it behind a
`GazeSource` interface so we can switch to a MediaPipe-based tracker (or a mouse
simulator for development) without touching anything else.

---

## 2. Architecture

A client-only web app: **Vite + TypeScript**, no backend. Plain DOM and CSS for
rendering (CSS filters/transitions handle blur and fade cheaply), with no heavy UI framework.

```
 webcam
   │
   ▼
┌──────────────┐   raw (x,y,t)   ┌──────────────┐  fixations/  ┌───────────────┐
│ GazeSource   │ ──────────────▶ │ GazeFilter   │  smoothed pt │ ReadingModel  │
│ - WebGazer   │                 │ - smoothing  │ ───────────▶ │ - word/line   │
│ - MediaPipe  │                 │   (1€ filter)│              │   hit-testing │
│ - Mouse sim  │                 │ - fixation   │              │ - read state  │
│ - Replay     │                 │   detection  │              │ - read front  │
└──────────────┘                 └──────────────┘              └──────┬────────┘
        ▲                                                             │ events
        │ calibration                                                 ▼
┌──────────────┐                 ┌──────────────┐              ┌───────────────┐
│ Calibration  │                 │ Controls UI  │  params      │ EffectEngine  │
│ UI (9-point, │                 │ - mode       │ ───────────▶ │ - modes as    │
│ re-calibrate)│                 │ - intensity  │              │   plugins     │
└──────────────┘                 │ - debug view │              └──────┬────────┘
                                 └──────────────┘                     │ mutations
                                                                      ▼
                                 ┌──────────────┐              ┌───────────────┐
                                 │ TextSource   │ ───────────▶ │ TextRenderer  │
                                 │ - base text  │  content     │ - word spans  │
                                 │ - variants   │              │ - layout cache│
                                 └──────────────┘              └───────────────┘
```

### Modules

- **`GazeSource`**: a shared interface (`start()`, `stop()`, `onSample(cb)`) with
  these implementations:
  - `WebGazerSource`, the first real tracker.
  - `MouseSource`, which simulates gaze with the cursor (plus optional noise to mimic
    webcam error). We need this for developing and tuning the effects without
    sitting in front of the camera all day.
  - `ReplaySource`, which plays back recorded gaze sessions so effects can be tuned
    against real data.
  - `MediaPipeSource` (later) if WebGazer turns out too unstable.
- **`Calibration`**: a click-the-dots calibration screen (9 points), a quick
  accuracy check, and an option to recalibrate. This could be styled as part of
  the artwork.
- **`GazeFilter`**: the 1€ filter for smoothing, plus I-DT fixation detection
  (dispersion and duration thresholds). It emits `fixation` and `saccade` events.
- **`TextRenderer`**: splits the text into `paragraph › line › word` spans and
  caches bounding boxes (recomputed on resize). It exposes `wordsNear(point, radius)`
  and `lineAt(y)`.
- **`ReadingModel`**: turns fixations into reading state:
  - per word/line: `readScore` (accumulated, decays with distance),
  - the **read front**: the furthest line confidently read, which is monotonic with
    some tolerance for regressions,
  - the **current zone**: the words under or near the gaze right now.
- **`EffectEngine`**: runs each mode as a plugin with
  `update(state, params, dt) → mutations`, all driven by a global **intensity**
  slider (0–1) plus mode-specific parameters.
- **`TextSource`**: the content. It holds the base text plus *variants* (see §3).
- **`Controls`**: a small overlay panel with the mode, intensity slider and
  thresholds, toggled with a key. The **debug overlay** shows the gaze dot, fixations,
  and read-state heatmap.

---

## 3. Effect modes (first set)

1. **Erosion of the past.** Lines more than N lines above the read front
   change gradually. Intensity controls how soon and how strongly that happens. Variants:
   - *blur*: CSS `filter: blur()` that grows with time since the line was read,
   - *fade / ink-bleed*: opacity and letter-spacing drift,
   - *rewrite*: words swap one by one into a parallel text, so the passage you
     read is no longer the passage that is there.
2. **Living word.** Words inside the current gaze zone mutate while you look at them.
   This could be letter scrambling, synonym swaps, or slow drift toward the parallel
   text. Intensity controls the mutation rate and radius. The reader never quite
   catches the word they are looking at.
3. *(Ideas for later)* text that changes **only where you are not looking**
   (peripheral change, the inverse of mode 2); text that "waits" and stays blank
   until gaze arrives; and logging a reading session to replay as a separate artwork.

**Content strategy for "rewrite" and "mutate".** The simplest and most controllable
approach is *parallel texts* aligned word by word or sentence by sentence, written by
you. Alternatives are word-substitution lists (synonyms/antonyms) or, later,
LLM-generated variants (needs a small backend or API key; optional).

---

## 4. Phases

| # | Phase | Outcome |
|---|---|---|
| 0 | Scaffold | Vite + TS project, text rendering with word spans, `MouseSource`, debug overlay |
| 1 | Reading model | Fixation detection, read front, current zone, tested with mouse plus synthetic noise |
| 2 | Effects v1 | "Erosion" (blur + rewrite) and "living word", intensity slider, mode switch |
| 3 | Real eye tracking | WebGazer integration, calibration screen, accuracy check, tuning thresholds |
| 4 | Recording & replay | Record gaze sessions to JSON and replay them for tuning and documentation |
| 5 | Robustness | Recalibration prompts, handling lost faces and head movement, MediaPipe evaluation |
| 6 | Presentation | Exhibition/kiosk mode (fullscreen, auto-reset between visitors, hidden controls), visual polish |

Phases 0–2 can be built and evaluated without a webcam, so we find out early whether
the effects are interesting before fighting tracker noise.

---

## 5. Practical notes

- **Privacy:** all processing stays in the browser and no video leaves the machine.
  That is worth stating in the piece if it is exhibited.
- Camera access needs `https` or `localhost`.
- Lighting and camera placement matter a lot. A top-of-screen webcam at eye level
  with an evenly lit face works best.
- WebGazer stores calibration data in localStorage by default. We should clear it per
  visitor in kiosk mode.

## 6. Decisions so far

- **Setting:** gallery installation (one machine, many visitors, kiosk mode).
  Everything is bundled locally (fonts and, later, WebGazer) so it runs offline.
- **Text:** placeholder for now (`src/text/content.ts`, an original base text
  plus a parallel "variant"). The artist's text replaces it later.
- **Language:** English first.
- **Look:** printed page. EB Garamond, justified, paper texture, running head
  and folio. The whole text always fits one screen (type auto-shrinks), so
  there's no scrolling.

## 7. Status

- [x] Phase 0: scaffold, word-span renderer with frozen word boxes (replacements
  never reflow the page), mouse source, debug overlay
- [x] Phase 1: 1€ smoothing, I-DT fixations, **line snapping with hysteresis**,
  per-word attention, read front
- [x] Phase 2: Erosion (blur / fade / rewrite / rewrite+blur), Living word
  (swap / scramble / decay), intensity slider, operator panel, simulated reader
- [x] Phase 3 (tested on a laptop's built-in camera): WebGazer source,
  hands-free calibration (visitor follows an ink dot: 13 training points, then
  5 validation points that measure accuracy), zone radius and fixation
  threshold tuned automatically from the measured error
- [ ] Phases 4–6
- [ ] Later: deploy online so the artist can try it. It's a static site (any
  static host works; https is required for the camera).

### First camera results (laptop built-in webcam, glasses)

- Two bugs in how WebGazer was used are fixed. Its 50-sample training buffer
  dropped most of the calibration, and its ridge regularisation (1e-5 on raw
  pixels) overfits. Lambda is now chosen per calibration by
  leave-one-dot-out cross-validation.
- Result after the fixes: about **260 px** median error on validation dots. On
  the same calibration WebGazer's default scored about 660 px. That's still
  too coarse for line-level effects: it tells the top, middle and bottom of the
  page apart.
- Results vary a lot between calibrations. Lighting, glasses reflections and
  head movement are the likely factors.

## 8. Backlog

- **Tobii Eye Tracker 5** (being discussed with the artist): infrared, works
  with glasses, accurate to about one line of text. Needs a small local bridge
  program that passes its gaze data to the page. This is the likely route if
  webcam accuracy stays around 200+ px.
- **MediaPipe tracker:** a new `GazeSource` built on MediaPipe Face Landmarker
  (iris centres relative to eye corners, eye openness, head pose → about
  10–15 features → tuned ridge regression). It should be more stable and better
  with glasses than WebGazer's raw eye pixels. Estimate: about a day of work.
- **Save session:** a button that downloads calibration data (features plus dot
  positions) as a file, so trackers can be tuned and compared offline.
- **Gallery flow:** a shorter calibration (about 9 dots, no or brief accuracy
  check), automatic reset and recalibration when no face is seen for N seconds,
  and intro and calibration text written with the artist.
- **Implicit recalibration while reading:** use return sweeps (end of line →
  start of next) as extra calibration points. Experimental.
- **Designs for coarse gaze:** erosion by paragraph or region, larger type and
  fewer lines, and "living passage" instead of living word.
- **Physical setup:** an external webcam at eye level, even light on the face
  from the front, and a fixed seat or chin rest.

### WebGazer notes

- It is loaded at runtime from `public/webgazer/` (copied from the npm package by
  `scripts/copy-webgazer.mjs` on `npm install`), together with Google's
  MediaPipe Face Mesh model files. Nothing is fetched from the internet.
- WebGazer's own training from mouse clicks and movement is disabled, and
  calibration data is not persisted. Each visitor starts clean.
- **License:** WebGazer is GPLv3 (LGPLv3 for organisations valued under $1M).
  That's fine for an art installation. If it's published online, its source
  should stay available. Linking to this repo or to WebGazer's repo covers it.
- Glasses: face finding is robust, but reflections on lenses degrade the eye
  images. Keep lamps out of the lenses' reflection and compare the measured
  accuracy for visitors with and without glasses.

### Running

    npm install
    npm run dev        # http://localhost:5173

Keys: **C** toggles the operator panel, **D** the debug overlay, **R** resets the
page, **K** recalibrates the webcam, **F** toggles fullscreen. Settings persist in
the browser. Use Chrome on `localhost` for the camera.
