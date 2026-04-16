# Passive Dashboard + CLI Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Externally-launched Claude Code sessions (user runs `claude` in any terminal) appear instantly in the browser dashboard served by `pixel-agents` CLI, by auto-installing Claude Code hooks on first boot (with opt-in prompt).

**Architecture:** The CLI host already spawns an Orchestrator + HTTP + WebSocket server. We add: (1) a Pixel Agents hook server (reuse `server/src/server.ts`) alongside the WS host, (2) a `hooksBootstrap` module that installs hooks in `~/.claude/settings.json` with three states (`always` / `ask` / `never`) persisted in `~/.pixel-agents/config.json`, (3) a `FirstRunHooksModal` in the webview for the "ask" state, (4) `HookEventHandler` wired to the Orchestrator so hook events route to agents. Parity with VS Code extension.

**Tech Stack:** TypeScript, Node.js (`http`, `child_process`), React (modal), existing `PixelAgentsServer` + `HookEventHandler` + `claudeHookInstaller` from `server/`.

**Spec:** `docs/superpowers/specs/2026-04-16-agent-flows-dashboard-design.md` (sections "Overview", "Architecture", "CLI hooks bootstrap", "Error handling").

---

## File Structure

### New files

```
cli/src/
  hooksBootstrap.ts                — first-run flow: read config, decide (always/ask/never), install
cli/__tests__/
  hooksBootstrap.test.ts            — unit tests for decision logic
webview-ui/src/components/
  FirstRunHooksModal.tsx            — 3-button modal (Siempre / Solo esta vez / No)
```

### Modified files

```
cli/src/index.ts                    — instantiate PixelAgentsServer + HookEventHandler; call bootstrapHooks on webviewReady
cli/package.json                    — no new deps (ws already present)
core/src/orchestrator.ts            — new method setHookEventHandler(); reacts to hook-delivered agent events
core/src/interfaces.ts              — no change (DialogProvider already has showInfo/Error)
webview-ui/src/App.tsx              — render FirstRunHooksModal when `showHooksInstallPrompt` state is set
webview-ui/src/hooks/useExtensionMessages.ts — handle 'hooksInstallPrompt' / 'hooksInstallResult' messages
src/PixelAgentsViewProvider.ts      — parity: also run hooksBootstrap if existing Settings toggle is off
```

### Message protocol additions

| Message | Direction | Payload |
|---|---|---|
| `hooksInstallPrompt` | backend → webview | `{ type }` (no fields; just "show the modal") |
| `hooksInstallDecision` | webview → backend | `{ type, decision: 'always' \| 'once' \| 'never' }` |
| `hooksInstallResult` | backend → webview | `{ type, installed: boolean, error?: string }` |

---

### Task 1: Scaffolding — `hooksBootstrap` module skeleton

**Files:**
- Create: `cli/src/hooksBootstrap.ts`
- Test: `cli/__tests__/hooksBootstrap.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// cli/__tests__/hooksBootstrap.test.ts
import { describe, it, expect } from 'vitest';
import { shouldPromptUser } from '../src/hooksBootstrap.js';

describe('hooksBootstrap.shouldPromptUser', () => {
  it('returns false when hooks already installed', () => {
    expect(shouldPromptUser({ hooksInstallAccepted: 'ask' }, /*installed=*/ true)).toBe(false);
  });

  it('returns false when user chose never', () => {
    expect(shouldPromptUser({ hooksInstallAccepted: 'never' }, /*installed=*/ false)).toBe(false);
  });

  it('returns false when user chose always (will auto-install without prompt)', () => {
    expect(shouldPromptUser({ hooksInstallAccepted: 'always' }, /*installed=*/ false)).toBe(false);
  });

  it('returns true when state is ask and hooks not installed', () => {
    expect(shouldPromptUser({ hooksInstallAccepted: 'ask' }, /*installed=*/ false)).toBe(true);
  });

  it('returns true when no state persisted (default=ask) and not installed', () => {
    expect(shouldPromptUser({}, /*installed=*/ false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run __tests__/hooksBootstrap.test.ts`
Expected: FAIL with "Cannot find module '../src/hooksBootstrap.js'".

- [ ] **Step 3: Create `cli/src/hooksBootstrap.ts` with the types + function**

```typescript
// cli/src/hooksBootstrap.ts
/**
 * First-run flow for Claude Code hook installation.
 *
 * Reads ~/.pixel-agents/config.json → hooksInstallAccepted ('always' | 'ask' | 'never').
 * Decides whether to prompt the user, install silently, or skip. See spec
 * docs/superpowers/specs/2026-04-16-agent-flows-dashboard-design.md § "CLI hooks bootstrap".
 */

export type HooksInstallAccepted = 'always' | 'ask' | 'never';

export interface HooksConfig {
  hooksInstallAccepted?: HooksInstallAccepted;
}

/** True if the user should be shown the first-run modal. */
export function shouldPromptUser(config: HooksConfig, alreadyInstalled: boolean): boolean {
  if (alreadyInstalled) return false;
  const state = config.hooksInstallAccepted ?? 'ask';
  return state === 'ask';
}

/** True if hooks should be auto-installed without prompting. */
export function shouldAutoInstall(config: HooksConfig, alreadyInstalled: boolean): boolean {
  if (alreadyInstalled) return false;
  return config.hooksInstallAccepted === 'always';
}

/** Map a modal decision to the persisted state + whether to install now. */
export function resolveDecision(decision: 'always' | 'once' | 'never'): {
  install: boolean;
  persist: HooksInstallAccepted;
} {
  switch (decision) {
    case 'always':
      return { install: true, persist: 'always' };
    case 'once':
      // Install this time, leave state as 'ask' so if user externally uninstalls we ask again.
      return { install: true, persist: 'ask' };
    case 'never':
      return { install: false, persist: 'never' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run __tests__/hooksBootstrap.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/src/hooksBootstrap.ts cli/__tests__/hooksBootstrap.test.ts
git commit -m "feat(cli): hooksBootstrap decision logic + unit tests"
```

---

### Task 2: `resolveDecision` tests + small refactor

**Files:**
- Modify: `cli/__tests__/hooksBootstrap.test.ts`

- [ ] **Step 1: Add failing test for `resolveDecision` + `shouldAutoInstall`**

Append to `cli/__tests__/hooksBootstrap.test.ts`:

```typescript
import { resolveDecision, shouldAutoInstall } from '../src/hooksBootstrap.js';

describe('hooksBootstrap.shouldAutoInstall', () => {
  it('returns true when always + not installed', () => {
    expect(shouldAutoInstall({ hooksInstallAccepted: 'always' }, false)).toBe(true);
  });

  it('returns false when already installed (nothing to do)', () => {
    expect(shouldAutoInstall({ hooksInstallAccepted: 'always' }, true)).toBe(false);
  });

  it('returns false for ask or never', () => {
    expect(shouldAutoInstall({ hooksInstallAccepted: 'ask' }, false)).toBe(false);
    expect(shouldAutoInstall({ hooksInstallAccepted: 'never' }, false)).toBe(false);
  });
});

describe('hooksBootstrap.resolveDecision', () => {
  it('always → install + persist always', () => {
    expect(resolveDecision('always')).toEqual({ install: true, persist: 'always' });
  });

  it('once → install + persist ask (so we re-ask if user externally uninstalls)', () => {
    expect(resolveDecision('once')).toEqual({ install: true, persist: 'ask' });
  });

  it('never → do not install + persist never', () => {
    expect(resolveDecision('never')).toEqual({ install: false, persist: 'never' });
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd cli && npx vitest run __tests__/hooksBootstrap.test.ts`
Expected: PASS — 11 tests green (5 original + 6 new).

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/hooksBootstrap.test.ts
git commit -m "test(cli): cover shouldAutoInstall + resolveDecision"
```

---

### Task 3: Config persistence helpers

**Files:**
- Modify: `cli/src/hooksBootstrap.ts`
- Modify: `cli/__tests__/hooksBootstrap.test.ts`

- [ ] **Step 1: Write failing test for read/write to tmp path**

Append to `cli/__tests__/hooksBootstrap.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readHooksConfig, writeHooksDecision } from '../src/hooksBootstrap.js';

describe('hooksBootstrap.readHooksConfig', () => {
  it('returns {} when file missing', () => {
    const tmp = path.join(os.tmpdir(), `pxl-${Date.now()}-missing.json`);
    expect(readHooksConfig(tmp)).toEqual({});
  });

  it('parses persisted state', () => {
    const tmp = path.join(os.tmpdir(), `pxl-${Date.now()}-read.json`);
    fs.writeFileSync(tmp, JSON.stringify({ hooksInstallAccepted: 'always' }));
    expect(readHooksConfig(tmp)).toEqual({ hooksInstallAccepted: 'always' });
    fs.unlinkSync(tmp);
  });

  it('returns {} on malformed JSON without throwing', () => {
    const tmp = path.join(os.tmpdir(), `pxl-${Date.now()}-bad.json`);
    fs.writeFileSync(tmp, 'not json');
    expect(readHooksConfig(tmp)).toEqual({});
    fs.unlinkSync(tmp);
  });
});

describe('hooksBootstrap.writeHooksDecision', () => {
  it('persists without clobbering other keys', async () => {
    const tmp = path.join(os.tmpdir(), `pxl-${Date.now()}-write.json`);
    fs.writeFileSync(tmp, JSON.stringify({ otherKey: 'keep-me', hooksInstallAccepted: 'ask' }));
    await writeHooksDecision(tmp, 'always');
    const parsed = JSON.parse(fs.readFileSync(tmp, 'utf-8'));
    expect(parsed).toEqual({ otherKey: 'keep-me', hooksInstallAccepted: 'always' });
    fs.unlinkSync(tmp);
  });

  it('creates parent dir if missing', async () => {
    const dir = path.join(os.tmpdir(), `pxl-${Date.now()}-mkdir`, 'nested');
    const tmp = path.join(dir, 'config.json');
    await writeHooksDecision(tmp, 'never');
    expect(JSON.parse(fs.readFileSync(tmp, 'utf-8'))).toEqual({ hooksInstallAccepted: 'never' });
    fs.rmSync(path.dirname(dir), { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run __tests__/hooksBootstrap.test.ts`
Expected: FAIL with "readHooksConfig is not a function".

- [ ] **Step 3: Implement the helpers**

Append to `cli/src/hooksBootstrap.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Read ~/.pixel-agents/config.json. Returns {} on missing/malformed. */
export function readHooksConfig(filePath: string): HooksConfig & Record<string, unknown> {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed as HooksConfig & Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Persist hooksInstallAccepted without clobbering other keys in config.json.
 * Atomic write via .tmp + rename (matches layoutPersistence pattern).
 */
export async function writeHooksDecision(
  filePath: string,
  state: HooksInstallAccepted,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const existing = readHooksConfig(filePath) as Record<string, unknown>;
  existing.hooksInstallAccepted = state;
  const tmp = filePath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(existing, null, 2));
  await fs.promises.rename(tmp, filePath);
}
```

- [ ] **Step 4: Run test**

Run: `cd cli && npx vitest run __tests__/hooksBootstrap.test.ts`
Expected: PASS — 16 tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/src/hooksBootstrap.ts cli/__tests__/hooksBootstrap.test.ts
git commit -m "feat(cli): hooksBootstrap config read/write with atomic tmp+rename"
```

---

### Task 4: CLI wires PixelAgentsServer + HookEventHandler at boot

**Files:**
- Modify: `cli/src/index.ts`

The existing `server/src/server.ts` `PixelAgentsServer` is already a standalone class (confirmed by checking `server/__tests__/server.test.ts`). We instantiate it in the CLI entry point, pass the callback that routes hook events to the Orchestrator via the existing `HookEventHandler`.

- [ ] **Step 1: Read current `cli/src/index.ts` to understand flow**

Run: `cat cli/src/index.ts`
Expected: sees `main()` that parses args, builds Orchestrator, calls `startHost`. No hook server.

- [ ] **Step 2: Add `--no-hooks` flag parsing**

Edit `cli/src/index.ts` — inside `parseArgs`, add:

```typescript
interface Args {
  target: 'browser' | 'electron';
  port: number;
  project: string;
  hooks: boolean;  // NEW: inverse of --no-hooks
}

function parseArgs(argv: string[]): Args {
  let target: 'browser' | 'electron' = 'browser';
  let port = 3000;
  let project = process.cwd();
  let hooks = true;  // NEW default

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--target':
        target = argv[++i] === 'electron' ? 'electron' : 'browser';
        break;
      case '--port':
        port = parseInt(argv[++i]!, 10);
        break;
      case '--project':
        project = path.resolve(argv[++i]!);
        break;
      case '--no-hooks':  // NEW
        hooks = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return { target, port, project, hooks };
}
```

Update `printHelp()` to mention `--no-hooks`:

```typescript
function printHelp(): void {
  console.log(`
pixel-agents — pixel art visualization for Claude Code agents

Usage:
  pixel-agents [--target browser|electron] [--port 3000] [--project .] [--no-hooks]

Options:
  --target    browser (default) or electron
  --port      HTTP+WebSocket port (default 3000)
  --project   Project root (default: cwd)
  --no-hooks  Skip hook auto-install (falls back to JSONL polling)
  --help      Show this message
`);
}
```

- [ ] **Step 3: Instantiate PixelAgentsServer + HookEventHandler in `main()`**

Add imports at top of `cli/src/index.ts`:

```typescript
import { HookEventHandler } from '../../server/src/hookEventHandler.js';
import { claudeProvider } from '../../server/src/providers/index.js';
import { PixelAgentsServer } from '../../server/src/server.js';
```

Inside `main()`, after `const orchestrator = new Orchestrator({...});`, add:

```typescript
// Hook pipeline: PixelAgentsServer receives hook POSTs, HookEventHandler routes
// them to agents. Both are instantiated even when --no-hooks is set, because
// the hook install step is what --no-hooks gates; the server is cheap to run
// and provides discovery via ~/.pixel-agents/server.json.
const watchAllSessions = { current: false };
const hookEventHandler = new HookEventHandler(
  orchestrator.agents,
  orchestrator.waitingTimers,
  orchestrator.permissionTimers,
  () => orchestrator.getMessageSender(),  // may be undefined pre-webviewReady; handler tolerates it
  claudeProvider,
  watchAllSessions,
);

const hookServer = new PixelAgentsServer({
  onHookEvent: (event) => hookEventHandler.handleEvent(event),
});
await hookServer.start();
```

Update SIGINT handler to close the hook server before exit:

```typescript
process.on('SIGINT', () => {
  console.log('\n[pixel-agents] Shutting down...');
  orchestrator.dispose();
  void Promise.all([host.close(), hookServer.stop()]).then(() => process.exit(0));
});
```

- [ ] **Step 4: Type-check + build CLI**

Run: `cd cli && npx tsc --noEmit`
Expected: PASS.

Run from repo root: `node esbuild.js --cli`
Expected: "✓ Built cli/ → cli/dist/index.js".

- [ ] **Step 5: Smoke-test — CLI starts without crashing, hook server listens**

Run: `cd .. && node cli/dist/index.js --port 3100 --project . &`
Then: `curl -s http://127.0.0.1:$(cat ~/.pixel-agents/server.json | jq -r .port)/healthz || echo "no health endpoint"`
Expected: CLI prints `[pixel-agents] Serving at http://localhost:3100` AND `[Pixel Agents] Server: listening on 127.0.0.1:<randomPort>`; `~/.pixel-agents/server.json` exists. Kill with SIGINT and verify clean shutdown.

- [ ] **Step 6: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): start PixelAgentsServer + HookEventHandler at boot"
```

---

### Task 5: Orchestrator bridges hook events to MessageSender

The existing `HookEventHandler` expects a `webview` accessor that returns something with `postMessage`. The Orchestrator already has `getMessageSender()`. The hook handler was designed for `vscode.Webview`, but `MessageSender` is a subset (just `postMessage`) so no adapter needed — except the existing `HookEventHandler` constructor in `server/src/hookEventHandler.ts` currently types its 4th arg as `() => vscode.Webview | undefined`. We need to confirm and adjust.

**Files:**
- Modify: `server/src/hookEventHandler.ts` (loosen webview type to `MessageSender`)

- [ ] **Step 1: Read current signature**

Run: `grep -n "constructor\|webview:" server/src/hookEventHandler.ts | head -20`
Expected: we see `() => vscode.Webview | undefined` or similar.

- [ ] **Step 2: Replace `vscode.Webview` with `MessageSender` from core**

Edit `server/src/hookEventHandler.ts`:

Replace `import type * as vscode from 'vscode';` with `import type { MessageSender } from '../../core/src/interfaces.js';` — only if `vscode` was imported type-only. Keep other imports as-is.

Replace the 4th constructor parameter type:

```typescript
// Before:
private readonly getWebview: () => vscode.Webview | undefined,

// After:
private readonly getMessageSender: () => MessageSender | undefined,
```

Then inside the class body, replace every `this.getWebview()?.postMessage(...)` with `this.getMessageSender()?.postMessage(...)`. Grep for `getWebview`:

Run: `grep -n "getWebview" server/src/hookEventHandler.ts`
Rename every occurrence.

- [ ] **Step 3: Type-check**

Run: `npm run check-types`
Expected: PASS. If fails, the VS Code extension's call to `new HookEventHandler(..., () => this.webview, ...)` still passes a `vscode.Webview` — that's fine because `vscode.Webview` structurally includes `postMessage(msg)`, which satisfies `MessageSender`.

- [ ] **Step 4: Run existing server tests**

Run: `cd server && npm test`
Expected: 7 test suites pass, 135 tests pass (matches current baseline).

- [ ] **Step 5: Commit**

```bash
git add server/src/hookEventHandler.ts
git commit -m "refactor(server): HookEventHandler takes MessageSender instead of vscode.Webview"
```

---

### Task 6: FirstRunHooksModal component

**Files:**
- Create: `webview-ui/src/components/FirstRunHooksModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// webview-ui/src/components/FirstRunHooksModal.tsx
import { vscode } from '../vscodeApi.js';

/**
 * First-run modal asking the user whether to install Claude Code hooks.
 * Shown when backend emits `hooksInstallPrompt`. User clicks → webview posts
 * `hooksInstallDecision` with 'always' | 'once' | 'never'.
 *
 * Styling: matches SettingsModal (pixel borders, #1e1e2e bg, hard shadow).
 */
interface Props {
  onClose: () => void;
}

export function FirstRunHooksModal({ onClose }: Props): JSX.Element {
  const send = (decision: 'always' | 'once' | 'never') => {
    vscode.postMessage({ type: 'hooksInstallDecision', decision });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,20,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          boxShadow: '2px 2px 0 var(--pixel-shadow)',
          padding: '24px',
          maxWidth: '480px',
          color: 'var(--pixel-fg)',
          fontFamily: 'var(--pixel-font)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Instalar hooks de Claude Code</h2>
        <p>
          Para detectar agentes lanzados desde cualquier terminal, el dashboard necesita
          instalar hooks en <code>~/.claude/settings.json</code>. Es reversible desde
          Settings en cualquier momento.
        </p>
        <p>¿Instalar ahora?</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={() => send('never')}>No, gracias</button>
          <button onClick={() => send('once')}>Solo esta vez</button>
          <button onClick={() => send('always')} style={{ fontWeight: 'bold' }}>
            Sí, siempre
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build webview to verify it compiles**

Run: `cd webview-ui && npm run build`
Expected: PASS — bundle grows by ~1KB.

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/components/FirstRunHooksModal.tsx
git commit -m "feat(webview): FirstRunHooksModal with Siempre/Solo-vez/No buttons"
```

---

### Task 7: Webview wires up the modal + message handlers

**Files:**
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`
- Modify: `webview-ui/src/App.tsx`

- [ ] **Step 1: Add hook state for the prompt flag**

Edit `webview-ui/src/hooks/useExtensionMessages.ts`:

Locate the other state hooks (e.g. `lastSeenVersion`) and add:

```typescript
const [showHooksInstallPrompt, setShowHooksInstallPrompt] = useState(false);
```

Inside the message handler (`handler = (incoming: unknown) => {...}`), add a new case alongside the others:

```typescript
} else if (msg.type === 'hooksInstallPrompt') {
  setShowHooksInstallPrompt(true);
} else if (msg.type === 'hooksInstallResult') {
  // Close modal when backend confirms install attempt finished.
  setShowHooksInstallPrompt(false);
  if (!msg.installed && msg.error) {
    console.warn('[pixel-agents] Hook install failed:', msg.error);
  }
}
```

In the returned object at the end of the hook, add:

```typescript
return {
  // ... existing fields
  showHooksInstallPrompt,
  dismissHooksInstallPrompt: () => setShowHooksInstallPrompt(false),
};
```

- [ ] **Step 2: Render modal in App.tsx**

Edit `webview-ui/src/App.tsx`:

Import the component at the top:

```typescript
import { FirstRunHooksModal } from './components/FirstRunHooksModal.js';
```

Destructure the new fields from `useExtensionMessages`:

```typescript
const {
  // ... existing fields
  showHooksInstallPrompt,
  dismissHooksInstallPrompt,
} = useExtensionMessages(/* ... */);
```

Render conditionally near other modals:

```tsx
{showHooksInstallPrompt && <FirstRunHooksModal onClose={dismissHooksInstallPrompt} />}
```

- [ ] **Step 3: Build webview**

Run: `cd webview-ui && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add webview-ui/src/hooks/useExtensionMessages.ts webview-ui/src/App.tsx
git commit -m "feat(webview): wire FirstRunHooksModal into useExtensionMessages"
```

---

### Task 8: Orchestrator orchestrates the install flow on webviewReady

**Files:**
- Modify: `core/src/orchestrator.ts`

The Orchestrator needs to:
1. On webviewReady, check if hooks are already installed (`areHooksInstalled()` from `claudeHookInstaller.ts`).
2. Read config via `readHooksConfig()` from `hooksBootstrap`.
3. If `shouldAutoInstall` → call `installHooks()` + `copyHookScript()` synchronously.
4. If `shouldPromptUser` → post `hooksInstallPrompt`, await `hooksInstallDecision` via a pending promise.

Since this is Orchestrator-level logic but uses CLI-only modules (`hooksBootstrap`), we keep the wiring in `cli/src/index.ts` — Orchestrator exposes a generic hook for "async user decision via webview". See step 2.

- [ ] **Step 1: Add generic "waitForDecision" helper in Orchestrator**

Edit `core/src/orchestrator.ts`. Add to the class:

```typescript
private pendingDecisions = new Map<string, (value: unknown) => void>();

/**
 * Send a message that expects a response from the webview. Returns a promise
 * that resolves when the webview posts back a message with matching `type` + `id`.
 * Times out after 5 minutes (user probably walked away).
 */
async requestDecision<T>(requestMessage: { type: string; [k: string]: unknown }, responseType: string): Promise<T | null> {
  const id = `${responseType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  this.messageSender?.postMessage({ ...requestMessage, requestId: id });
  return new Promise<T | null>((resolve) => {
    this.pendingDecisions.set(id, (value) => resolve(value as T));
    setTimeout(() => {
      if (this.pendingDecisions.has(id)) {
        this.pendingDecisions.delete(id);
        resolve(null);
      }
    }, 5 * 60_000);
  });
}

/** Called from handleMessage when a 'decision' type message arrives. Drains the matching pending. */
private resolveDecision(requestId: string, value: unknown): boolean {
  const cb = this.pendingDecisions.get(requestId);
  if (!cb) return false;
  this.pendingDecisions.delete(requestId);
  cb(value);
  return true;
}
```

In `handleMessage` switch, add cases that resolve pending decisions (e.g. `hooksInstallDecision`):

```typescript
case 'hooksInstallDecision': {
  const requestId = (msg.requestId as string) ?? '';
  if (this.resolveDecision(requestId, msg.decision)) return true;
  // Fallback: if the message arrived without requestId (older webview build), log & drop.
  console.warn('[pixel-agents] hooksInstallDecision received without requestId');
  return true;
}
```

Update the webview's `hooksInstallDecision` send (from Task 7) to echo the requestId — but since the modal opens in response to a `hooksInstallPrompt` message that carries `requestId`, update the modal to persist it.

Edit `webview-ui/src/components/FirstRunHooksModal.tsx` props:

```typescript
interface Props {
  requestId: string;
  onClose: () => void;
}

// Inside:
const send = (decision: 'always' | 'once' | 'never') => {
  vscode.postMessage({ type: 'hooksInstallDecision', decision, requestId });
  onClose();
};
```

Update `useExtensionMessages.ts` to capture the requestId from `hooksInstallPrompt`:

```typescript
const [hooksInstallRequestId, setHooksInstallRequestId] = useState<string | null>(null);

// In handler:
} else if (msg.type === 'hooksInstallPrompt') {
  setHooksInstallRequestId((msg.requestId as string) ?? null);
}
```

And pass it to the modal in App.tsx:

```tsx
{hooksInstallRequestId && (
  <FirstRunHooksModal
    requestId={hooksInstallRequestId}
    onClose={() => setHooksInstallRequestId(null)}
  />
)}
```

- [ ] **Step 2: Type-check full tree**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 3: Build webview + esbuild**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add core/src/orchestrator.ts webview-ui/src/components/FirstRunHooksModal.tsx webview-ui/src/hooks/useExtensionMessages.ts webview-ui/src/App.tsx
git commit -m "feat(core): requestDecision helper + modal passes requestId"
```

---

### Task 9: CLI entrypoint invokes hooksBootstrap on webviewReady

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add imports**

At the top of `cli/src/index.ts`:

```typescript
import {
  readHooksConfig,
  resolveDecision,
  shouldAutoInstall,
  shouldPromptUser,
  writeHooksDecision,
} from './hooksBootstrap.js';
import {
  areHooksInstalled,
  installHooks,
} from '../../server/src/providers/hook/claude/claudeHookInstaller.js';
import { copyHookScript } from '../../server/src/providers/index.js';
```

- [ ] **Step 2: Define the bootstrap routine**

Above `main()`:

```typescript
async function runHooksBootstrap(
  args: Args,
  orchestrator: Orchestrator,
  homeDir: string,
): Promise<void> {
  if (!args.hooks) {
    console.log('[pixel-agents] Hooks skipped (--no-hooks)');
    return;
  }
  const configPath = path.join(homeDir, '.pixel-agents', 'config.json');
  const config = readHooksConfig(configPath);
  const installed = areHooksInstalled();

  if (shouldAutoInstall(config, installed)) {
    await doInstall(homeDir);
    return;
  }

  if (!shouldPromptUser(config, installed)) return;

  // Ask the user via webview. Waits up to 5min; resolves to decision or null on timeout.
  const decision = await orchestrator.requestDecision<'always' | 'once' | 'never'>(
    { type: 'hooksInstallPrompt' },
    'hooksInstallDecision',
  );
  if (!decision) return;  // timeout: keep state as-is, user can retry next boot

  const resolved = resolveDecision(decision);
  await writeHooksDecision(configPath, resolved.persist);
  if (!resolved.install) return;

  try {
    await doInstall(homeDir);
    orchestrator.getMessageSender()?.postMessage({ type: 'hooksInstallResult', installed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pixel-agents] Hook install failed:', message);
    orchestrator.getMessageSender()?.postMessage({
      type: 'hooksInstallResult',
      installed: false,
      error: message,
    });
  }
}

async function doInstall(homeDir: string): Promise<void> {
  await copyHookScript(homeDir);  // writes ~/.pixel-agents/hooks/claude-hook.js
  await installHooks();           // adds entries to ~/.claude/settings.json
}
```

- [ ] **Step 3: Call it after host starts and webview is expected to connect**

The tricky part: `requestDecision` needs a MessageSender. The broadcast sender is wired to the Orchestrator in `startHost` only after the WebSocket server is up. So we call `runHooksBootstrap` AFTER `startHost`, but we need to wait until at least one WS client has connected before the prompt is useful.

Simplest: in Orchestrator, add a `waitForWebview(): Promise<void>` that resolves on first `webviewReady`. Call it before `requestDecision`.

Edit `core/src/orchestrator.ts`:

```typescript
private webviewReadyOnce: Promise<void> | null = null;
private webviewReadyResolve: (() => void) | null = null;

waitForWebview(): Promise<void> {
  if (!this.webviewReadyOnce) {
    this.webviewReadyOnce = new Promise((resolve) => {
      this.webviewReadyResolve = resolve;
    });
  }
  return this.webviewReadyOnce;
}
```

In `handleMessage`'s `webviewReady` case, call `this.webviewReadyResolve?.()`.

In `cli/src/index.ts` main(), after `startHost`:

```typescript
// Don't await hooks bootstrap — let it run in background once webview connects.
void orchestrator.waitForWebview().then(() => runHooksBootstrap(args, orchestrator, homeDir));
```

- [ ] **Step 4: Rebuild + smoke test**

Run: `node esbuild.js --cli`
Expected: built.

Run: `rm -rf ~/.pixel-agents/config.json` (to force first-run state)
Then: `node cli/dist/index.js --port 3101`
Open `http://localhost:3101` in browser.
Expected:
- Dashboard loads.
- After ~1s (first WebSocket message flush), modal appears: "Instalar hooks de Claude Code…".
- Click "No, gracias" → modal closes, `~/.pixel-agents/config.json` contains `{"hooksInstallAccepted":"never"}`, `~/.claude/settings.json` unchanged.

Repeat with "Sí, siempre":
- `~/.claude/settings.json` has new hook entries.
- `~/.pixel-agents/config.json` → `"hooksInstallAccepted":"always"`.

- [ ] **Step 5: Commit**

```bash
git add core/src/orchestrator.ts cli/src/index.ts
git commit -m "feat(cli): bootstrap hooks on first webviewReady"
```

---

### Task 10: Verify external agent detection end-to-end

**Files:** none modified — this is a manual verification step.

- [ ] **Step 1: Setup**

Run: `rm -rf ~/.pixel-agents/config.json`; `rm -f ~/.claude/settings.json` (backup first if you have custom hooks).

Start: `node cli/dist/index.js --port 3102 --project .`
Open browser.
Accept "Sí, siempre" in the modal. Verify `~/.claude/settings.json` now has 11 hook entries pointing to `~/.pixel-agents/hooks/claude-hook.js`.

- [ ] **Step 2: Launch a Claude session from a brand-new terminal**

In a SEPARATE terminal (not the one running the CLI):

```bash
cd ~/some-project
claude
```

Within ~500ms, verify the browser dashboard shows a new minero in the cave.

- [ ] **Step 3: Verify tool animations arrive**

In the Claude session, ask it to run a Read tool (e.g., "read README.md"). In the dashboard, verify:
- Minero walks to a rock vein.
- Animation switches to wheelbarrow (read animation).
- On turn end, green-checkmark bubble appears.

- [ ] **Step 4: Verify agents persist across dashboard restart**

Close the CLI (Ctrl+C). Restart with same port. Verify the minero reappears (restored from persisted AgentState), and continues to animate as the Claude session keeps working.

- [ ] **Step 5: Commit a short dev note documenting the flow**

Create/append to `docs/development-setup.md`:

```markdown
## Running the Passive Dashboard

1. Build: `npm run build:cli`
2. Start: `node cli/dist/index.js --port 3000 --project .`
3. First boot: accept hooks install modal ("Sí, siempre" recommended).
4. In any terminal: `claude` — the session appears in the dashboard.

To disable hooks: `--no-hooks` (falls back to JSONL polling).
To reset: delete `~/.pixel-agents/config.json` and `~/.claude/settings.json` hook entries.
```

```bash
git add docs/development-setup.md
git commit -m "docs: passive dashboard setup steps"
```

---

## Notes for agentic workers

- **Run tests continuously**: `cd cli && npx vitest` in watch mode during Tasks 1-3. `npm test` from root for the full extension + server + webview test runs between tasks.
- **Do NOT rebuild CLI more often than needed**: `node esbuild.js --cli` takes a few seconds. Run only after changes to `cli/src/` or its dependencies in `core/`.
- **Hook installation is global**: your test runs modify `~/.claude/settings.json`. Back it up once before starting Task 4, restore between smoke tests:
  ```bash
  cp ~/.claude/settings.json ~/.claude/settings.json.backup
  # ... run tests ...
  cp ~/.claude/settings.json.backup ~/.claude/settings.json
  ```

## Deliverable

After this plan:
- `pixel-agents --port 3000` → prompt appears on first boot, hooks install (if accepted), externally-launched agents appear in dashboard instantly.
- Build passes: `npm run build && npm run build:cli && npm test` (extend the existing 135 tests with the 16 new hooksBootstrap tests = 151).
- VS Code extension behavior unchanged (parity). The CLI now matches.
