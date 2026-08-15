import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A copy of `index.html` as `404.html` — R8.
 *
 * The app uses history routing, so `/stats` and a shared `/results/:id` are
 * real URLs the server has no file for. `public/_redirects` handles Netlify
 * and Cloudflare Pages; GitHub Pages ignores that file and serves `404.html`
 * for an unknown path instead, so shipping the shell under that name is what
 * makes deep links work there. Any host that serves it gets a working app
 * rather than a 404 page.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      copyFileSync(`${dist}/index.html`, `${dist}/404.html`);
    },
  };
}

/**
 * Stamps the built asset hashes into the service worker's cache version — R9.
 *
 * `sw.js` shipped with `VERSION = 'v1'` hard-coded. Its `activate` handler
 * deletes caches that do not end in `VERSION`, so with the version frozen
 * *nothing was ever deleted*: the `index.html` precached on a user's first
 * visit survived every subsequent deploy. Online that is hidden by the
 * network-first navigation, but offline it serves an old shell asking for
 * hashed chunks that no longer exist — a blank page, and no way for the user
 * to clear it.
 *
 * Deriving the version from the asset filenames means a build that changed
 * anything gets a new cache and drops the old one, and a build that changed
 * nothing keeps its cache rather than pointlessly refetching.
 */
function serviceWorkerVersion(): Plugin {
  return {
    name: 'service-worker-version',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const assets = readdirSync(`${dist}/assets`).sort().join(',');
      const version = createHash('sha256').update(assets).digest('hex').slice(0, 12);

      const swPath = `${dist}/sw.js`;
      const source = readFileSync(swPath, 'utf8');
      const stamped = source.replace('__SW_VERSION__', version);
      if (stamped === source) {
        throw new Error('sw.js has no __SW_VERSION__ placeholder to stamp');
      }
      writeFileSync(swPath, stamped);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback(), serviceWorkerVersion()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // `scripts/` is in scope: the data pipeline decides what ships, so its
    // rules deserve tests as much as the app's do.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
