import * as vscode from 'vscode';

import type { WorkspaceFolder, WorkspaceProvider } from '../core/src/interfaces.js';

/** Wraps vscode.workspace as a WorkspaceProvider (folders + primary project dir). */
export class VsCodeWorkspaceProvider implements WorkspaceProvider {
  getFolders(): WorkspaceFolder[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return [];
    return folders.map((f) => ({ name: f.name, path: f.uri.fsPath }));
  }

  getProjectDir(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
