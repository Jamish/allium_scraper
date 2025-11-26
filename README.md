# WARNING: HERE VIBE CODED MONSTROSITIES

# Boxart Scraper — Electron + React (TypeScript) Boilerplate

This is a minimal Electron application using TypeScript and React. It provides a simple UI where you can drag an image from your desktop into the app and display it.

Quick start (macOS, zsh):

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app (builds then runs Electron):

   ```bash
   npm start
   ```

Notes:
- The renderer bundle is built with esbuild to `dist/renderer.js`.
- The main process is compiled with `tsc` to `dist/main.js`.

If you'd like, I can run `npm install` and `npm start` here to smoke-test it (this requires network access). Just tell me to proceed.

## Exporting
npx electron-packager . AlliumScraper \
  --platform=darwin \
  --arch=arm64 \
  --out=release \
  --overwrite \
  --app-bundle-id=sh.jami.allium_scraper \
  --prune=true
