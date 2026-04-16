const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const cliOnly = process.argv.includes('--cli');

/**
 * Copy assets folder to dist/assets
 */
function copyAssets() {
  const srcDir = path.join(__dirname, 'webview-ui', 'public', 'assets');
  const dstDir = path.join(__dirname, 'dist', 'assets');

  if (fs.existsSync(srcDir)) {
    // Remove existing dist/assets if present
    if (fs.existsSync(dstDir)) {
      fs.rmSync(dstDir, { recursive: true });
    }

    // Copy recursively
    fs.cpSync(srcDir, dstDir, { recursive: true });
    console.log('✓ Copied assets/ → dist/assets/');
  } else {
    console.log('ℹ️  assets/ folder not found (optional)');
  }
}

/**
 * Bundle hook scripts (TypeScript) to dist/hooks via esbuild.
 * Produces a self-contained CJS file with shebang for Claude Code to execute.
 */
function buildHooks() {
  const entry = path.join(
    __dirname,
    'server',
    'src',
    'providers',
    'file',
    'hooks',
    'claude-hook.ts',
  );
  if (!fs.existsSync(entry)) return;
  require('esbuild').buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outdir: path.join(__dirname, 'dist', 'hooks'),
    banner: { js: '#!/usr/bin/env node' },
  });
  console.log('✓ Built hooks/ → dist/hooks/');
}

/**
 * Bundle the CLI entry point (cli/src/index.ts) into cli/dist/index.js,
 * then copy the built webview + assets alongside so the host can serve them.
 * electron is marked external — Optional peer, not required at build time.
 */
function buildCli() {
  const entry = path.join(__dirname, 'cli', 'src', 'index.ts');
  if (!fs.existsSync(entry)) return;
  const cliDistDir = path.join(__dirname, 'cli', 'dist');
  require('esbuild').buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: path.join(cliDistDir, 'index.js'),
    // Node built-ins + npm deps (ws, electron) stay external. CJS inside ESM
    // bundles breaks `require('events')` from ws; keeping packages external
    // also shrinks the bundle and respects cli/node_modules at runtime.
    packages: 'external',
    external: ['electron'],
    // Shebang lives in cli/src/index.ts; esbuild preserves it — no banner needed.
    minify: production,
    sourcemap: !production,
  });
  console.log('✓ Built cli/ → cli/dist/index.js');

  // Copy built webview (from webview-ui's vite output) into cli/dist/webview/
  const webviewSrc = path.join(__dirname, 'dist', 'webview');
  const webviewDst = path.join(cliDistDir, 'webview');
  if (fs.existsSync(webviewSrc)) {
    if (fs.existsSync(webviewDst)) fs.rmSync(webviewDst, { recursive: true });
    fs.cpSync(webviewSrc, webviewDst, { recursive: true });
    console.log('✓ Copied dist/webview/ → cli/dist/webview/');
  } else {
    console.warn('⚠️  dist/webview/ not found — run `npm run build:webview` first.');
  }

  // Copy asset bundle into cli/dist/assets/
  const assetsSrc = path.join(__dirname, 'webview-ui', 'public', 'assets');
  const assetsDst = path.join(cliDistDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    if (fs.existsSync(assetsDst)) fs.rmSync(assetsDst, { recursive: true });
    fs.cpSync(assetsSrc, assetsDst, { recursive: true });
    console.log('✓ Copied assets/ → cli/dist/assets/');
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  if (cliOnly) {
    // CLI-only build path: skip the extension bundle entirely.
    buildCli();
    return;
  }
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    // Copy assets and hooks after build
    copyAssets();
    buildHooks();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
