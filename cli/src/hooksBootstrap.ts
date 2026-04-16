/**
 * First-run flow for Claude Code hook installation.
 *
 * Reads ~/.pixel-agents/config.json → hooksInstallAccepted ('always' | 'ask' | 'never').
 * Decides whether to prompt the user, install silently, or skip. See spec
 * docs/superpowers/specs/2026-04-16-agent-flows-dashboard-design.md § "CLI hooks bootstrap".
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

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
