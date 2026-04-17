/** Map status prefixes back to tool names for animation selection.
 *  Prefixes match the Spanish mining-theme labels emitted by
 *  server/src/providers/hook/claude/claude.ts#formatToolStatus. */
const STATUS_TO_TOOL: Record<string, string> = {
  Examinando: 'Read',
  'Buscando veta': 'Grep',
  Explorando: 'Glob',
  Extrayendo: 'WebFetch',
  Prospectando: 'WebSearch',
  Picando: 'Write',
  Tallando: 'Edit',
  Excavando: 'Bash',
  Faena: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import { TILE_SIZE, ZOOM_APPARENT_TILE_PX, ZOOM_MIN } from '../constants.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(ZOOM_MIN, Math.round((ZOOM_APPARENT_TILE_PX * dpr) / TILE_SIZE));
}
