/**
 * VS Code adapter for core/agentManager. Wraps vscode.Webview → MessageSender,
 * vscode.ExtensionContext → StateStore, vscode.workspace → WorkspaceProvider,
 * and supplies a VsCodeProcessProvider for terminal spawn/adoption.
 *
 * sendLayout remains here (not in core) because layoutPersistence still has
 * vscode deps; it will migrate when Task 7 lands.
 */
import type * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

import * as core from '../core/src/agentManager.js';
import type { MessageSender } from '../core/src/interfaces.js';
import type { AgentState } from '../core/src/types.js';
import { TERMINAL_NAME_PREFIX } from './constants.js';
import { migrateAndLoadLayout } from './layoutPersistence.js';
import { VsCodeProcessProvider } from './vsCodeProcessProvider.js';
import { VsCodeStateStore } from './vsCodeStateStore.js';
import { VsCodeWorkspaceProvider } from './vsCodeWorkspaceProvider.js';

let processProvider: VsCodeProcessProvider | undefined;
function getProcessProvider(): VsCodeProcessProvider {
  processProvider ??= new VsCodeProcessProvider();
  return processProvider;
}

const workspaceProvider = new VsCodeWorkspaceProvider();

const toSender = (webview: vscode.Webview | undefined): MessageSender | undefined =>
  webview ? { postMessage: (msg: unknown) => webview.postMessage(msg) } : undefined;

export function getProjectDirPath(cwd?: string): string {
  const resolved = cwd || workspaceProvider.getProjectDir() || os.homedir();
  return core.getProjectDirPath(resolved);
}

export async function launchNewTerminal(
  nextAgentIdRef: { current: number },
  nextTerminalIndexRef: { current: number },
  agents: Map<number, AgentState>,
  activeAgentIdRef: { current: number | null },
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  folderPath?: string,
  bypassPermissions?: boolean,
): Promise<void> {
  return core.launchNewAgent(
    nextAgentIdRef,
    nextTerminalIndexRef,
    agents,
    activeAgentIdRef,
    knownJsonlFiles,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    projectScanTimerRef,
    persistAgents,
    {
      processProvider: getProcessProvider(),
      workspaceProvider,
      messageSender: toSender(webview),
      processNamePrefix: TERMINAL_NAME_PREFIX,
      command: 'claude',
      buildArgs: (sessionId) =>
        bypassPermissions
          ? ['--session-id', sessionId, '--dangerously-skip-permissions']
          : ['--session-id', sessionId],
    },
    folderPath,
  );
}

export function removeAgent(
  agentId: number,
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  persistAgents: () => void,
): void {
  core.removeAgent(
    agentId,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    persistAgents,
  );
}

export function persistAgents(
  agents: Map<number, AgentState>,
  context: vscode.ExtensionContext,
): void {
  // Fire-and-forget: the original vscode-based signature was sync (Thenable).
  void core.persistAgents(agents, new VsCodeStateStore(context.workspaceState));
}

export function restoreAgents(
  context: vscode.ExtensionContext,
  nextAgentIdRef: { current: number },
  nextTerminalIndexRef: { current: number },
  agents: Map<number, AgentState>,
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  activeAgentIdRef: { current: number | null },
  webview: vscode.Webview | undefined,
  doPersist: () => void,
): void {
  core.restoreAgents(
    new VsCodeStateStore(context.workspaceState),
    getProcessProvider(),
    nextAgentIdRef,
    nextTerminalIndexRef,
    agents,
    knownJsonlFiles,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    projectScanTimerRef,
    activeAgentIdRef,
    toSender(webview),
    doPersist,
  );
}

export function sendExistingAgents(
  agents: Map<number, AgentState>,
  context: vscode.ExtensionContext,
  webview: vscode.Webview | undefined,
): void {
  core.sendExistingAgents(agents, new VsCodeStateStore(context.workspaceState), toSender(webview));
}

export function sendCurrentAgentStatuses(
  agents: Map<number, AgentState>,
  webview: vscode.Webview | undefined,
): void {
  core.sendCurrentAgentStatuses(agents, toSender(webview));
}

/** Remains VS Code-specific: depends on layoutPersistence which still uses vscode. */
export function sendLayout(
  context: vscode.ExtensionContext,
  webview: vscode.Webview | undefined,
  defaultLayout?: Record<string, unknown> | null,
): void {
  if (!webview) return;
  const result = migrateAndLoadLayout(context, defaultLayout);
  webview.postMessage({
    type: 'layoutLoaded',
    layout: result?.layout ?? null,
    wasReset: result?.wasReset ?? false,
  });
}
