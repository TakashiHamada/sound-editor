import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createLogger, defineConfig } from 'vite';

// The repo root *is* the GitHub Pages site: `npm run build` compiles app/ and
// writes index.html + assets/ next to this file. Source lives only under app/.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(repoRoot, 'assets');

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot }).toString().trim();
  } catch {
    return 'unknown';
  }
}

// "YYYY-MM-DD HH:MM JST" — shown next to the branch name in the top-right corner.
function jstTimestamp(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatted} JST`;
}

// Hashed bundles change name on every build; drop the previous ones so stale
// files never accumulate in the published site.
function cleanPreviousAssets() {
  return {
    name: 'clean-previous-assets',
    apply: 'build',
    buildStart() {
      rmSync(assetsDir, { recursive: true, force: true });
    },
  };
}

// Writing the build next to app/ (outDir = parent of root) is intentional here, so drop
// Vite's generic warning about it instead of printing it on every build.
const logger = createLogger();
const warn = logger.warn;
logger.warn = (message, options) => {
  if (message.includes('build.outDir must not be the same directory of root')) return;
  warn(message, options);
};

export default defineConfig({
  customLogger: logger,
  root: path.join(repoRoot, 'app'),
  base: './',
  // The favicon is imported from index.html as a regular asset, so no public dir is needed
  // (one inside outDir would make Vite warn and copy it to the repo root).
  publicDir: false,
  plugins: [react(), cleanPreviousAssets()],
  define: {
    // Overridable so a build can be reproduced byte-for-byte.
    __APP_BRANCH__: JSON.stringify(process.env.APP_BRANCH ?? currentBranch()),
    __APP_BUILD_TIME__: JSON.stringify(process.env.APP_BUILD_TIME ?? jstTimestamp()),
  },
  build: {
    outDir: repoRoot,
    emptyOutDir: false,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1024,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
