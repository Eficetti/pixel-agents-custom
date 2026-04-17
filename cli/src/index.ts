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

import { adoptExternalSessionFromHook } from '../../core/src/fileWatcher.js';
import type { DialogProvider, WorkspaceProvider } from '../../core/src/interfaces.js';
import { Orchestrator } from '../../core/src/orchestrator.js';
import { HookEventHandler } from '../../server/src/hookEventHandler.js';
import type { HookEvent } from '../../server/src/hookEventHandler.js';
import {
  areHooksInstalled,
  installHooks,
} from '../../server/src/providers/hook/claude/claudeHookInstaller.js';
import { claudeProvider, copyHookScript } from '../../server/src/providers/index.js';
import { PixelAgentsServer } from '../../server/src/server.js';
import { startHost } from './host.js';
import {
  readHooksConfig,
  resolveDecision,
  shouldAutoInstall,
  shouldPromptUser,
  writeHooksDecision,
} from './hooksBootstrap.js';
import { CliProcessProvider } from './processProvider.js';
import { FileStateStore } from './stateStore.js';

interface Args {
  target: 'browser' | 'electron';
  port: number;
  project: string;
  hooks: boolean;
}

function parseArgs(argv: string[]): Args {
  let target: 'browser' | 'electron' = 'browser';
  let port = 3000;
  let project = process.cwd();
  let hooks = true;

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
      case '--no-hooks':
        hooks = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return { target, port, project, hooks };
}

function printHelp(): void {
  console.log(`
pixel-agents — pixel art visualization for Claude Code agents

Usage:
  pixel-agents [--target browser|electron] [--port 3000] [--project .] [--no-hooks]

Options:
  --target    browser (default) or electron — where to render the webview
  --port      HTTP+WebSocket port (default 3000)
  --project   Project root to scan for sessions (default: cwd)
  --no-hooks  Skip hook auto-install (falls back to JSONL polling)
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

/**
 * Copy the hook script from the CLI bundle to ~/.pixel-agents/hooks/ and
 * install hook entries in ~/.claude/settings.json.
 *
 * `copyHookScript` expects an `extensionPath` whose `dist/hooks/` subdirectory
 * contains the built hook script. In the CLI bundle, `distDir` is `cli/dist`,
 * so passing its parent (`cli/`) satisfies `path.join(extensionPath, 'dist', 'hooks', ...)`.
 */
function doInstall(distDir: string): void {
  copyHookScript(path.join(distDir, '..'));
  installHooks();
}

async function runHooksBootstrap(
  args: Args,
  orchestrator: Orchestrator,
  distDir: string,
  configPath: string,
): Promise<void> {
  if (!args.hooks) {
    console.log('[pixel-agents] Hooks skipped (--no-hooks)');
    return;
  }
  const config = readHooksConfig(configPath);
  const installed = areHooksInstalled();

  if (shouldAutoInstall(config, installed)) {
    doInstall(distDir);
    return;
  }

  if (!shouldPromptUser(config, installed)) return;

  // Ask the user via webview. Waits up to 5min; resolves to decision or null on timeout.
  const decision = await orchestrator.requestDecision<'always' | 'once' | 'never'>(
    { type: 'hooksInstallPrompt' },
    'hooksInstallDecision',
  );
  if (!decision) return; // timeout: keep state as-is, user can retry next boot

  const resolved = resolveDecision(decision);
  await writeHooksDecision(configPath, resolved.persist);
  if (!resolved.install) return;

  try {
    doInstall(distDir);
    orchestrator.getMessageSender()?.postMessage({ type: 'hooksInstallResult', installed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pixel-agents] Hook install failed:', message);
    orchestrator.getMessageSender()?.postMessage({
      type: 'hooksInstallResult',
      installed: false,
      error: message,
    });
  }
}

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

  // Hook pipeline: PixelAgentsServer receives hook POSTs, HookEventHandler routes
  // them to agents. Both are instantiated even when --no-hooks is set, because
  // the hook install step is what --no-hooks gates; the server is cheap to run
  // and provides discovery via ~/.pixel-agents/server.json.
  const watchAllSessions = { current: false };
  const hookEventHandler = new HookEventHandler(
    orchestrator.agents,
    orchestrator.waitingTimers,
    orchestrator.permissionTimers,
    () => orchestrator.getMessageSender(),
    claudeProvider,
    watchAllSessions,
  );

  // When the hook handler detects a new external session (a `claude` started
  // in another terminal), create the agent on the Orchestrator and notify the
  // webview. Without this callback, hook events arrive but no minero appears.
  hookEventHandler.setLifecycleCallbacks({
    onExternalSessionDetected: (sessionId, transcriptPath, cwd) => {
      adoptExternalSessionFromHook(
        sessionId,
        transcriptPath,
        cwd,
        orchestrator.knownJsonlFiles,
        orchestrator.nextAgentId,
        orchestrator.agents,
        orchestrator.fileWatchers,
        orchestrator.pollingTimers,
        orchestrator.waitingTimers,
        orchestrator.permissionTimers,
        orchestrator.getMessageSender(),
        () => orchestrator.persistAgents(),
      );
    },
  });

  const hookServer = new PixelAgentsServer();
  hookServer.onHookEvent((providerId, event) =>
    hookEventHandler.handleEvent(providerId, event as HookEvent),
  );
  await hookServer.start();
  if (!args.hooks) {
    console.log('[pixel-agents] --no-hooks: hook auto-install skipped (JSONL polling active)');
  }

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

  // Don't await hooks bootstrap — let it run in background once webview connects.
  const configPath = path.join(pixelAgentsDir, 'config.json');
  void orchestrator
    .waitForWebview()
    .then(() => runHooksBootstrap(args, orchestrator, distDir, configPath));

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
    hookServer.stop();
    void host.close().then(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error('[pixel-agents] Fatal error:', err);
  process.exit(1);
});
