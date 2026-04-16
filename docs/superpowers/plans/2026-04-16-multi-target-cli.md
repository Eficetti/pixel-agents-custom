# Multi-Target CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the pixel agents visualization from VS Code into a standalone CLI that can run in browser (`--target browser`) or native window (`--target electron`), while keeping the VS Code extension working.

**Architecture:** Create a `core/` package with VS Code-free business logic behind abstract interfaces (`MessageSender`, `ProcessProvider`, `StateStore`). The CLI host serves the webview SPA over HTTP and communicates via WebSocket. The VS Code extension becomes a thin adapter over the same core. Electron wraps the browser target in a `BrowserWindow`.

**Tech Stack:** TypeScript, Node.js, WebSocket (`ws`), Express (or raw http), Electron (optional), esbuild

**Spec:** `docs/superpowers/specs/2026-04-16-cave-mine-theme-design.md`

---

## File Structure

### New files

```
core/
  src/
    interfaces.ts          — MessageSender, ProcessProvider, StateStore, WorkspaceProvider
    types.ts               — AgentState, PersistedAgent (moved from src/types.ts, no vscode)
    agentManager.ts         — Agent lifecycle (extracted from src/agentManager.ts)
    fileWatcher.ts          — JSONL polling + session scanning (extracted from src/fileWatcher.ts)
    transcriptParser.ts     — JSONL parsing (extracted from src/transcriptParser.ts)
    timerManager.ts         — Timer logic (extracted from src/timerManager.ts)
    assetLoader.ts          — Asset loading (extracted from src/assetLoader.ts)
    orchestrator.ts         — Wires all core modules together (extracted from PixelAgentsViewProvider)
  package.json
  tsconfig.json

cli/
  src/
    index.ts               — CLI entry point, argument parsing, target dispatch
    host.ts                 — HTTP server + WebSocket + static file serving
    processProvider.ts      — Spawn Claude via child_process
    stateStore.ts           — File-based state persistence (~/.pixel-agents/)
    electron.ts             — Electron BrowserWindow wrapper
  package.json
  tsconfig.json

webview-ui/src/
  messageTransport.ts      — MessageTransport interface + VsCode/WebSocket implementations
```

### Modified files

```
src/types.ts               — Re-export from core/src/types.ts
src/agentManager.ts        — Thin wrapper calling core/
src/fileWatcher.ts          — Thin wrapper calling core/
src/transcriptParser.ts    — Thin wrapper calling core/
src/timerManager.ts        — Thin wrapper calling core/
src/assetLoader.ts         — Thin wrapper calling core/
src/PixelAgentsViewProvider.ts — Refactor to use core/orchestrator + VS Code adapters
webview-ui/src/hooks/useExtensionMessages.ts — Use MessageTransport instead of vscode directly
webview-ui/src/vscodeApi.ts — Detect environment, provide transport
esbuild.js                 — Add core/ and cli/ build targets
package.json               — Add cli build scripts
```

---

### Task 1: Create core/ package with interfaces

**Files:**
- Create: `core/package.json`
- Create: `core/tsconfig.json`
- Create: `core/src/interfaces.ts`

- [ ] **Step 1: Create core/package.json**

```json
{
  "name": "@pixel-agents/core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "check-types": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create core/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create core/src/interfaces.ts**

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add core/
git commit -m "feat: create core/ package with abstraction interfaces"
```

---

### Task 2: Extract types to core/

**Files:**
- Create: `core/src/types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Copy src/types.ts to core/src/types.ts**

Copy the file, then replace `vscode.Terminal` with `AgentProcess` from interfaces:

```typescript
import type { AgentProcess } from './interfaces.js';

export interface AgentState {
  id: number;
  processRef?: AgentProcess;  // was: terminalRef?: vscode.Terminal
  sessionId: string;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  // ... rest of fields unchanged (copy from src/types.ts as-is)
}

export interface PersistedAgent {
  // ... copy from src/types.ts as-is, no vscode deps
}
```

- [ ] **Step 2: Update src/types.ts to re-export from core**

```typescript
// src/types.ts — backward compatibility re-export
export type { AgentState, PersistedAgent } from '../core/src/types.js';
```

- [ ] **Step 3: Verify types compile**

Run: `cd core && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add core/src/types.ts src/types.ts
git commit -m "refactor: extract AgentState types to core/, remove vscode.Terminal dep"
```

---

### Task 3: Extract timerManager to core/

**Files:**
- Create: `core/src/timerManager.ts`
- Modify: `src/timerManager.ts`

- [ ] **Step 1: Copy src/timerManager.ts to core/src/timerManager.ts**

Replace all `vscode.Webview` parameters with `MessageSender`:

```typescript
import type { MessageSender } from './interfaces.js';
import type { AgentState } from './types.js';

export function clearAgentActivity(
  agent: AgentState,
  agentId: number,
  messageSender: MessageSender | undefined,
): void {
  // ... same logic, replace webview?.postMessage() with messageSender?.postMessage()
}

export function startPermissionTimer(
  agentId: number,
  agents: Map<number, AgentState>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  messageSender: MessageSender | undefined,
  delayMs: number,
): void {
  // ... same logic, replace webview with messageSender
}

// ... same for cancelPermissionTimer, startWaitingTimer, cancelWaitingTimer
```

- [ ] **Step 2: Update src/timerManager.ts to be a thin adapter**

```typescript
// src/timerManager.ts — VS Code adapter
import type * as vscode from 'vscode';
import type { MessageSender } from '../core/src/interfaces.js';
import {
  clearAgentActivity as coreClearAgentActivity,
  startPermissionTimer as coreStartPermissionTimer,
  cancelPermissionTimer as coreCancelPermissionTimer,
  startWaitingTimer as coreStartWaitingTimer,
  cancelWaitingTimer as coreCancelWaitingTimer,
} from '../core/src/timerManager.js';

function webviewToSender(webview: vscode.Webview | undefined): MessageSender | undefined {
  return webview ? { postMessage: (msg) => webview.postMessage(msg) } : undefined;
}

// Re-export with VS Code signature for backward compatibility
export function clearAgentActivity(agent, agentId, webview) {
  return coreClearAgentActivity(agent, agentId, webviewToSender(webview));
}
// ... same pattern for other functions
```

- [ ] **Step 3: Verify build**

Run: `npm run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add core/src/timerManager.ts src/timerManager.ts
git commit -m "refactor: extract timerManager to core/ with MessageSender interface"
```

---

### Task 4: Extract transcriptParser to core/

**Files:**
- Create: `core/src/transcriptParser.ts`
- Modify: `src/transcriptParser.ts`

- [ ] **Step 1: Copy src/transcriptParser.ts to core/src/transcriptParser.ts**

Replace `vscode.Webview` with `MessageSender` in all function signatures. The file has ~25 `webview?.postMessage()` calls — all become `messageSender?.postMessage()`. No logic changes needed.

Key signature changes:
```typescript
import type { MessageSender } from './interfaces.js';

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: Map<number, AgentState>,
  messageSender: MessageSender | undefined,
  // ... rest of params unchanged
): void { /* ... */ }
```

- [ ] **Step 2: Update src/transcriptParser.ts as thin adapter**

Same pattern as timerManager — wrap `vscode.Webview` → `MessageSender`.

- [ ] **Step 3: Run existing tests**

Run: `npm run test:server`
Expected: PASS (server tests should still pass)

- [ ] **Step 4: Commit**

```bash
git add core/src/transcriptParser.ts src/transcriptParser.ts
git commit -m "refactor: extract transcriptParser to core/ with MessageSender"
```

---

### Task 5: Extract fileWatcher to core/

**Files:**
- Create: `core/src/fileWatcher.ts`
- Modify: `src/fileWatcher.ts`

This is the largest module (1370 lines). Most is pure filesystem I/O.

- [ ] **Step 1: Copy to core/src/fileWatcher.ts and adapt**

Replace VS Code deps:
- `vscode.window.activeTerminal` → `processProvider.getActive()`
- `vscode.window.terminals` → `processProvider.listAll()`
- `agent.terminalRef.exitStatus` → `agent.processRef?.exited`
- All `webview?.postMessage()` → `messageSender?.postMessage()`

Key function signatures gain `processProvider` and `messageSender` params:

```typescript
import type { MessageSender, ProcessProvider } from './interfaces.js';

export function startFileWatching(
  agentId: number,
  filePath: string,
  agents: Map<number, AgentState>,
  messageSender: MessageSender | undefined,
  processProvider: ProcessProvider,
  // ... rest unchanged
): void { /* ... */ }
```

Terminal adoption section (~lines 374-432) uses `processProvider.listAll()` and `processProvider.getActive()` instead of vscode APIs.

- [ ] **Step 2: Update src/fileWatcher.ts as adapter**

Wrap VS Code terminal APIs into `ProcessProvider`:

```typescript
import * as vscode from 'vscode';
import type { ProcessProvider, AgentProcess } from '../core/src/interfaces.js';

function createVsCodeProcessProvider(): ProcessProvider {
  return {
    listAll: () => vscode.window.terminals.map(terminalToProcess),
    getActive: () => vscode.window.activeTerminal ? terminalToProcess(vscode.window.activeTerminal) : undefined,
    // ...
  };
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run check-types && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add core/src/fileWatcher.ts src/fileWatcher.ts
git commit -m "refactor: extract fileWatcher to core/ with ProcessProvider"
```

---

### Task 6: Extract agentManager to core/

**Files:**
- Create: `core/src/agentManager.ts`
- Modify: `src/agentManager.ts`

- [ ] **Step 1: Copy to core/src/agentManager.ts and adapt**

Key changes:
- `vscode.window.createTerminal()` → `processProvider.spawn()`
- `vscode.workspace.workspaceFolders` → `workspaceProvider.getFolders()`
- `context.workspaceState.get/update` → `stateStore.get/update`
- `agent.terminalRef` → `agent.processRef`

```typescript
import type { MessageSender, ProcessProvider, StateStore, WorkspaceProvider } from './interfaces.js';

export function launchNewTerminal(
  nextAgentIdRef: { current: number },
  agents: Map<number, AgentState>,
  processProvider: ProcessProvider,
  workspaceProvider: WorkspaceProvider,
  messageSender: MessageSender | undefined,
  // ... timer/watcher maps unchanged
): number {
  const agentId = nextAgentIdRef.current++;
  const sessionId = crypto.randomUUID();
  const cwd = workspaceProvider.getProjectDir() ?? process.cwd();

  const proc = processProvider.spawn(
    `Claude Code ${agentId}`,
    'claude',
    ['--session-id', sessionId],
    cwd,
  );

  const agent: AgentState = {
    id: agentId,
    processRef: proc,
    sessionId,
    projectDir: getProjectDirPath(cwd),
    // ... rest unchanged
  };

  agents.set(agentId, agent);
  // ... rest of launch logic unchanged
  return agentId;
}
```

- [ ] **Step 2: Update src/agentManager.ts as adapter**

Wrap VS Code APIs and delegate to core.

- [ ] **Step 3: Verify build**

Run: `npm run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add core/src/agentManager.ts src/agentManager.ts
git commit -m "refactor: extract agentManager to core/ with ProcessProvider"
```

---

### Task 7: Extract assetLoader to core/

**Files:**
- Create: `core/src/assetLoader.ts`
- Modify: `src/assetLoader.ts`

- [ ] **Step 1: Copy to core/src/assetLoader.ts**

The load functions (`loadFurnitureAssets`, `loadCharacterSprites`, `loadFloorTiles`, `loadWallTiles`, `loadDefaultLayout`) are already pure filesystem I/O — move as-is.

The send functions (`sendAssetsToWebview`, `sendCharacterSpritesToWebview`, etc.) change `vscode.Webview` → `MessageSender`:

```typescript
export function sendAssetsToWebview(
  messageSender: MessageSender,
  catalog: FurnitureAsset[],
  sprites: Record<string, SpriteData>,
): void {
  messageSender.postMessage({ type: 'furnitureAssetsLoaded', catalog, sprites });
}
```

- [ ] **Step 2: Update src/assetLoader.ts as adapter**

- [ ] **Step 3: Commit**

```bash
git add core/src/assetLoader.ts src/assetLoader.ts
git commit -m "refactor: extract assetLoader to core/ with MessageSender"
```

---

### Task 8: Create core/orchestrator.ts

**Files:**
- Create: `core/src/orchestrator.ts`

This is the key new file — extracts the wiring logic from `PixelAgentsViewProvider` into a reusable, VS Code-free orchestrator.

- [ ] **Step 1: Create core/src/orchestrator.ts**

```typescript
import type {
  MessageSender, ProcessProvider, StateStore,
  WorkspaceProvider, DialogProvider,
} from './interfaces.js';
import type { AgentState } from './types.js';
import { launchNewTerminal, removeAgent, persistAgents, restoreAgents } from './agentManager.js';
import { startFileWatching, ensureProjectScan } from './fileWatcher.js';
import { setHookProvider } from './transcriptParser.js';
import {
  loadFurnitureAssets, loadCharacterSprites, loadFloorTiles,
  loadWallTiles, loadDefaultLayout,
  sendAssetsToWebview, sendCharacterSpritesToWebview,
  sendFloorTilesToWebview, sendWallTilesToWebview,
} from './assetLoader.js';

export interface OrchestratorConfig {
  processProvider: ProcessProvider;
  workspaceProvider: WorkspaceProvider;
  globalState: StateStore;
  workspaceState: StateStore;
  dialogProvider: DialogProvider;
  assetsRoot: string;
  hookServerPort?: number;
}

export class Orchestrator {
  private agents = new Map<number, AgentState>();
  private messageSender: MessageSender | undefined;
  private nextAgentIdRef = { current: 1 };
  // ... timer/watcher maps

  constructor(private config: OrchestratorConfig) {}

  setMessageSender(sender: MessageSender): void {
    this.messageSender = sender;
  }

  handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case 'webviewReady':
        this.onWebviewReady();
        break;
      case 'openClaude':
        this.onOpenClaude(msg as { type: string; folderPath?: string });
        break;
      case 'focusAgent':
        this.onFocusAgent(msg as { type: string; id: number });
        break;
      case 'closeAgent':
        this.onCloseAgent(msg as { type: string; id: number });
        break;
      case 'saveLayout':
        this.onSaveLayout(msg);
        break;
      // ... remaining message types from PixelAgentsViewProvider.onDidReceiveMessage
    }
  }

  private onWebviewReady(): void {
    // Load and send assets
    // Restore agents
    // Start scanners
  }

  private onOpenClaude(msg: { type: string; folderPath?: string }): void {
    launchNewTerminal(
      this.nextAgentIdRef,
      this.agents,
      this.config.processProvider,
      this.config.workspaceProvider,
      this.messageSender,
      // ... maps
    );
  }

  private onFocusAgent(msg: { type: string; id: number }): void {
    const agent = this.agents.get(msg.id);
    agent?.processRef?.show();
  }

  private onCloseAgent(msg: { type: string; id: number }): void {
    const agent = this.agents.get(msg.id);
    agent?.processRef?.kill();
    removeAgent(msg.id, this.agents, /* ... */);
  }

  dispose(): void {
    // Clean up all timers, watchers, processes
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add core/src/orchestrator.ts
git commit -m "feat: create core/orchestrator.ts — VS Code-free agent coordinator"
```

---

### Task 9: Create webview MessageTransport abstraction

**Files:**
- Create: `webview-ui/src/messageTransport.ts`
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`
- Modify: `webview-ui/src/vscodeApi.ts`

- [ ] **Step 1: Create webview-ui/src/messageTransport.ts**

```typescript
export interface MessageTransport {
  postMessage(msg: unknown): void;
  onMessage(callback: (msg: unknown) => void): () => void;
}

/** VS Code webview transport (existing behavior) */
export class VsCodeTransport implements MessageTransport {
  private vscodeApi: ReturnType<typeof acquireVsCodeApi>;

  constructor() {
    this.vscodeApi = acquireVsCodeApi();
  }

  postMessage(msg: unknown): void {
    this.vscodeApi.postMessage(msg);
  }

  onMessage(callback: (msg: unknown) => void): () => void {
    const handler = (event: MessageEvent) => callback(event.data);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

/** WebSocket transport for browser/electron targets */
export class WebSocketTransport implements MessageTransport {
  private ws: WebSocket;
  private pending: unknown[] = [];
  private ready = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.ready = true;
      for (const msg of this.pending) {
        this.ws.send(JSON.stringify(msg));
      }
      this.pending = [];
    });
  }

  postMessage(msg: unknown): void {
    if (this.ready) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pending.push(msg);
    }
  }

  onMessage(callback: (msg: unknown) => void): () => void {
    const handler = (event: MessageEvent) => {
      callback(JSON.parse(event.data as string));
    };
    this.ws.addEventListener('message', handler);
    return () => this.ws.removeEventListener('message', handler);
  }
}

/** Auto-detect environment and create the right transport */
export function createTransport(): MessageTransport {
  if (typeof acquireVsCodeApi === 'function') {
    return new VsCodeTransport();
  }
  const wsUrl = `ws://${window.location.host}/ws`;
  return new WebSocketTransport(wsUrl);
}
```

- [ ] **Step 2: Update useExtensionMessages.ts**

Replace direct `vscode.postMessage()` calls with the injected transport. The message handler uses `window.addEventListener('message')` which already works for VS Code. For WebSocket, the transport's `onMessage` handles dispatch.

Change the hook to accept `transport: MessageTransport` as parameter:

```typescript
import type { MessageTransport } from '../messageTransport.js';

export function useExtensionMessages(
  officeStateRef: React.RefObject<OfficeState>,
  transport: MessageTransport,
) {
  useEffect(() => {
    const unsubscribe = transport.onMessage((msg) => {
      // ... existing message handler logic, unchanged
    });
    return unsubscribe;
  }, [transport]);

  // Replace vscode.postMessage(...) with transport.postMessage(...)
}
```

- [ ] **Step 3: Update vscodeApi.ts**

```typescript
import { createTransport, type MessageTransport } from './messageTransport.js';

export const transport: MessageTransport = createTransport();
```

- [ ] **Step 4: Verify webview builds**

Run: `cd webview-ui && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/messageTransport.ts webview-ui/src/hooks/useExtensionMessages.ts webview-ui/src/vscodeApi.ts
git commit -m "feat: add MessageTransport abstraction to webview (VsCode + WebSocket)"
```

---

### Task 10: Create CLI package — process provider

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/processProvider.ts`

- [ ] **Step 1: Create cli/package.json**

```json
{
  "name": "@pixel-agents/cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "pixel-agents": "./dist/index.js"
  },
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --format=esm --external:electron",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "esbuild": "^0.28.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create cli/src/processProvider.ts**

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentProcess, ProcessProvider } from '../../core/src/interfaces.js';

class CliAgentProcess implements AgentProcess {
  readonly id: string;
  readonly name: string;
  private proc: ChildProcess;
  private _exited = false;
  private exitCallbacks: Array<(code: number | undefined) => void> = [];

  get pid(): number | undefined { return this.proc.pid; }
  get exited(): boolean { return this._exited; }

  constructor(name: string, command: string, args: string[], cwd: string) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    this.proc.on('exit', (code) => {
      this._exited = true;
      for (const cb of this.exitCallbacks) cb(code ?? undefined);
    });
  }

  show(): void {
    // No-op for CLI — process runs in background
    console.log(`[pixel-agents] Agent "${this.name}" (PID: ${this.pid})`);
  }

  kill(): void {
    if (!this._exited) {
      this.proc.kill('SIGTERM');
    }
  }

  onExit(callback: (code: number | undefined) => void): void {
    if (this._exited) {
      callback(undefined);
    } else {
      this.exitCallbacks.push(callback);
    }
  }
}

export class CliProcessProvider implements ProcessProvider {
  private processes = new Map<string, CliAgentProcess>();
  private activeId: string | undefined;
  private activeChangedCallbacks: Array<(p: AgentProcess | undefined) => void> = [];

  spawn(name: string, command: string, args: string[], cwd: string): AgentProcess {
    const proc = new CliAgentProcess(name, command, args, cwd);
    this.processes.set(proc.id, proc);
    this.activeId = proc.id;
    for (const cb of this.activeChangedCallbacks) cb(proc);

    proc.onExit(() => {
      this.processes.delete(proc.id);
      if (this.activeId === proc.id) {
        this.activeId = undefined;
        for (const cb of this.activeChangedCallbacks) cb(undefined);
      }
    });

    return proc;
  }

  listAll(): AgentProcess[] {
    return [...this.processes.values()];
  }

  getActive(): AgentProcess | undefined {
    return this.activeId ? this.processes.get(this.activeId) : undefined;
  }

  onActiveChanged(callback: (process: AgentProcess | undefined) => void): void {
    this.activeChangedCallbacks.push(callback);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add cli/
git commit -m "feat: create cli/ package with CliProcessProvider (child_process)"
```

---

### Task 11: Create CLI state persistence

**Files:**
- Create: `cli/src/stateStore.ts`

- [ ] **Step 1: Create cli/src/stateStore.ts**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StateStore } from '../../core/src/interfaces.js';

export class FileStateStore implements StateStore {
  private data: Record<string, unknown> = {};
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  get<T>(key: string, defaultValue: T): T {
    return (this.data[key] as T) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/stateStore.ts
git commit -m "feat: add FileStateStore for CLI state persistence"
```

---

### Task 12: Create CLI host server (HTTP + WebSocket)

**Files:**
- Create: `cli/src/host.ts`

- [ ] **Step 1: Create cli/src/host.ts**

```typescript
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { MessageSender } from '../../core/src/interfaces.js';
import { Orchestrator } from '../../core/src/orchestrator.js';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface HostConfig {
  port: number;
  webviewDir: string;  // path to built webview-ui/dist
  assetsDir: string;   // path to assets/
  orchestrator: Orchestrator;
}

export function startHost(config: HostConfig): { port: number; close: () => void } {
  const clients = new Set<WebSocket>();

  // Broadcast MessageSender — sends to all connected WebSocket clients
  const broadcastSender: MessageSender = {
    postMessage(msg: unknown) {
      const data = JSON.stringify(msg);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      }
    },
  };

  config.orchestrator.setMessageSender(broadcastSender);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

    // API: hook endpoint (reuse existing server logic)
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Static files: webview SPA
    let filePath = path.join(config.webviewDir, url.pathname === '/' ? 'index.html' : url.pathname);

    // Fallback to index.html for SPA routing
    if (!fs.existsSync(filePath)) {
      filePath = path.join(config.webviewDir, 'index.html');
    }

    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        config.orchestrator.handleMessage(msg);
      } catch (e) {
        console.error('[pixel-agents] Invalid WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`[pixel-agents] Serving at http://localhost:${config.port}`);
  });

  return {
    port: config.port,
    close: () => {
      wss.close();
      server.close();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/host.ts
git commit -m "feat: add CLI host server (HTTP static files + WebSocket IPC)"
```

---

### Task 13: Create CLI entry point

**Files:**
- Create: `cli/src/index.ts`

- [ ] **Step 1: Create cli/src/index.ts**

```typescript
#!/usr/bin/env node

import * as path from 'node:path';
import { CliProcessProvider } from './processProvider.js';
import { FileStateStore } from './stateStore.js';
import { startHost } from './host.js';
import { Orchestrator } from '../../core/src/orchestrator.js';
import type { WorkspaceProvider, DialogProvider } from '../../core/src/interfaces.js';

function parseArgs(args: string[]): {
  target: 'browser' | 'electron';
  port: number;
  project: string;
} {
  let target: 'browser' | 'electron' = 'browser';
  let port = 3000;
  let project = process.cwd();

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--target':
        target = args[++i] as 'browser' | 'electron';
        break;
      case '--port':
        port = parseInt(args[++i], 10);
        break;
      case '--project':
        project = path.resolve(args[++i]);
        break;
    }
  }

  return { target, port, project };
}

const cliDialogProvider: DialogProvider = {
  async showSaveDialog(defaultName) {
    console.log(`[pixel-agents] Save dialog not available in CLI. Use --export flag.`);
    return undefined;
  },
  async showOpenDialog() { return undefined; },
  async showDirectoryDialog() { return undefined; },
  showWarning(msg) { console.warn(`[pixel-agents] ${msg}`); },
  showInfo(msg) { console.log(`[pixel-agents] ${msg}`); },
  showError(msg) { console.error(`[pixel-agents] ERROR: ${msg}`); },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const pixelAgentsDir = path.join(homeDir, '.pixel-agents');

  const workspaceProvider: WorkspaceProvider = {
    getFolders: () => [{ name: path.basename(args.project), path: args.project }],
    getProjectDir: () => args.project,
  };

  const orchestrator = new Orchestrator({
    processProvider: new CliProcessProvider(),
    workspaceProvider,
    globalState: new FileStateStore(path.join(pixelAgentsDir, 'state.json')),
    workspaceState: new FileStateStore(path.join(pixelAgentsDir, 'workspaces', 'agents.json')),
    dialogProvider: cliDialogProvider,
    assetsRoot: path.join(__dirname, '..', 'assets'),
  });

  const webviewDir = path.join(__dirname, '..', 'webview');

  if (args.target === 'electron') {
    const { startElectron } = await import('./electron.js');
    startElectron({ port: args.port, webviewDir, assetsDir: path.join(__dirname, '..', 'assets'), orchestrator });
  } else {
    const host = startHost({
      port: args.port,
      webviewDir,
      assetsDir: path.join(__dirname, '..', 'assets'),
      orchestrator,
    });

    // Open browser
    const { exec } = await import('node:child_process');
    const url = `http://localhost:${host.port}`;
    const openCmd = process.platform === 'win32' ? `start ${url}`
      : process.platform === 'darwin' ? `open ${url}`
      : `xdg-open ${url}`;
    exec(openCmd);

    console.log(`[pixel-agents] Running at ${url}`);
    console.log(`[pixel-agents] Press Ctrl+C to stop`);

    process.on('SIGINT', () => {
      console.log('\n[pixel-agents] Shutting down...');
      orchestrator.dispose();
      host.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[pixel-agents] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat: add CLI entry point with --target browser/electron"
```

---

### Task 14: Create Electron target

**Files:**
- Create: `cli/src/electron.ts`

- [ ] **Step 1: Create cli/src/electron.ts**

```typescript
import { startHost, type HostConfig } from './host.js';

export function startElectron(config: Omit<HostConfig, 'port'> & { port: number }) {
  // Dynamic import — electron is optional
  const electron = require('electron');
  const { app, BrowserWindow } = electron;

  const host = startHost(config);

  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Pixel Agents',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.loadURL(`http://localhost:${host.port}`);

    win.on('closed', () => {
      config.orchestrator.dispose();
      host.close();
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/electron.ts
git commit -m "feat: add Electron target wrapper"
```

---

### Task 15: Refactor PixelAgentsViewProvider to use core/

**Files:**
- Modify: `src/PixelAgentsViewProvider.ts`

- [ ] **Step 1: Refactor to use Orchestrator**

Import `Orchestrator` from core and create VS Code-specific adapter implementations for each interface. The ViewProvider becomes a thin shell:

```typescript
import { Orchestrator } from '../core/src/orchestrator.js';
import type { ProcessProvider, StateStore, WorkspaceProvider, DialogProvider } from '../core/src/interfaces.js';

// VS Code adapters
class VsCodeProcessProvider implements ProcessProvider { /* wrap vscode.Terminal */ }
class VsCodeStateStore implements StateStore { /* wrap context.globalState */ }
class VsCodeWorkspaceProvider implements WorkspaceProvider { /* wrap vscode.workspace */ }
class VsCodeDialogProvider implements DialogProvider { /* wrap vscode.window.show*Dialog */ }

export class PixelAgentsViewProvider implements vscode.WebviewViewProvider {
  private orchestrator: Orchestrator;

  constructor(context: vscode.ExtensionContext) {
    this.orchestrator = new Orchestrator({
      processProvider: new VsCodeProcessProvider(context),
      workspaceProvider: new VsCodeWorkspaceProvider(),
      globalState: new VsCodeStateStore(context.globalState),
      workspaceState: new VsCodeStateStore(context.workspaceState),
      dialogProvider: new VsCodeDialogProvider(),
      assetsRoot: path.join(context.extensionPath, 'dist', 'assets'),
    });
  }

  resolveWebviewView(view: vscode.WebviewView) {
    const sender = { postMessage: (msg) => view.webview.postMessage(msg) };
    this.orchestrator.setMessageSender(sender);

    view.webview.onDidReceiveMessage((msg) => {
      this.orchestrator.handleMessage(msg);
    });
  }
}
```

This is the largest refactor. The goal is to move ALL business logic into `core/orchestrator.ts` and leave only VS Code API adapter code in the ViewProvider.

- [ ] **Step 2: Verify extension still works**

Run: `npm run build` then F5 in VS Code Extension Dev Host.
Expected: Extension activates, agents can be created, tools tracked.

- [ ] **Step 3: Commit**

```bash
git add src/PixelAgentsViewProvider.ts
git commit -m "refactor: PixelAgentsViewProvider now delegates to core/Orchestrator"
```

---

### Task 16: Update build pipeline

**Files:**
- Modify: `esbuild.js`
- Modify: `package.json`

- [ ] **Step 1: Add core/ and cli/ to esbuild.js**

Add two new build targets:

```javascript
// Build core (library — used by both extension and CLI)
await esbuild.build({
  entryPoints: ['core/src/orchestrator.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'core/dist',
  format: 'esm',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
});

// Build CLI
await esbuild.build({
  entryPoints: ['cli/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'cli/dist/index.js',
  format: 'esm',
  external: ['electron'],
  sourcemap: !production,
  minify: production,
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 2: Add scripts to package.json**

```json
{
  "scripts": {
    "build:cli": "node esbuild.js --cli",
    "start:browser": "node cli/dist/index.js --target browser",
    "start:electron": "npx electron cli/dist/index.js --target electron"
  }
}
```

- [ ] **Step 3: Copy webview build + assets to CLI dist**

Add a post-build step that copies `webview-ui/dist/` and `dist/assets/` into `cli/dist/webview/` and `cli/dist/assets/` so the CLI host can serve them.

- [ ] **Step 4: Full build test**

Run: `npm run build && npm run build:cli`
Expected: Both build without errors.

- [ ] **Step 5: End-to-end test**

Run: `npm run start:browser -- --project .`
Expected: Browser opens at localhost:3000, shows the pixel art visualization.

- [ ] **Step 6: Commit**

```bash
git add esbuild.js package.json
git commit -m "feat: add build pipeline for core/ and cli/ packages"
```

---

### Task 17: Integration testing

**Files:**
- Create: `cli/__tests__/host.test.ts`

- [ ] **Step 1: Write integration test for CLI host**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { startHost } from '../src/host.js';
import WebSocket from 'ws';

describe('CLI Host', () => {
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
  });

  it('serves webview SPA on HTTP', async () => {
    const orchestrator = createMockOrchestrator();
    const host = startHost({ port: 0, webviewDir: 'webview-ui/dist', assetsDir: 'dist/assets', orchestrator });
    close = host.close;

    const res = await fetch(`http://localhost:${host.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('accepts WebSocket connections and routes messages', async () => {
    const orchestrator = createMockOrchestrator();
    const host = startHost({ port: 0, webviewDir: 'webview-ui/dist', assetsDir: 'dist/assets', orchestrator });
    close = host.close;

    const ws = new WebSocket(`ws://localhost:${host.port}/ws`);
    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'webviewReady' }));
    // Verify orchestrator.handleMessage was called
    expect(orchestrator.handleMessage).toHaveBeenCalledWith({ type: 'webviewReady' });

    ws.close();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cli && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/
git commit -m "test: add integration tests for CLI host server"
```
