import type * as vscode from 'vscode';

import type { StateStore } from '../core/src/interfaces.js';

/**
 * Wraps a vscode.Memento (globalState or workspaceState) as a StateStore.
 * Keeps core/agentManager portable: CLI hosts provide a FileStateStore instead.
 */
export class VsCodeStateStore implements StateStore {
  constructor(private readonly memento: vscode.Memento) {}

  get<T>(key: string, defaultValue: T): T {
    return this.memento.get<T>(key, defaultValue);
  }

  update(key: string, value: unknown): Promise<void> {
    // vscode.Memento.update returns Thenable<void>; Promise.resolve coerces to Promise.
    return Promise.resolve(this.memento.update(key, value));
  }
}
