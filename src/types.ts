// Re-export core types — type-only import erases to nothing at runtime, no CJS/ESM boundary issue
import type {
  AgentState as _AgentState,
  PersistedAgent as _PersistedAgent,
} from '../core/src/types.js' with { 'resolution-mode': 'import' };
export type AgentState = _AgentState;
export type PersistedAgent = _PersistedAgent;
