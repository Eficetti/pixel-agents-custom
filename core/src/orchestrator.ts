/**
 * Orchestrator — wires core modules (agents, watchers, timers, assets) behind
 * a host-agnostic facade. VS Code's PixelAgentsViewProvider and the CLI host
 * both construct an Orchestrator and delegate message handling to it.
 *
 * This file is intentionally minimal: it owns the shared state and provides
 * a small action API. Task 15 will migrate the remaining PixelAgentsViewProvider
 * message cases here.
 */
import type * as fs from 'fs';

import {
  launchNewAgent,
  persistAgents as corePersistAgents,
  removeAgent as coreRemoveAgent,
  restoreAgents as coreRestoreAgents,
  sendCurrentAgentStatuses,
  sendExistingAgents,
} from './agentManager.js';
import type {
  DialogProvider,
  MessageSender,
  ProcessProvider,
  StateStore,
  WorkspaceProvider,
} from './interfaces.js';
import type { AgentState } from './types.js';

export interface OrchestratorConfig {
  processProvider: ProcessProvider;
  workspaceProvider: WorkspaceProvider;
  globalState: StateStore;
  workspaceState: StateStore;
  dialogProvider: DialogProvider;
  /** Filesystem root containing assets/. */
  assetsRoot: string;
  /** Prefix for spawned-process names (e.g. "Claude Code"). */
  processNamePrefix: string;
  /** CLI command (e.g. "claude"). */
  command: string;
  /** Build CLI args for a new session. Caller owns flags like --dangerously-skip-permissions. */
  buildArgs: (sessionId: string) => string[];
}

export interface IncomingMessage {
  type: string;
  [key: string]: unknown;
}

export class Orchestrator {
  // Agent state
  readonly agents = new Map<number, AgentState>();
  readonly nextAgentId = { current: 1 };
  readonly nextTerminalIndex = { current: 1 };
  readonly activeAgentId = { current: null as number | null };

  // Per-agent timers and watchers
  readonly fileWatchers = new Map<number, fs.FSWatcher>();
  readonly pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
  readonly waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>();

  // Project scanning
  readonly knownJsonlFiles = new Set<string>();
  readonly projectScanTimer = { current: null as ReturnType<typeof setInterval> | null };

  private messageSender: MessageSender | undefined;

  constructor(readonly config: OrchestratorConfig) {}

  setMessageSender(sender: MessageSender | undefined): void {
    this.messageSender = sender;
  }

  getMessageSender(): MessageSender | undefined {
    return this.messageSender;
  }

  /** Launch a new Claude agent (terminal or CLI child_process, per provider). */
  async launchAgent(folderPath?: string): Promise<void> {
    await launchNewAgent(
      this.nextAgentId,
      this.nextTerminalIndex,
      this.agents,
      this.activeAgentId,
      this.knownJsonlFiles,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      this.projectScanTimer,
      () => this.persistAgents(),
      {
        processProvider: this.config.processProvider,
        workspaceProvider: this.config.workspaceProvider,
        messageSender: this.messageSender,
        processNamePrefix: this.config.processNamePrefix,
        command: this.config.command,
        buildArgs: this.config.buildArgs,
      },
      folderPath,
    );
  }

  focusAgent(agentId: number): void {
    this.agents.get(agentId)?.processRef?.show();
  }

  closeAgent(agentId: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.processRef?.kill();
    coreRemoveAgent(
      agentId,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      () => this.persistAgents(),
    );
    this.messageSender?.postMessage({ type: 'agentClosed', id: agentId });
  }

  persistAgents(): void {
    void corePersistAgents(this.agents, this.config.workspaceState);
  }

  restoreAgents(): void {
    coreRestoreAgents(
      this.config.workspaceState,
      this.config.processProvider,
      this.nextAgentId,
      this.nextTerminalIndex,
      this.agents,
      this.knownJsonlFiles,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      this.projectScanTimer,
      this.activeAgentId,
      this.messageSender,
      () => this.persistAgents(),
    );
  }

  /**
   * Minimal message dispatcher. Host-specific provider (PixelAgentsViewProvider,
   * CLI host) can call this for the core subset and fall through to its own
   * handlers for the remaining cases. Task 15 moves more cases here.
   */
  async handleMessage(msg: IncomingMessage): Promise<boolean> {
    switch (msg.type) {
      case 'webviewReady':
        sendExistingAgents(this.agents, this.config.workspaceState, this.messageSender);
        sendCurrentAgentStatuses(this.agents, this.messageSender);
        return true;
      case 'openClaude':
        await this.launchAgent(msg.folderPath as string | undefined);
        return true;
      case 'focusAgent':
        this.focusAgent(msg.id as number);
        return true;
      case 'closeAgent':
        this.closeAgent(msg.id as number);
        return true;
      default:
        return false; // Not handled — let caller try its own cases.
    }
  }

  /** Clear every timer + watcher. Host should call this on deactivate/exit. */
  dispose(): void {
    for (const t of this.fileWatchers.values()) t.close();
    this.fileWatchers.clear();
    for (const t of this.pollingTimers.values()) clearInterval(t);
    this.pollingTimers.clear();
    for (const t of this.waitingTimers.values()) clearTimeout(t);
    this.waitingTimers.clear();
    for (const t of this.permissionTimers.values()) clearTimeout(t);
    this.permissionTimers.clear();
    for (const t of this.jsonlPollTimers.values()) clearInterval(t);
    this.jsonlPollTimers.clear();
    if (this.projectScanTimer.current) {
      clearInterval(this.projectScanTimer.current);
      this.projectScanTimer.current = null;
    }
  }
}
