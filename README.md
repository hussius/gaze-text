# gaze-text

An experiment for an art project: a printed page that reacts to where you
look, tracked with an ordinary webcam. Lines you have already read dissolve
or turn into another text ("erosion of the past"), and words you look at
change under your gaze ("living word").

**Try it:** https://hussius.github.io/gaze-text/ (Chrome recommended)

- Without a camera: the controls panel lets you drive the gaze with the
  mouse, or watch a simulated reader.
- With a camera: choose *Webcam (WebGazer)* as the gaze source and follow
  the dot to calibrate. All processing happens in your browser. No video
  leaves your computer.

Keys: **C** controls panel · **D** debug overlay · **R** reset page ·
**K** recalibrate · **F** fullscreen.

See [PLAN.md](PLAN.md) for the architecture, results so far and backlog.

## Development

    npm install
    npm run dev        # http://localhost:5173

## Credits

Eye tracking by [WebGazer.js](https://github.com/brownhci/WebGazer)
(GPLv3), using Google's MediaPipe Face Mesh. The placeholder text is
original and will be replaced by the artist's text.

## License

The code is licensed under the [GNU General Public License v3.0 or
later](LICENSE), consistent with WebGazer. The placeholder text is part of
the repository under the same terms. The artist's text, once added, will be
covered by its own terms.
