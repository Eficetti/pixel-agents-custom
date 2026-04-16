import { describe, it, expect } from 'vitest';
import { shouldPromptUser, shouldAutoInstall, resolveDecision } from '../src/hooksBootstrap.js';

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
