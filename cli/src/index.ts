#!/usr/bin/env node
/**
 * Pixel Agents CLI entry point.
 *
 * Spins up the Orchestrator with CLI-side providers (child_process,
 * FileStateStore, filesystem workspace provider, console dialog provider)
 * and serves the webview SPA over HTTP+WebSocket. `--target electron`
 * launches an Electron BrowserWindow instead of opening the default browser.
 */
import { exec } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DialogProvider, WorkspaceProvider } from '../../core/src/interfaces.js';
import { Orchestrator } from '../../core/src/orchestrator.js';
import { startHost } from './host.js';
import { CliProcessProvider } from './processProvider.js';
import { FileStateStore } from './stateStore.js';

interface Args {
  target: 'browser' | 'electron';
  port: number;
  project: string;
}

function parseArgs(argv: string[]): Args {
  let target: 'browser' | 'electron' = 'browser';
  let port = 3000;
  let project = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--target':
        target = argv[++i] === 'electron' ? 'electron' : 'browser';
        break;
      case '--port':
        port = parseInt(argv[++i]!, 10);
        break;
      case '--project':
        project = path.resolve(argv[++i]!);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return { target, port, project };
}

function printHelp(): void {
  console.log(`
pixel-agents — pixel art visualization for Claude Code agents

Usage:
  pixel-agents [--target browser|electron] [--port 3000] [--project .]

Options:
  --target    browser (default) or electron — where to render the webview
  --port      HTTP+WebSocket port (default 3000)
  --project   Project root to scan for sessions (default: cwd)
  --help      Show this message
`);
}

const cliDialogProvider: DialogProvider = {
  async showSaveDialog(defaultName: string) {
    console.log(`[pixel-agents] Save dialog requested: ${defaultName} (no-op in CLI)`);
    return undefined;
  },
  async showOpenDialog() {
    return undefined;
  },
  async showDirectoryDialog() {
    return undefined;
  },
  showWarning(msg: string) {
    console.warn(`[pixel-agents] ${msg}`);
  },
  showInfo(msg: string) {
    console.log(`[pixel-agents] ${msg}`);
  },
  showError(msg: string) {
    console.error(`[pixel-agents] ERROR: ${msg}`);
  },
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const pixelAgentsDir = path.join(homeDir, '.pixel-agents');

  const workspaceProvider: WorkspaceProvider = {
    getFolders: () => [{ name: path.basename(args.project), path: args.project }],
    getProjectDir: () => args.project,
  };

  // When bundled, __dirname points to cli/dist. Resolve sibling webview and
  // assets directories relative to that.
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const webviewDir = path.join(distDir, 'webview');
  const assetsDir = path.join(distDir, 'assets');

  const orchestrator = new Orchestrator({
    processProvider: new CliProcessProvider(),
    workspaceProvider,
    globalState: new FileStateStore(path.join(pixelAgentsDir, 'state.json')),
    workspaceState: new FileStateStore(path.join(pixelAgentsDir, 'workspaces', 'agents.json')),
    dialogProvider: cliDialogProvider,
    assetsRoot: distDir,
    processNamePrefix: 'Claude Code',
    command: 'claude',
    buildArgs: (sessionId) => ['--session-id', sessionId],
  });

  if (args.target === 'electron') {
    const { startElectron } = await import('./electron.js');
    await startElectron({ port: args.port, webviewDir, assetsDir, orchestrator });
    return;
  }

  const host = await startHost({
    port: args.port,
    webviewDir,
    assetsDir,
    orchestrator,
  });

  const url = `http://localhost:${host.port}`;
  const openCmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(openCmd, (err) => {
    if (err) console.warn(`[pixel-agents] Could not auto-open browser: ${err.message}`);
  });

  console.log(`[pixel-agents] Running at ${url}`);
  console.log(`[pixel-agents] Press Ctrl+C to stop`);

  process.on('SIGINT', () => {
    console.log('\n[pixel-agents] Shutting down...');
    orchestrator.dispose();
    void host.close().then(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error('[pixel-agents] Fatal error:', err);
  process.exit(1);
});
