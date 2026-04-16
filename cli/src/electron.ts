/**
 * Electron target — wraps the HTTP+WS host in a BrowserWindow.
 *
 * Electron is an optional dependency: we `import()` it dynamically so the
 * CLI stays runnable without it installed. `--target electron` triggers this
 * path; everything else goes through the default browser.
 */
import { startHost, type HostConfig } from './host.js';

interface ElectronApp {
  whenReady(): Promise<void>;
  quit(): void;
  on(event: string, handler: () => void): void;
}

interface ElectronBrowserWindowCtor {
  new (options: {
    width: number;
    height: number;
    title: string;
    webPreferences: { nodeIntegration: boolean; contextIsolation: boolean };
  }): {
    loadURL(url: string): void;
    on(event: string, handler: () => void): void;
  };
}

interface ElectronModule {
  app: ElectronApp;
  BrowserWindow: ElectronBrowserWindowCtor;
}

export async function startElectron(config: HostConfig): Promise<void> {
  let electron: ElectronModule;
  try {
    // Dynamic import keeps electron optional at install time.
    // @ts-expect-error Optional peer — not installed by default.
    electron = (await import('electron')) as unknown as ElectronModule;
  } catch {
    console.error(
      '[pixel-agents] Electron is not installed. Run `npm install electron` or use `--target browser`.',
    );
    process.exit(1);
  }

  const { app, BrowserWindow } = electron;
  const host = await startHost(config);

  await app.whenReady();

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
    void host.close().then(() => app.quit());
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
