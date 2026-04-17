/**
 * Shared constants — used by the extension host, Vite build scripts,
 * and future standalone backend.
 *
 * No VS Code dependency. Only asset parsing and layout-related values.
 */

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 2;
export const WALL_PIECE_WIDTH = 64;
export const WALL_PIECE_HEIGHT = 128;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_TILE_SIZE = 64;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 64;
export const CHAR_FRAME_H = 128;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

/** Palette index reserved for the capataz sprite (char_boss.png). Loaded after the
 *  regular 6 miners, so index = CHAR_COUNT. Not assigned to agents by default;
 *  only used when a character is marked as capataz (has active sub-agents). */
export const BOSS_PALETTE_INDEX = CHAR_COUNT;
