/**
 * VS Code adapter for core/fileWatcher. Wraps vscode.Webview → MessageSender and
 * supplies a VsCodeProcessProvider (with name prefix filter) for terminal adoption.
 *
 * See core/src/fileWatcher.ts for implementation + dual-mode architecture docs.
 */
import type * as fs from 'fs';
import type * as vscode from 'vscode';

import * as core from '../core/src/fileWatcher.js';
import type { MessageSender } from '../core/src/interfaces.js';
import type { AgentState } from '../core/src/types.js';
import { removeAgent } from './agentManager.js';
import { TERMINAL_NAME_PREFIX } from './constants.js';
import { VsCodeProcessProvider } from './vsCodeProcessProvider.js';

// Re-exports (values + type-free helpers).
export const dismissedJsonlFiles = core.dismissedJsonlFiles;
export const seededMtimes = core.seededMtimes;
export const isTrackedProjectDir = core.isTrackedProjectDir;
export const setTeammateRemovalCallback = core.setTeammateRemovalCallback;
export const setTeamProvider = core.setTeamProvider;
export const scanTeamConfigsForRemovals = core.scanTeamConfigsForRemovals;

// Register removeAgent with core (breaks circular dep). Done once at module load.
core.setRemoveAgentFn(removeAgent);

// Lazy singleton — first caller that needs adoption creates the provider.
let processProvider: VsCodeProcessProvider | undefined;
function getProcessProvider(): VsCodeProcessProvider {
  processProvider ??= new VsCodeProcessProvider();
  return processProvider;
}

const toSender = (webview: vscode.Webview | undefined): MessageSender | undefined =>
  webview ? { postMessage: (msg: unknown) => webview.postMessage(msg) } : undefined;

export function startFileWatching(
  agentId: number,
  filePath: string,
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
): void {
  core.startFileWatching(
    agentId,
    filePath,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
  );
}

export function readNewLines(
  agentId: number,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
): void {
  core.readNewLines(agentId, agents, waitingTimers, permissionTimers, toSender(webview));
}

export function ensureProjectScan(
  projectDir: string,
  knownJsonlFiles: Set<string>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  activeAgentIdRef: { current: number | null },
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  onAgentCreated?: (agent: AgentState) => void,
  hooksEnabledRef?: { current: boolean },
): void {
  core.ensureProjectScan(
    projectDir,
    knownJsonlFiles,
    projectScanTimerRef,
    activeAgentIdRef,
    nextAgentIdRef,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
    persistAgents,
    onAgentCreated,
    hooksEnabledRef,
    { processProvider: getProcessProvider(), processNamePrefix: TERMINAL_NAME_PREFIX },
  );
}

export function scanForTeammateFiles(
  projectDir: string,
  sessionId: string,
  parentAgentId: number,
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  onAgentCreated?: (agent: AgentState) => void,
): void {
  core.scanForTeammateFiles(
    projectDir,
    sessionId,
    parentAgentId,
    nextAgentIdRef,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
    persistAgents,
    onAgentCreated,
  );
}

export function scanAllTeammateFiles(
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  onAgentCreated?: (agent: AgentState) => void,
): void {
  core.scanAllTeammateFiles(
    nextAgentIdRef,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
    persistAgents,
    onAgentCreated,
  );
}

export function adoptExternalSessionFromHook(
  sessionId: string,
  transcriptPath: string | undefined,
  cwd: string,
  knownJsonlFiles: Set<string>,
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  onAgentCreated?: (agent: AgentState) => void,
): void {
  core.adoptExternalSessionFromHook(
    sessionId,
    transcriptPath,
    cwd,
    knownJsonlFiles,
    nextAgentIdRef,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
    persistAgents,
    onAgentCreated,
  );
}

export function startExternalSessionScanning(
  projectDir: string,
  knownJsonlFiles: Set<string>,
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  watchAllSessionsRef?: { current: boolean },
  hooksEnabledRef?: { current: boolean },
): ReturnType<typeof setInterval> {
  return core.startExternalSessionScanning(
    projectDir,
    knownJsonlFiles,
    nextAgentIdRef,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    toSender(webview),
    persistAgents,
    watchAllSessionsRef,
    hooksEnabledRef,
  );
}

export function startStaleExternalAgentCheck(
  agents: Map<number, AgentState>,
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  hooksEnabledRef?: { current: boolean },
): ReturnType<typeof setInterval> {
  return core.startStaleExternalAgentCheck(
    agents,
    knownJsonlFiles,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    toSender(webview),
    persistAgents,
    hooksEnabledRef,
  );
}

export function reassignAgentToFile(
  agentId: number,
  newFilePath: string,
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
): void {
  core.reassignAgentToFile(
    agentId,
    newFilePath,
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    toSender(webview),
    persistAgents,
  );
}
