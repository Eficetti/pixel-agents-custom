/**
 * Generate webview-ui/public/assets/default-layout-2.json — the cave-mine
 * themed default layout. Revision bumped from 1 → 2 so existing installs pick
 * it up via loadDefaultLayout()'s highest-revision scan.
 *
 *   npx tsx scripts/generate-cave-layout.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.join(__dirname, '..', 'webview-ui', 'public', 'assets', 'default-layout-2.json');

const COLS = 22;
const ROWS = 13;

// Tile values — must match webview-ui/src/office/types.ts#TileType.
const VOID = 255;
const WALL = 0;
const FLOOR_DIRT = 1; // floor_0.png (rough dirt)
const FLOOR_ROCKY = 2; // floor_1.png
const FLOOR_GRAVEL = 3; // floor_2.png
const FLOOR_PLANKS = 4; // floor_3.png
const FLOOR_CARPET = 5; // floor_4.png
const FLOOR_WET = 6; // floor_5.png (wet rock)
const FLOOR_RAILS = 7; // floor_6.png
const FLOOR_STONE = 8; // floor_7.png (polished stone, cabin entry)

interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize?: boolean;
}

interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
  on?: boolean;
  color?: FloorColor;
}

// Color palettes — Colorize mode applies hue/sat to grayscale textures.
const DIRT_COLOR: FloorColor = { h: 25, s: 40, b: 10, c: 0, colorize: true };
const ROCK_COLOR: FloorColor = { h: 30, s: 20, b: 5, c: 0, colorize: true };
const CABIN_WOOD: FloorColor = { h: 28, s: 55, b: 12, c: 5, colorize: true };
const CABIN_CARPET: FloorColor = { h: 12, s: 70, b: 18, c: 0, colorize: true };
const STONE_COLOR: FloorColor = { h: 30, s: 15, b: 25, c: 0, colorize: true };
const WET_COLOR: FloorColor = { h: 210, s: 25, b: -5, c: 0, colorize: true };
const RAILS_COLOR: FloorColor = { h: 25, s: 40, b: 5, c: 0, colorize: true };
const WALL_COLOR_TILE: FloorColor = { h: 30, s: 30, b: 5, c: 0, colorize: true };

// ── Build tiles ──────────────────────────────────────────────
const tiles: number[] = new Array(COLS * ROWS).fill(VOID);
const tileColors: (FloorColor | null)[] = new Array(COLS * ROWS).fill(null);

function set(col: number, row: number, type: number, color: FloorColor | null = null): void {
  const idx = row * COLS + col;
  tiles[idx] = type;
  tileColors[idx] = color;
}

// Cave shape: rounded rectangle, inset 1-2 tiles from edges to suggest irregularity.
// Outer ring of walls, interior = open mining space + cabin.
for (let r = 1; r <= ROWS - 2; r++) {
  for (let c = 1; c <= COLS - 2; c++) set(c, r, FLOOR_DIRT, DIRT_COLOR);
}

// Walls along the interior border
for (let c = 1; c <= COLS - 2; c++) {
  set(c, 1, WALL, WALL_COLOR_TILE);
  set(c, ROWS - 2, WALL, WALL_COLOR_TILE);
}
for (let r = 1; r <= ROWS - 2; r++) {
  set(1, r, WALL, WALL_COLOR_TILE);
  set(COLS - 2, r, WALL, WALL_COLOR_TILE);
}

// Carve a cave opening in the bottom-left corner (tunnel entrance) with rails.
set(3, ROWS - 2, FLOOR_RAILS, RAILS_COLOR);
set(4, ROWS - 2, FLOOR_RAILS, RAILS_COLOR);
set(3, ROWS - 3, FLOOR_RAILS, RAILS_COLOR);
set(4, ROWS - 3, FLOOR_RAILS, RAILS_COLOR);

// Mining area floor variants (cols 2-12, rows 2-9)
for (let r = 2; r <= ROWS - 3; r++) {
  for (let c = 2; c <= 12; c++) {
    // Alternate rocky/gravel patches
    const n = (c * 3 + r * 5) % 7;
    if (n === 0) set(c, r, FLOOR_ROCKY, ROCK_COLOR);
    else if (n === 1) set(c, r, FLOOR_GRAVEL, DIRT_COLOR);
    else if (n === 6 && r === ROWS - 3) set(c, r, FLOOR_WET, WET_COLOR);
    // else stay FLOOR_DIRT
  }
}

// Cabin separator wall (col 13) with a door gap at row 6
for (let r = 2; r <= ROWS - 3; r++) {
  if (r !== 6) set(13, r, WALL, WALL_COLOR_TILE);
  else set(13, r, FLOOR_STONE, STONE_COLOR); // cabin entry
}

// Cabin floor (cols 14-19, polished wood)
for (let r = 2; r <= ROWS - 3; r++) {
  for (let c = 14; c <= COLS - 3; c++) {
    // Inner rug region
    const isCarpet = r >= 5 && r <= 7 && c >= 16 && c <= 18;
    set(c, r, isCarpet ? FLOOR_CARPET : FLOOR_PLANKS, isCarpet ? CABIN_CARPET : CABIN_WOOD);
  }
}

// ── Furniture ────────────────────────────────────────────────
let nextUid = 1;
const uid = () => `fur-${nextUid++}`;

const furniture: PlacedFurniture[] = [];

// Mining area — 3 rock vein desks with stone seats facing them
for (let i = 0; i < 3; i++) {
  const row = 3 + i * 2;
  furniture.push({ uid: uid(), type: 'ROCK_VEIN_FRONT', col: 3, row });
  furniture.push({ uid: uid(), type: 'STONE_SEAT', col: 6, row });
  // Lantern on surface of each rock vein
  furniture.push({ uid: uid(), type: 'LANTERN_ON', col: 4, row: row - 1 });
}

// Tool rack (storage) in corner
furniture.push({ uid: uid(), type: 'TOOL_RACK', col: 10, row: 3 });

// Decoration — stalagmite + glowing mushroom scattered
furniture.push({ uid: uid(), type: 'STALAGMITE', col: 8, row: 8 });
furniture.push({ uid: uid(), type: 'CAVE_MUSHROOM', col: 10, row: 9 });

// Wooden bench for two miners
furniture.push({ uid: uid(), type: 'WOOD_BENCH', col: 2, row: ROWS - 4 });

// Wall decorations (row 1 = wall row, place above)
furniture.push({ uid: uid(), type: 'WALL_TORCH', col: 4, row: 0 });
furniture.push({ uid: uid(), type: 'WALL_TORCH', col: 10, row: 0 });
furniture.push({ uid: uid(), type: 'HANGING_PICK', col: 7, row: 0 });
furniture.push({ uid: uid(), type: 'CAVE_MARKING', col: 2, row: 0 });

// Water barrel, mine cart, dynamite crate
furniture.push({ uid: uid(), type: 'WATER_BARREL', col: 11, row: 9 });
furniture.push({ uid: uid(), type: 'MINE_CART', col: 3, row: ROWS - 2 });
furniture.push({ uid: uid(), type: 'DYNAMITE_CRATE', col: 11, row: 5 });

// Cabin — capataz seat + nice table
furniture.push({ uid: uid(), type: 'NICE_TABLE', col: 15, row: 5 });
furniture.push({ uid: uid(), type: 'NICE_CHAIR', col: 17, row: 6 });
furniture.push({ uid: uid(), type: 'NICE_LAMP_ON', col: 16, row: 4 });
furniture.push({ uid: uid(), type: 'NICE_BOOKSHELF', col: 18, row: 2 });
furniture.push({ uid: uid(), type: 'STOVE_ON', col: 14, row: 2 });
furniture.push({ uid: uid(), type: 'COFFEE_MUG', col: 16, row: 5 });
furniture.push({ uid: uid(), type: 'CABIN_RUG', col: 16, row: 8 });
furniture.push({ uid: uid(), type: 'WALL_FRAME', col: 18, row: 0 });
furniture.push({ uid: uid(), type: 'POTTED_PLANT', col: 19, row: 9 });

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  layoutRevision: 2,
  tiles,
  tileColors,
  furniture,
};

fs.writeFileSync(OUT, JSON.stringify(layout, null, 2) + '\n');
console.log(`✓ Wrote cave layout → ${OUT}`);
