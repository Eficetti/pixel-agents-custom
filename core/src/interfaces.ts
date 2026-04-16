/**
 * Abstract message sender — replaces vscode.Webview.postMessage().
 * Implemented by VS Code (webview.postMessage), WebSocket (ws.send), etc.
 */
export interface MessageSender {
  postMessage(msg: unknown): void;
}

/**
 * Abstract process provider — replaces vscode.window.createTerminal().
 * VS Code creates terminals; CLI spawns child_process.
 */
export interface AgentProcess {
  readonly id: string;
  readonly name: string;
  readonly pid: number | undefined;
  readonly exited: boolean;
  show(): void;
  kill(): void;
  onExit(callback: (code: number | undefined) => void): void;
}

export interface ProcessProvider {
  spawn(name: string, command: string, args: string[], cwd: string): AgentProcess;
  listAll(): AgentProcess[];
  getActive(): AgentProcess | undefined;
  onActiveChanged(callback: (process: AgentProcess | undefined) => void): void;
}

/**
 * Key-value state persistence — replaces vscode.ExtensionContext.globalState / workspaceState.
 */
export interface StateStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
}

/**
 * Workspace folder info — replaces vscode.workspace.workspaceFolders.
 */
export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface WorkspaceProvider {
  getFolders(): WorkspaceFolder[];
  getProjectDir(): string | undefined;
}

/**
 * Dialog provider — replaces vscode.window.showSaveDialog etc.
 * CLI/browser implementations can use file picker or CLI args.
 */
export interface DialogProvider {
  showSaveDialog(defaultName: string): Promise<string | undefined>;
  showOpenDialog(filters?: Record<string, string[]>): Promise<string | undefined>;
  showDirectoryDialog(): Promise<string | undefined>;
  showWarning(message: string): void;
  showInfo(message: string): void;
  showError(message: string): void;
}
