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
