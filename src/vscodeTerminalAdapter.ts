import * as vscode from 'vscode';

import type { AgentProcess } from '../core/src/interfaces.js' with { 'resolution-mode': 'import' };

/**
 * Wraps a vscode.Terminal as an AgentProcess so AgentState.processRef can hold it.
 * VS Code-specific callers can access the underlying terminal via `.terminal`.
 */
export class VsCodeTerminalAdapter implements AgentProcess {
  constructor(public readonly terminal: vscode.Terminal) {}

  get id(): string {
    // vscode.Terminal has no stable string ID; use the terminal name + creation index.
    // For identity comparison, callers should compare `.terminal` directly.
    return this.terminal.name;
  }

  get name(): string {
    return this.terminal.name;
  }

  get pid(): number | undefined {
    // processId is a Thenable in VS Code, so we can't return it synchronously.
    // Return undefined; callers that need PID use the terminal API directly.
    return undefined;
  }

  get exited(): boolean {
    return this.terminal.exitStatus !== undefined;
  }

  show(): void {
    this.terminal.show();
  }

  kill(): void {
    this.terminal.dispose();
  }

  onExit(callback: (code: number | undefined) => void): void {
    vscode.window.onDidCloseTerminal((t) => {
      if (t === this.terminal) {
        callback(t.exitStatus?.code);
      }
    });
  }
}

/** Wrap a vscode.Terminal in an adapter, or return undefined if terminal is undefined. */
export function wrapTerminal(
  terminal: vscode.Terminal | undefined,
): VsCodeTerminalAdapter | undefined {
  return terminal !== undefined ? new VsCodeTerminalAdapter(terminal) : undefined;
}

/** Extract the underlying vscode.Terminal from a processRef, if it is a VsCodeTerminalAdapter. */
export function unwrapTerminal(processRef: AgentProcess | undefined): vscode.Terminal | undefined {
  if (processRef instanceof VsCodeTerminalAdapter) {
    return processRef.terminal;
  }
  return undefined;
}
