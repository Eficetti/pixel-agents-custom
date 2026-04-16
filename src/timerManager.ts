import type * as vscode from 'vscode';

import type * as CoreTimer from '../core/src/timerManager.js' with { 'resolution-mode': 'import' };
import type { AgentState } from './types.js';
 
const coreTimer = require('../core/src/timerManager.js') as typeof CoreTimer;

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

export function clearAgentActivity(
  agent: AgentState | undefined,
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
): void {
  coreTimer.clearAgentActivity(agent, agentId, permissionTimers, toSender(webview));
}

export function cancelWaitingTimer(
  agentId: number,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  coreTimer.cancelWaitingTimer(agentId, waitingTimers);
}

export function startWaitingTimer(
  agentId: number,
  delayMs: number,
  agents: Map<number, AgentState>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  webview: vscode.Webview | undefined,
): void {
  coreTimer.startWaitingTimer(agentId, delayMs, agents, waitingTimers, toSender(webview));
}

export function cancelPermissionTimer(
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  coreTimer.cancelPermissionTimer(agentId, permissionTimers);
}

export function startPermissionTimer(
  agentId: number,
  agents: Map<number, AgentState>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionExemptTools: Set<string>,
  webview: vscode.Webview | undefined,
): void {
  coreTimer.startPermissionTimer(
    agentId,
    agents,
    permissionTimers,
    permissionExemptTools,
    toSender(webview),
  );
}
