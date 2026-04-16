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

  spawn(name: string, command: string, args: string[], cwd: string): AgentProcess {
    const terminal = vscode.window.createTerminal({ name, cwd });
    // VS Code terminals are shells: send the command text so Claude runs inside.
    // CLI hosts would fork a child_process directly — this shell-dispatch quirk
    // stays contained in the VS Code adapter.
    const cmdLine = [command, ...args].join(' ');
    terminal.sendText(cmdLine);
    return wrapTerminal(terminal)!;
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
