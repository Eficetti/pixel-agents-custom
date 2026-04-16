/**
 * MessageTransport — abstract IPC layer for the webview.
 *
 * Two concrete implementations:
 * - VsCodeTransport: wraps acquireVsCodeApi() and the global 'message' event
 *   (how VS Code webviews communicate today).
 * - WebSocketTransport: opens a ws:// connection to the CLI host, serializes
 *   messages as JSON. Queues pre-open sends so the UI never has to worry
 *   about connection timing.
 *
 * createTransport() auto-detects the environment so App/hooks don't need to
 * know which host they're running in.
 */

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export interface MessageTransport {
  postMessage(msg: unknown): void;
  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(callback: (msg: unknown) => void): () => void;
}

/** VS Code webview transport — postMessage via acquireVsCodeApi, receive via window 'message' events. */
export class VsCodeTransport implements MessageTransport {
  private readonly api: { postMessage(msg: unknown): void };

  constructor() {
    this.api = acquireVsCodeApi();
  }

  postMessage(msg: unknown): void {
    this.api.postMessage(msg);
  }

  onMessage(callback: (msg: unknown) => void): () => void {
    const handler = (event: MessageEvent) => callback(event.data);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

/** WebSocket transport for browser/electron targets served by the CLI host. */
export class WebSocketTransport implements MessageTransport {
  private readonly ws: WebSocket;
  private readonly pending: unknown[] = [];
  private ready = false;
  private readonly listeners = new Set<(msg: unknown) => void>();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.ready = true;
      for (const msg of this.pending) {
        this.ws.send(JSON.stringify(msg));
      }
      this.pending.length = 0;
    });
    this.ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        for (const listener of this.listeners) listener(msg);
      } catch (err) {
        console.error('[pixel-agents] Invalid WebSocket message payload:', err);
      }
    });
    this.ws.addEventListener('close', () => {
      this.ready = false;
    });
    this.ws.addEventListener('error', (event) => {
      console.error('[pixel-agents] WebSocket error:', event);
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
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

/** Mock transport for unsupported environments (e.g. SSR, tests). */
export class NoopTransport implements MessageTransport {
  postMessage(msg: unknown): void {
    console.log('[pixel-agents] noop postMessage:', msg);
  }
  onMessage(_callback: (msg: unknown) => void): () => void {
    void _callback;
    return () => {};
  }
}

/** Auto-detect the environment and build the right transport. */
export function createTransport(): MessageTransport {
  if (typeof acquireVsCodeApi === 'function') {
    return new VsCodeTransport();
  }
  if (typeof window !== 'undefined' && typeof WebSocket !== 'undefined') {
    const url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    return new WebSocketTransport(url);
  }
  return new NoopTransport();
}
