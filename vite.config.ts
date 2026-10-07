import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (the site lives under /gaze-text/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
