/**
 * Webview IPC singleton.
 *
 * Historically this file directly called acquireVsCodeApi(). It now delegates
 * to a MessageTransport so the same UI code works in VS Code and in a browser
 * served by the CLI host (WebSocket transport).
 *
 * `vscode` is kept as a backward-compat export — it only carries postMessage.
 * Use `transport.onMessage` when you need to receive messages.
 */
import { createTransport, type MessageTransport } from './messageTransport.js';

export const transport: MessageTransport = createTransport();

export const vscode: { postMessage(msg: unknown): void } = {
  postMessage: (msg: unknown) => transport.postMessage(msg),
};
