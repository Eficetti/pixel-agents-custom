# Agent Flows + Passive Dashboard — Design Spec

## Overview

Two complementary additions on top of `feature/multi-target-cli` + cave-mine-theme:

1. **Passive dashboard for externally-launched agents.** The CLI host already visualizes agents it spawns; this spec closes the gap so agents started by the user from any terminal (`claude` in Terminal A, `claude --resume` in Terminal B, etc.) also appear instantly in the browser dashboard.
2. **Configurable team flows.** A `flows.json` config + dashboard launcher that spawns a **capataz** (orchestrator Claude instance) pre-configured to coordinate a team of role-specific sub-agents (architect, backend, frontend, tester, …) for recurring workflows (feature planning, code review, bug hunt, etc.).

The common thread: the user treats the browser as a passive cave-mine HUD, launches work from a familiar terminal or a one-click flow button, and watches execution play out visually.

## Scope

**In scope**:
- Dashboard-side: flow launcher UI, role hierarchy visualization, blocked/waiting indicators, timeout countdown.
- CLI-side: hook server integration, auto-install of Claude Code hooks in `~/.claude/settings.json` (opt-in prompt on first boot), reuse of existing JSONL polling as fallback.
- Core: `flowsConfig` (read+merge), `capatazPromptBuilder` (build system prompt from role library), `runsAfterGate` (PreToolUse interceptor), `timeoutWatchdog` (per-agent idle+total kill).
- Config file format (`flows.json`) with roles + flows + defaults, shipped with sensible built-ins.

**Out of scope**:
- Embedded terminal in the browser (`claude` stays in native terminal).
- Agent scheduling / cron (`pixel-agents schedule`).
- Per-agent cost/token tracking UI beyond what already exists.
- Electron-specific tweaks for this feature.
- Multi-user / remote dashboard (single-user on localhost).

## Architecture

```
User (prompt libre or flow button)
    │
    ▼
┌───────────────────────────────────────────────────────┐
│ Dashboard (webview-ui)                                 │
│  - BottomToolbar: "+ Flow ▾" dropdown                  │
│  - LaunchFlowModal: role list + feature textarea       │
│  - OfficeCanvas: role labels, team lines, cian         │
│    waiting bubbles, red timeout outline                │
└────────────────┬──────────────────────────────────────┘
                 │ postMessage({type: 'launchFlow', flowId, userInput})
                 ▼
┌───────────────────────────────────────────────────────┐
│ Orchestrator (core)                                    │
│  - flowsConfig.resolveFlow(flowId)                     │
│  - capatazPromptBuilder.build(flow, library, input)    │
│  - launchNewAgent() with --append-system-prompt        │
│  - runsAfterGate (PreToolUse interceptor via hooks)    │
│  - timeoutWatchdog (loop on AgentState maps)           │
└────────────────┬──────────────────────────────────────┘
                 │ ProcessProvider.spawn('claude', [...args])
                 ▼
┌───────────────────────────────────────────────────────┐
│ Capataz (Claude Code instance)                         │
│  - System prompt: header + role library + exec rules  │
│  - User prompt: feature description                    │
│  - Decides: Agent(role=architect), Agent(role=backend)│
│    in parallel, waits, Agent(role=tester)              │
└───────────────────────────────────────────────────────┘

External terminals (passive detection):
┌───────────────────────────────────────────────────────┐
│ User's terminal: `claude` (unrelated to dashboard)     │
│     │                                                  │
│     ▼                                                  │
│ Claude Code emits SessionStart hook                    │
│     │                                                  │
│     ▼                                                  │
│ ~/.pixel-agents/hooks/claude-hook.js POSTs to          │
│ http://localhost:<port>/hook                           │
│     │                                                  │
│     ▼                                                  │
│ PixelAgentsServer → HookEventHandler → Orchestrator   │
│     │                                                  │
│     ▼                                                  │
│ Dashboard shows new minero (instant via WebSocket)     │
└───────────────────────────────────────────────────────┘
```

## Component design

### `flowsConfig.ts` (new, in `core/src/`)

Responsible for reading/merging/validating configuration.

```typescript
export interface Role {
  label: string;
  icon?: string;
  prompt: string;
  reportsTo?: string;
  supervises?: string[];
  runsAfter?: string[];
  blocksOn?: string[];
  collaboratesWith?: string[];
  timeout?: { idleMs?: number; totalMs?: number };
}

export interface Flow {
  id: string;
  label: string;
  icon?: string;
  roles: string[];
  promptTemplate: string;  // supports {{userInput}}, {{project}}, {{branch}}
  timeout?: { idleMs?: number; totalMs?: number };
}

export interface FlowsConfig {
  roles: Record<string, Role>;
  flows: Flow[];
  defaults?: {
    bypassPermissions?: boolean;
    cwd?: string;
    timeout?: { idleMs?: number; totalMs?: number };
  };
}

export function loadFlowsConfig(projectDir: string): FlowsConfig;
export function resolveFlow(config: FlowsConfig, flowId: string): Flow | null;
export function validateConfig(config: FlowsConfig): ValidationError[];
```

**Merge precedence** (highest wins): per-project `<projectDir>/.pixel-agents/flows.json` → global `~/.pixel-agents/flows.json` → built-in (hardcoded in `flowsConfig.builtin.ts`).

**Merge strategy**: by `id`, whole record. A per-project role with id `architect` entirely replaces the global/built-in one (no deep-merge of fields). Motivation: editing a prompt in isolation from the rest of the role definition hides context.

**Validation**:
- Cycles in `runsAfter`/`reportsTo`/`blocksOn` graph → ValidationError.
- Flow references a role not in library → ValidationError.
- Invalid JSON → treated as missing config, fallback to next level.

**Watch** for changes: reuse `fs.watch` + polling pattern from `layoutPersistence.ts`. On change, push updated `flowsLoaded` message to webview so dropdown refreshes without restart.

**Built-in defaults** (shipped in `core/src/flowsConfig.builtin.ts`):
- Roles: `architect`, `backend`, `frontend`, `tester`, `reviewer` with prompt templates derived from the role descriptions in this spec.
- Flows: `feature-planning` (architect+backend+frontend+tester), `quick-review` (architect+reviewer).
- Defaults: `timeout: { idleMs: 300_000, totalMs: 3_600_000 }`, `bypassPermissions: false`.

### `capatazPromptBuilder.ts` (new, in `core/src/`)

Pure function: given a flow and role library, produce the system prompt for the capataz.

```typescript
export interface BuildContext {
  project: string;    // cwd
  branch?: string;    // from `git rev-parse --abbrev-ref HEAD`
}

export function buildCapatazPrompt(
  flow: Flow,
  config: FlowsConfig,
  userInput: string,
  context: BuildContext,
): { systemPrompt: string; userPrompt: string };
```

**Output structure** — 4 concatenated blocks:

```
1. HEADER (static):
   Sos el capataz de un equipo de mineros...

2. ROLE LIBRARY (full library, always, compact YAML-ish format):
   ROLES DISPONIBLES:
     architect  🏗️  supervises: [backend, frontend]
       → <prompt from config>
     ...

3. EXECUTION RULES (auto-derived from library):
   REGLAS DE EJECUCIÓN:
     1. Spawneá via Agent(description=<role_id>, prompt=<brief>, run_in_background=true).
     2. Roles con runs_after → esperá la señal '[sistema] <deps> completaron' antes de retentar.
     3. Roles con blocks_on → spawneá ya, pero el prompt inicial debe decir 'esperá input de X vía SendMessage'.
     4. Roles con reports_to → instrucciones en su prompt inicial sobre consultar al supervisor.
     5. Mensajes '[sistema]' son automáticos: respondé apropiadamente.

4. USER INPUT:
   Feature a construir:
   <userInput>
```

**Variable interpolation**: `{{project}}`, `{{branch}}`, `{{userInput}}` in `flow.promptTemplate`. Unknown variables pass through as literal text.

**Delivery**: `claude --session-id <uuid> --append-system-prompt <block1+2+3> -p <block4>`. Uses `--append-system-prompt` (not `--system`) to complement Claude Code's default system prompt (tools, etc.) instead of overriding.

Test strategy: snapshot tests on the generated strings for each built-in flow × sample userInput combinations.

### `runsAfterGate.ts` (new, in `core/src/`)

Enforces `runsAfter` relations at runtime via Claude Code's PreToolUse hook.

```typescript
export class RunsAfterGate {
  private pendingSpawns = new Map<string, { role: string; deniedAt: number; attempts: number }[]>();
  // key: capatazSessionId

  onPreToolUse(event: HookEvent): HookResponse | null;  // returns deny-response if blocked
  onPostToolUse(event: HookEvent): void;  // drains queue when deps finish
  onSubagentStop(event: HookEvent): void;  // alternative signal for drain
}
```

**Block decision flow** (in `onPreToolUse`):
1. Event is `PreToolUse` for `Agent` tool? If no, return null.
2. `description` matches a known role id with `runsAfter`? If no, return null.
3. Look at capataz's active Agent tool_use IDs (tracked by `HookEventHandler` in `AgentState.activeSubagentToolNames`).
4. For each `dep` in `role.runsAfter`: is there an active (not-yet-stopped) Agent for that role? If yes → deny.
5. Return `{ permissionDecision: 'deny', reason: 'Role "tester" requires [backend, frontend] to finish first...' }`.
6. Record in `pendingSpawns[capatazSessionId]` with `attempts++`.

**Drain decision flow** (in `onPostToolUse` / `onSubagentStop`):
1. Event closes an Agent tool for role `backend` (say) on capataz session X.
2. Look in `pendingSpawns[X]` for entries whose `runsAfter` includes `backend`.
3. For each entry, check if ALL `runsAfter` deps of that role are now finished. If yes → emit synthetic SendMessage event to the capataz: `"[sistema] <deps> completaron. Proceder con <role>."` and remove the entry.

**Deadlock protection**: if `attempts >= 3` for the same role, emit a toast + a `SendMessage` to capataz: `"[sistema] role <role> bloqueado tras 3 intentos. Decidí: forzar spawn o continuar sin él."` Dashboard surfaces a "Forzar spawn" button that injects a `PreToolUse.allow` override for the next attempt.

### `timeoutWatchdog.ts` (new, in `core/src/`)

Per-agent idle + total timeout enforcement. Runs as an interval in the Orchestrator.

```typescript
interface WatchedAgent {
  agentId: number;
  spawnedAt: number;
  lastActivityAt: number;
  idleMs: number;
  totalMs: number;
}

export class TimeoutWatchdog {
  private watched = new Map<number, WatchedAgent>();
  start(agentId: number, config: { idleMs: number; totalMs: number }): void;
  touch(agentId: number): void;  // called on every JSONL line / hook event
  stop(agentId: number): void;
  // Internal loop: every 10s, check each watched, emit timeout if expired.
}
```

**Activity signals** that reset `lastActivityAt`:
- Any JSONL line read in `readNewLines` for this agent.
- Any hook event matching this agent's session_id.

**Timeout action**:
1. `agent.processRef?.kill('SIGTERM')`.
2. `messageSender.postMessage({ type: 'agentTimedOut', id, reason: 'idle' | 'total' })`.
3. Webview: character starts matrix-despawn, toast `Agent "<role>" timed out (<reason>)`.
4. If agent had `leadAgentId`: emit synthetic SendMessage to lead `"[sistema] <role> timed out (<reason>). Decidí si respawnear o continuar."`

**Countdown warning** (dashboard-only, no kill):
- When `Date.now() - lastActivityAt` reaches `idleMs - 30_000`, Orchestrator posts `{ type: 'agentTimeoutWarning', id, remainingMs: 30_000 }`.
- Webview: character's outline turns `#ff3355` and flashes (1Hz). Toast with "Dar 10 minutos más" button that triggers `{ type: 'extendTimeout', id, extraMs: 600_000 }` → Orchestrator bumps `lastActivityAt` by `extraMs`.

### CLI hooks bootstrap (new, in `cli/src/`)

`cli/src/hooksBootstrap.ts`:

```typescript
export interface HooksBootstrapOptions {
  skip: boolean;  // from --no-hooks flag
  promptUser: () => Promise<boolean>;  // opens first-run dialog via dashboard
  configStore: StateStore;  // persists the user's decision
}

export async function bootstrapHooks(opts: HooksBootstrapOptions): Promise<{
  installed: boolean;
  reason: 'already-installed' | 'user-accepted' | 'user-declined' | 'permission-error';
}>;
```

**First-run flow**:
1. Skip if `--no-hooks` flag.
2. Read `~/.pixel-agents/config.json` → `hooksInstallAccepted?: 'always' | 'never' | 'ask'`. Default `ask`.
3. If hooks are already installed (detected via `areHooksInstalled()` in the existing installer) → skip the rest. Nothing to do.
4. If `hooksInstallAccepted === 'never'` → return without installing.
5. If `hooksInstallAccepted === 'always'` → install immediately, no prompt.
6. If `hooksInstallAccepted === 'ask'` → send message to webview to show first-run modal:
   *"Para detectar agentes lanzados desde cualquier terminal, el dashboard necesita instalar hooks en ~/.claude/settings.json. Es reversible desde Settings. ¿Instalar ahora? [Sí, siempre] [Solo esta vez] [No, gracias]"*
   - "Sí, siempre" → install + persist `'always'`.
   - "Solo esta vez" → install + persist `'ask'` (so if the user externally removes hooks later, we ask again on next boot).
   - "No, gracias" → do not install + persist `'never'`.
7. If installing fails (permissions): toast with manual install instructions, continue in JSONL-polling mode. Do not change `hooksInstallAccepted`.

`cli/src/index.ts` changes:
1. After `startHost`, before announcing ready:
   - Instantiate `PixelAgentsServer` (from `server/src/server.ts`) on a random port.
   - Instantiate `HookEventHandler`, wire to Orchestrator.
   - `await bootstrapHooks(...)` — non-blocking on failure.
2. Add `--no-hooks` flag to `parseArgs`.
3. On SIGINT, stop the hook server before exiting.

### Dashboard UI additions

**`BottomToolbar.tsx`** — add a `+ Flow ▾` dropdown next to `+ Agent`.
- Populated from `flowsLoaded` message (sent by Orchestrator on webviewReady + on config change).
- Each item: icon + label; click opens `LaunchFlowModal` pre-selected.
- Footer item: "Edit flows…" → posts `{ type: 'openFlowsConfig' }` → Orchestrator opens `~/.pixel-agents/flows.json` or per-project via `DialogProvider` (in VS Code: `vscode.env.openExternal`; in CLI: `exec('code <path>')` or similar).

**`LaunchFlowModal.tsx`** (new, in `webview-ui/src/components/`):
- Select flow (dropdown, defaults to the one clicked).
- Read-only role preview (list of roles with icons).
- Textarea for feature description (required, min 10 chars, max 2000).
- Optional overrides: `cwd` (readonly display with edit button), `bypassPermissions` (checkbox).
- Launch button → `{ type: 'launchFlow', flowId, userInput, overrides }`.
- Cancel button or Esc dismisses without action.
- Styled consistent with `SettingsModal` (pixel borders, `#1e1e2e` bg, hard shadows).

**`FirstRunHooksModal.tsx`** (new):
- Shows on first connect if `hooksInstallAccepted === 'ask'`.
- Three buttons as described in hooksBootstrap.
- Posts result back via `{ type: 'hooksInstallDecision', decision: 'always' | 'once' | 'never' }`.

**`OfficeCanvas` additions**:
- Role labels above characters with `agent.agentName` set (from team hooks). Already partially exists; make always-visible for flow-spawned agents.
- Cian waiting bubble (new sprite in `spriteData.ts`): white square, cian "..." icon (`#5ac8fa`), tail pointer. Used when agent has `blocksOn` status (new flag on Character).
- Team lines renderer (new pass in `renderer.ts`):
  - Between tile-pass and furniture-pass, after walls.
  - For each agent pair with relation set: draw 1px line.
  - Colors: `supervises`/`reportsTo` = `#DAA520` solid; `collaboratesWith` = `#DAA520` dotted (2 on, 2 off); `runsAfter` = arrow from dep to dependent, head = 3-pixel chevron.
  - Toggle in SettingsModal: "Show team lines" (default ON).
- Timeout warning: when `ch.timeoutWarning === true`, outline flashes `#ff3355` at 1Hz (toggle via timer in renderer, same pattern as matrix effect).

### Message protocol additions

New messages (extension/CLI → webview):
- `flowsLoaded`: `{ type, flows: Flow[], roles: Record<string, Role> }` — sent on webviewReady and on config change.
- `agentRoleAssigned`: `{ type, id: number, role: string, relations: { reportsTo?, supervises?, runsAfter?, blocksOn?, collaboratesWith? } }` — when an agent spawned by a flow is identified as a role.
- `agentTimedOut`: `{ type, id: number, reason: 'idle' | 'total' }`.
- `agentTimeoutWarning`: `{ type, id: number, remainingMs: number }`.
- `flowBlocked`: `{ type, capatazSessionId: string, blockedRole: string, attempts: number }` — surfaces "Forzar spawn" button.

New messages (webview → extension/CLI):
- `launchFlow`: `{ type, flowId: string, userInput: string, overrides?: { cwd?, bypassPermissions? } }`.
- `extendTimeout`: `{ type, id: number, extraMs: number }`.
- `hooksInstallDecision`: `{ type, decision: 'always' | 'once' | 'never' }`.
- `openFlowsConfig`: `{ type, scope: 'global' | 'project' }`.
- `forceSpawn`: `{ type, capatazSessionId: string, blockedRole: string }`.

## Data flow — end-to-end example

Scenario: user clicks "+ Flow" → "Feature Planning" → types *"agregar autenticación OAuth con Google"* → Launch.

```
1. Webview emits launchFlow({flowId: 'feature-planning', userInput: 'agregar autenticación OAuth con Google'})
   │
   ▼
2. Orchestrator.handleLaunchFlow():
   a. flowsConfig.resolveFlow('feature-planning') → flow with roles=[architect,backend,frontend,tester]
   b. capatazPromptBuilder.build(flow, library, userInput, {project, branch})
      → { systemPrompt: <4 blocks>, userPrompt: 'agregar autenticación...' }
   c. launchNewAgent with --append-system-prompt <systemPrompt> -p <userPrompt>
      (marks agent with providerId: 'claude', flowId: 'feature-planning')
   d. timeoutWatchdog.start(capatazAgentId, flow.timeout)
   │
   ▼
3. Capataz Claude process starts in its own session. Its first turn:
   - Reads user input, sees "feature" keywords.
   - Consults role library in its system prompt.
   - Decides: architect → backend+frontend parallel → tester.
   - Calls Agent(description='architect', prompt='<role.architect.prompt> + feature context', run_in_background=true)
   - Calls Agent(description='backend', prompt='<role.backend.prompt> + feature context + "reportá al architect"', run_in_background=true)
   - Calls Agent(description='frontend', prompt='...', run_in_background=true)
   - Calls Agent(description='tester', prompt='...', run_in_background=true)
   │
   ▼
4. For each Agent call, PreToolUse hook fires:
   - architect: no runsAfter → allow.
   - backend: no runsAfter → allow.
   - frontend: no runsAfter → allow.
   - tester: runsAfter [backend, frontend] → active → DENY.
     runsAfterGate records pendingSpawns[capataz] = [{role: 'tester', attempts: 1}]
     Capataz sees deny reason, understands.
   │
   ▼
5. Hooks for teammate sessions arrive (SubagentStart for architect/backend/frontend).
   HookEventHandler.onSubagentStart:
   - Spawns agent in Orchestrator with leadAgentId=capataz's id, agentName=role, teamName='feature-planning'.
   - Orchestrator posts agentCreated + agentRoleAssigned → dashboard.
   - timeoutWatchdog.start for each teammate.
   │
   ▼
6. Dashboard renders:
   - Capataz (char_boss.png) in cabaña, sipping coffee.
   - architect in mine with 🏗️ label.
   - backend with ⚙️ label, line to architect.
   - frontend with 🎨 label, line to architect + dotted line to backend.
   - tester absent (runsAfter pending).
   │
   ▼
7. Backend & frontend work through their turns. JSONL lines arrive. transcriptParser
   animates sprites (pick up/down, wheelbarrow). Capataz periodically receives updates
   if teammates SendMessage him.
   │
   ▼
8. Both backend & frontend hit turn_duration / SubagentStop:
   - runsAfterGate.onSubagentStop checks pendingSpawns → backend done, frontend done, tester's deps satisfied.
   - Injects SendMessage to capataz: "[sistema] backend+frontend completaron. Proceder con tester."
   - Capataz picks this up in next turn, retries Agent(description='tester').
   - This time PreToolUse allows (deps marked done).
   - tester spawns → dashboard renders minero emerging with matrix effect + arrow from backend/frontend to tester.
   │
   ▼
9. tester works, closes. Capataz summarizes, closes itself. Flow complete.
```

## Data model changes

### `AgentState` (in `core/src/types.ts`)

New optional fields:
- `flowId?: string` — id of the flow that spawned this agent (set by Orchestrator at launch; propagated to teammates via capataz's Agent call metadata).
- `roleId?: string` — resolved role id from config (e.g., 'architect'). Distinct from `agentName` which comes from team hooks and may not map to a known role.
- `roleRelations?: { reportsTo?: string; supervises?: string[]; runsAfter?: string[]; blocksOn?: string[]; collaboratesWith?: string[] }` — snapshot of relations at spawn time (prevents behavior change mid-flight if config is edited).
- `timeoutWarning?: boolean` — set by watchdog when idle < 30s remaining. Cleared when activity resumes.
- `blocksOnPending?: boolean` — set to true for teammates with `blocksOn` when spawned; cleared when first inbound SendMessage received.

### `Character` (in `webview-ui/src/office/types.ts`)

New optional fields mirror the relevant subset:
- `roleId?: string`.
- `roleRelations?: { ... }`.
- `timeoutWarning?: boolean`.
- `blocksOnPending?: boolean`.

### `PersistedAgent` (in `core/src/types.ts`)

Add: `flowId`, `roleId`, `roleRelations`. Restored agents keep their role context across restarts.

## Error handling

| Error | Detection | Response |
|---|---|---|
| Invalid JSON in flows.json | Parse at load time | Fallback to next level. Dashboard shows error toast + "Edit flows..." button. |
| Flow references missing role | validateConfig | Launch modal greys out flow with message "role 'xyz' not in library". |
| Cycle in runsAfter/reportsTo | validateConfig | Warning toast, fallback to built-in for affected flows/roles. |
| Capataz denies runsAfter ≥ 3 times | runsAfterGate attempts counter | Toast "flow bloqueado — forzar spawn?" with button to bypass gate for one call. |
| Claude process crashes | AgentProcess.onExit with non-zero | Matrix despawn + toast "agent <role> crashed (exit <code>)". Synthetic SendMessage to lead: "[sistema] <role> finalizado inesperadamente". |
| Hook install fails (permissions) | Try/catch in hooksBootstrap | Toast with manual install instructions. CLI continues in JSONL-polling mode. |
| Capataz total timeout | timeoutWatchdog | SIGTERM to capataz + all teammates (recursive by flowId). Toast "flow aborted by total timeout". |
| Two dashboards running | server.json PID check | Second instance reuses existing server (already implemented). |

Priority order:
1. Total blockers (hooks fail, server dead) → toast + instructions.
2. Impossible flow (missing role, cycle) → grey-out UI with edit button.
3. Runtime degradation (gate denies, teammate crash) → non-blocking warning.
4. Throttling (timeout, idle) → silent kill with notification.

## Testing strategy

### Unit (vitest, new dir `core/__tests__/`)
- `flowsConfig.test.ts`: merge precedence (built-in → global → project), validation (cycles, missing roles, invalid JSON), watch-file reload.
- `capatazPromptBuilder.test.ts`: snapshot each built-in flow × 3 sample userInputs. Detects unintended prompt changes.
- `runsAfterGate.test.ts`: deps not ready → deny; deps ready → allow; 3 denies → deadlock signal; drain on SubagentStop.
- `timeoutWatchdog.test.ts`: idle triggers kill; activity resets; total kill even with activity; cleanup on close; warning at idle-30s.

### Integration (in `cli/__tests__/`, using mock ProcessProvider)
- Full launchFlow cycle with canned JSONL responses. Assert: capataz prompt content, teammate spawn order, tester delayed, tester spawned after drain, timeout warning on idle teammate.
- Hook events: POST each of the 11 hook types, assert routing to correct agent + state updates.
- Config change: write a new flows.json, assert `flowsLoaded` message re-emitted to webview.

### Manual E2E (documented in spec, not automated in MVP)
1. `pixel-agents --port 3000` → accept hooks install modal.
2. `claude` in separate terminal → verify minero appears.
3. Click "+ Flow" → "Feature Planning" → write "add OAuth auth" → Launch. Verify capataz + architect + backend + frontend on screen; tester absent.
4. Wait for backend+frontend to close → verify tester emerges with matrix spawn.
5. Force idle on a teammate (close its terminal) → verify red outline + timeout warning toast → verify kill + system message to capataz.
6. Edit `~/.pixel-agents/flows.json`, add a new flow → verify dropdown refreshes without restart.

Not in MVP: stress tests (N teams simultaneously), Electron wrapper tests, webview rendering tests (beyond current asset integration).

## File changes summary

### New files
```
core/src/
  flowsConfig.ts                 — load/merge/validate flows.json
  flowsConfig.builtin.ts          — hardcoded defaults
  capatazPromptBuilder.ts         — pure function: flow + library → prompt string
  runsAfterGate.ts                — PreToolUse interceptor + drain logic
  timeoutWatchdog.ts              — per-agent idle+total timer

core/__tests__/
  flowsConfig.test.ts
  capatazPromptBuilder.test.ts
  runsAfterGate.test.ts
  timeoutWatchdog.test.ts

cli/src/
  hooksBootstrap.ts               — first-run install prompt + persistence

cli/__tests__/
  flowLaunch.integration.test.ts  — end-to-end via mock ProcessProvider

webview-ui/src/components/
  LaunchFlowModal.tsx
  FirstRunHooksModal.tsx
```

### Modified files
```
cli/src/index.ts                  — wire PixelAgentsServer + HookEventHandler + hooksBootstrap
core/src/orchestrator.ts          — handleLaunchFlow, wire runsAfterGate + timeoutWatchdog
core/src/types.ts                 — add flowId/roleId/roleRelations/timeout flags to AgentState + PersistedAgent
core/src/agentManager.ts          — threaded flowId/roleId into persist/restore
webview-ui/src/office/types.ts    — Character gains roleId/roleRelations/timeoutWarning/blocksOnPending
webview-ui/src/components/BottomToolbar.tsx  — + Flow dropdown + Edit flows footer
webview-ui/src/office/engine/renderer.ts     — team lines pass + timeout outline flash
webview-ui/src/office/sprites/spriteData.ts  — new cian waiting bubble sprite
webview-ui/src/hooks/useExtensionMessages.ts — handle flowsLoaded/agentRoleAssigned/agentTimedOut/etc.
webview-ui/src/components/SettingsModal.tsx  — toggle "Show team lines"
src/PixelAgentsViewProvider.ts    — parity: also run hooksBootstrap if CLI is not active
```

### Unchanged modules
- `shared/assets/*` — theme-agnostic asset pipeline.
- `core/src/assetLoader.ts` — no new asset types.
- `core/src/fileWatcher.ts` — already handles JSONL polling and external session detection.
- `server/src/*` — hook server + HookEventHandler reused as-is.
- Cave theme assets — no new sprites beyond the cian waiting bubble.

## Open questions resolved (in brainstorm)

| Question | Decision |
|---|---|
| Team mode: tmux-team vs parallel-independent | tmux-team (capataz + teammates) |
| Config scope: global / per-project / both | Both + built-in fallback |
| Config merge strategy | By id, whole record (no deep merge) |
| Dependency enforcement: prompt-only vs code-enforced | Code-enforced for `runsAfter` + timeouts; prompt-only for rest |
| Launch UX | Dropdown + modal; slash-command bar deferred |
| System prompt delivery | `--append-system-prompt` (not override) |
| Role filtering | Full library always (model decides relevance) |
| Hook install opt-in | Prompt on first boot with Always / Once / Never persistence |
| Capataz ≠ architect | Yes, separate responsibilities (infra vs domain) |
| Visual relations | Lines (solid, dotted, arrow) with Settings toggle |
| Waiting bubble colors | Amber = permission (exists); green = turn done (exists); cian = blocksOn waiting (new) |

## Future work (not in MVP)

- Agent profiles (single-agent templates, no team) — same config but `roles` with 1 member.
- Slash-command launcher bar (inline typing).
- Cost / token budget per flow with hard-cap kill.
- Scheduled flows (`pixel-agents schedule` / cron integration).
- Multi-user dashboards (remote access, auth).
- Flow templates marketplace / import from URL.
