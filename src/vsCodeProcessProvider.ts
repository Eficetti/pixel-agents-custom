import * as vscode from 'vscode';

import type { AgentProcess, ProcessProvider } from '../core/src/interfaces.js';
import { wrapTerminal } from './vscodeTerminalAdapter.js';

/**
 * VS Code implementation of ProcessProvider — wraps vscode.window terminal APIs.
 * Uses the shared adapter cache from vscodeTerminalAdapter so reference equality
 * holds for core-side comparisons (`agent.processRef === provider.getActive()`).
 *
 * `spawn()` is intentionally not implemented here: VS Code terminal creation
 * requires caller-specific options (iconPath, cwd, env, etc.) that the agent
 * manager already configures. Legacy callers continue to use
 * `vscode.window.createTerminal()` directly and wrap the result with
 * `wrapTerminal()`. When Task 6 (agentManager extraction) lands, the spawn path
 * moves entirely through this provider.
 */
export class VsCodeProcessProvider implements ProcessProvider {
  private activeChangedCallbacks: Array<(process: AgentProcess | undefined) => void> = [];

  constructor() {
    vscode.window.onDidChangeActiveTerminal((t) => {
      const process = wrapTerminal(t);
      for (const cb of this.activeChangedCallbacks) cb(process);
    });
  }

  spawn(_name: string, _command: string, _args: string[], _cwd: string): AgentProcess {
    throw new Error(
      'VsCodeProcessProvider.spawn() is not yet implemented; use vscode.window.createTerminal + wrapTerminal for now.',
    );
  }

  listAll(): AgentProcess[] {
    return vscode.window.terminals.map((t) => wrapTerminal(t)!);
  }

  getActive(): AgentProcess | undefined {
    return wrapTerminal(vscode.window.activeTerminal);
  }

  onActiveChanged(callback: (process: AgentProcess | undefined) => void): void {
    this.activeChangedCallbacks.push(callback);
  }
}
