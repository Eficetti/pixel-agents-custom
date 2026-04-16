# Development Setup

## Running the Passive Dashboard (CLI)

1. Install deps and build:

   ```bash
   npm install && cd webview-ui && npm install && cd ../server && npm install && cd ../cli && npm install && cd ..
   npm run build
   npm run build:cli
   ```

2. Start the CLI:

   ```bash
   node cli/dist/index.js --port 3000 --project .
   ```

3. First boot: the browser opens and a modal asks _"Instalar hooks de Claude Code"_. Choose:
   - **Sí, siempre** — installs hooks + persists decision so future boots skip the modal.
   - **Solo esta vez** — installs now but asks again if hooks get removed externally.
   - **No, gracias** — skips install + remembers the choice (falls back to JSONL polling).

4. With hooks installed: open any terminal and run `claude`. Within ~200 ms the
   session appears as a minero in the dashboard.

## Flags

- `--port <number>` — HTTP + WebSocket port (default 3000).
- `--project <path>` — project directory to watch (default: cwd).
- `--target browser|electron` — where to render (default: browser).
- `--no-hooks` — skip hook install; rely on JSONL polling only.

## Files created / modified by this flow

- `~/.pixel-agents/config.json` — persists `hooksInstallAccepted` state.
- `~/.pixel-agents/server.json` — hook server discovery (port, pid, token).
- `~/.pixel-agents/hooks/claude-hook.js` — hook script invoked by Claude Code.
- `~/.claude/settings.json` — gains pixel-agents hook entries (one per event).

## Resetting hook state

To re-run the first-run modal:

```bash
rm -f ~/.pixel-agents/config.json
```

Then remove the `pixel-agents` entries manually from `~/.claude/settings.json`
(search for `.pixel-agents/hooks/claude-hook.js` and delete the surrounding
`{ matcher, hooks: [...] }` block for each event).

## Troubleshooting

- **Dashboard is blank / 404s on `/assets/index-*.css`**: rebuild the webview
  (`cd webview-ui && npm run build`) then rebuild the CLI (`node esbuild.js --cli`).
- **`dist/hooks/ not found` during CLI build**: run the full build first
  (`node esbuild.js` without `--cli`) so `buildHooks()` produces the script.
- **Externally-launched `claude` not detected**: check `~/.claude/settings.json`
  has pixel-agents entries for `SessionStart` and `PreToolUse`. If missing,
  delete `~/.pixel-agents/config.json` and restart the CLI to re-prompt.
