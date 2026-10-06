// WebGazer is loaded at runtime as a classic script, together with the
// MediaPipe face-mesh model (wasm + data) it fetches by URL. Copy both from
// the package into public/ so they are served locally and the installation
// works offline.
//
// The prebuilt dist/webgazer.js is used rather than bundling WebGazer's ES
// sources: @mediapipe/face_mesh is not a real ES module, and bundlers end up
// with `FaceMesh` undefined.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const pkg = 'node_modules/webgazer/dist';
if (!existsSync(pkg)) {
  console.error(`copy-webgazer: ${pkg} not found (is webgazer installed?)`);
  process.exit(1);
}
mkdirSync('public/webgazer', { recursive: true });
cpSync(`${pkg}/webgazer.js`, 'public/webgazer/webgazer.js');
cpSync(`${pkg}/mediapipe/face_mesh`, 'public/webgazer/mediapipe/face_mesh', { recursive: true });
console.log(`copy-webgazer: ${pkg} -> public/webgazer`);
