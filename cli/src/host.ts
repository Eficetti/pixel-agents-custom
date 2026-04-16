/**
 * HTTP + WebSocket host for the CLI target.
 *
 * Serves the built webview SPA from `webviewDir`, and accepts WebSocket
 * connections at /ws for bidirectional IPC with the Orchestrator. Messages
 * to clients are broadcast (all connected tabs see every update).
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { WebSocketServer, type WebSocket } from 'ws';

import type { MessageSender } from '../../core/src/interfaces.js';
import type { Orchestrator } from '../../core/src/orchestrator.js';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export interface HostConfig {
  port: number;
  webviewDir: string;
  assetsDir: string;
  orchestrator: Orchestrator;
}

export interface HostHandle {
  port: number;
  close: () => Promise<void>;
}

export function startHost(config: HostConfig): Promise<HostHandle> {
  return new Promise((resolve, reject) => {
    const clients = new Set<WebSocket>();

    // Broadcast MessageSender — sends to every connected client.
    const broadcastSender: MessageSender = {
      postMessage(msg: unknown) {
        const data = JSON.stringify(msg);
        for (const ws of clients) {
          if (ws.readyState === ws.OPEN) {
            ws.send(data);
          }
        }
      },
    };

    config.orchestrator.setMessageSender(broadcastSender);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

      // Path resolution: always try webviewDir first. Vite's bundle references
      // /assets/index-<hash>.css|js relative to '/', and webview-ui's build also
      // copies webview-ui/public/assets (game sprites) under webviewDir/assets/,
      // so a single tree serves both the SPA bundle and the game assets.
      //
      // If a file isn't present in webviewDir (e.g. fonts, future route), fall
      // back to the orchestrator's assetsDir, then SPA-fallback to index.html
      // for unknown routes so client-side routing still works.
      const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
      let filePath = path.join(config.webviewDir, relativePath);
      let rootReal = path.resolve(config.webviewDir);

      if (!fs.existsSync(filePath)) {
        const fallback = path.join(config.assetsDir, relativePath.replace(/^assets\//, ''));
        if (fs.existsSync(fallback)) {
          filePath = fallback;
          rootReal = path.resolve(config.assetsDir);
        } else {
          // Unknown route — SPA fallback.
          filePath = path.join(config.webviewDir, 'index.html');
        }
      }

      // Directory traversal guard.
      if (!path.resolve(filePath).startsWith(rootReal)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws) => {
      clients.add(ws);

      ws.on('message', (data) => {
        try {
          const raw = JSON.parse(data.toString()) as Record<string, unknown>;
          if (typeof raw.type !== 'string') {
            console.warn('[pixel-agents] Dropped WebSocket message without string type:', raw);
            return;
          }
          void config.orchestrator.handleMessage(raw as { type: string; [key: string]: unknown });
        } catch (err) {
          console.error('[pixel-agents] Invalid WebSocket message:', err);
        }
      });

      ws.on('close', () => {
        clients.delete(ws);
      });
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(config.port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : config.port;
      console.log(`[pixel-agents] Serving at http://localhost:${actualPort}`);

      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((closeResolve) => {
            wss.close(() => {
              server.close(() => closeResolve());
            });
          }),
      });
    });
  });
}
