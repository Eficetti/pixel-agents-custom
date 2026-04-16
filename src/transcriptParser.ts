import type * as vscode from 'vscode';

import * as coreParser from '../core/src/transcriptParser.js';
import type { HookProvider } from '../server/src/provider.js';
import type { AgentState } from './types.js';

export const PERMISSION_EXEMPT_TOOLS = coreParser.PERMISSION_EXEMPT_TOOLS;

function toSender(
  webview: vscode.Webview | undefined,
): { postMessage: (msg: unknown) => void } | undefined {
  return webview
    ? {
        postMessage: (msg: unknown) => {
          webview.postMessage(msg);
        },
      }
    : undefined;
}

/** Register the HookProvider that owns CLI-specific formatting and team metadata extraction. */
export function setHookProvider(provider: HookProvider): void {
  coreParser.setHookProvider(provider);
}

/** Format a tool status line. Delegates to the active HookProvider's formatToolStatus. */
export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  return coreParser.formatToolStatus(toolName, input);
}

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
): void {
  coreParser.processTranscriptLine(
    agentId,
    line,
    agents,
    waitingTimers,
    permissionTimers,
    toSender(webview),
  );
}
