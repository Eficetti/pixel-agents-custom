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
