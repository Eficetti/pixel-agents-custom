import type { JSX } from 'react';

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
        background: 'var(--modal-overlay-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-bg)',
          border: '2px solid var(--color-border)',
          boxShadow: 'var(--pixel-shadow)',
          padding: '24px',
          maxWidth: '480px',
          color: 'var(--color-text)',
          fontFamily: "'FS Pixel Sans', sans-serif",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Instalar hooks de Claude Code</h2>
        <p>
          Para detectar agentes lanzados desde cualquier terminal, el dashboard necesita instalar
          hooks en <code>~/.claude/settings.json</code>. Es reversible desde Settings en cualquier
          momento.
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
