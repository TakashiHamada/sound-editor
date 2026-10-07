import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createLogger, defineConfig } from 'vite';

// The repo root *is* the GitHub Pages site: `npm run build` compiles app/ and
// writes index.html + assets/ next to this file. Source lives only under app/.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

function git(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

// Branch name for the version banner. A detached HEAD (CI checkout, rebase) has no branch, so
// fall back to the CI-provided ref, then to the short commit hash.
function currentBranch() {
  try {
    const branch = git('rev-parse --abbrev-ref HEAD');
    if (branch !== 'HEAD') return branch;
    return (
      process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse --short HEAD')
    );
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

// Build-output safety for an outDir that contains the source tree:
// - refuses `emptyOutDir` when outDir is the repo root (Vite would delete app/, tests/, …);
// - once the bundle has been written successfully, deletes files in the assets folder that this
//   build did not emit (hashed names change every build). A failed build leaves the previous,
//   still-consistent index.html + assets/ untouched.
function manageBuildOutput() {
  let outDir;
  let assetsDir;
  return {
    name: 'manage-build-output',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      assetsDir = path.join(outDir, config.build.assetsDir);
      const containsSource = !path.relative(outDir, config.root).startsWith('..');
      if (config.build.emptyOutDir && containsSource)
        throw new Error(
          `Refusing to build with emptyOutDir into ${outDir}: it contains the source tree.`,
        );
    },
    writeBundle(_options, bundle) {
      if (!existsSync(assetsDir)) return;
      const emitted = new Set(Object.keys(bundle).map((name) => path.join(outDir, name)));
      for (const name of readdirSync(assetsDir)) {
        const file = path.join(assetsDir, name);
        if (!emitted.has(file)) rmSync(file, { recursive: true, force: true });
      }
    },
  };
}

// Writing the build next to app/ (outDir = parent of root) is intentional here, so drop
// Vite's generic warning about it instead of printing it on every build. (The dangerous case,
// emptyOutDir, is refused by manageBuildOutput above.)
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
  plugins: [react(), manageBuildOutput()],
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
