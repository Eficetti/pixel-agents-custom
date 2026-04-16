# Cave Mine Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the pixel art office into a precarious cave mine with Haitian miner characters, a capataz cabin, and themed furniture/environment — applied on top of the multi-target CLI architecture.

**Architecture:** Replace sprite PNGs, floor/wall tiles, furniture assets, and default layout. Update character palettes in code, add capataz detection logic, rename tool status labels. All changes are in the webview and asset layers — no server or extension changes needed.

**Tech Stack:** Pixel art PNGs (16x32 characters, 16x16 floors, 16x32 walls), TypeScript (palette constants, tool labels, capataz FSM)

**Spec:** `docs/superpowers/specs/2026-04-16-cave-mine-theme-design.md`

**Depends on:** `docs/superpowers/plans/2026-04-16-multi-target-cli.md` (core extraction must be done first)

---

## File Structure

### Modified files

```
webview-ui/public/assets/
  characters/char_0.png - char_5.png     — Redraw: Haitian miners with helmet, pickaxe, wheelbarrow
  characters/char_boss.png               — NEW: Capataz sprite sheet (light skin, hat, coffee)
  floors/floor_0.png - floor_8.png       — Redraw: cave dirt, rock, wood planks, rails
  walls/wall_0.png                       — Redraw: cave rock auto-tile
  furniture/                             — NEW: 20+ cave/cabin furniture items with manifests
  default-layout.json                    — NEW: cave-shaped layout with cabin area

webview-ui/src/
  office/sprites/spriteData.ts           — Update CHARACTER_PALETTES
  office/toolUtils.ts                    — Rename status labels
  office/engine/characters.ts            — Add capataz sprite logic
  office/engine/officeState.ts           — Capataz role tracking
  constants.ts                           — Update default colors
```

---

### Task 1: Create miner character sprites

**Files:**
- Modify: `webview-ui/public/assets/characters/char_0.png` through `char_5.png`

Each sprite sheet is 112x96 pixels (7 frames x 16px wide, 3 directions x 32px tall).

- [ ] **Step 1: Design miner sprite in pixel art editor**

Use Aseprite, Piskel, or similar. Design one complete 112x96 sheet with:

**Frame layout per direction row:**
- Frame 0: Walk pose 1 (pickaxe at side)
- Frame 1: Walk pose 2 / idle (standing, leaning on pickaxe)
- Frame 2: Walk pose 3 (opposite step)
- Frame 3: Picking rock — pickaxe raised
- Frame 4: Picking rock — pickaxe down with impact sparks
- Frame 5: Pushing wheelbarrow — push position 1
- Frame 6: Pushing wheelbarrow — push position 2

**Direction rows:**
- Row 0 (y=0-31): Facing down
- Row 1 (y=32-63): Facing up
- Row 2 (y=64-95): Facing right (left = flipped at runtime)

**Visual specs from approved design:**
- Dark outline (`#1a1008`) around full silhouette
- Mining helmet (`#E8C030`/`#C8A020`/`#A88418`) with lamp (`#FFEE66`)
- Skin: see palette per char below
- Rust shirt (`#B86838`/`#A05530`) with torn edges
- Rope belt (`#D4B068`)
- Grey-blue pants (`#6A6A80`/`#585870`) with patches
- Dark boots (`#6B4020`/`#5A3418`)
- White eyes (`#FFFFFF`) with dark pupils (`#222222`)

- [ ] **Step 2: Export 6 palette variations**

Using the approved skin tones from the spec:

| File | Skin Main | Skin Shadow | Skin Highlight |
|------|-----------|-------------|----------------|
| char_0.png | `#8B5E3C` | `#7A5232` | `#B88058` |
| char_1.png | `#7A5232` | `#6B4628` | `#A07048` |
| char_2.png | `#6E4828` | `#5E3C1E` | `#8B5E3C` |
| char_3.png | `#9B6B45` | `#8B5E3C` | `#C08860` |
| char_4.png | `#845530` | `#7A4A28` | `#A06840` |
| char_5.png | `#7B4E2D` | `#6B4220` | `#9B6840` |

Use the existing `scripts/export-characters.ts` as reference for baking palettes into PNGs.

- [ ] **Step 3: Place files in assets/characters/**

Replace the existing `char_0.png` through `char_5.png` files.

- [ ] **Step 4: Verify sprites load**

Run: `npm run build` then open in VS Code Extension Dev Host.
Expected: Characters appear with miner sprites.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/public/assets/characters/char_*.png
git commit -m "art: replace character sprites with Haitian miners"
```

---

### Task 2: Create capataz sprite sheet

**Files:**
- Create: `webview-ui/public/assets/characters/char_boss.png`

- [ ] **Step 1: Design capataz sprite (same 112x96 format)**

**Visual specs:**
- Light skin (`#F5D8B0` / `#E8C8A0` / `#D4B490`)
- Dark hat with gold band (`#4A4A4A`/`#DAA520`)
- White shirt + dark vest (`#FAFAE8`/`#606060`)
- Leather belt with gold buckle (`#7A4A20`/`#DAA520`)
- Dark clean pants (`#3E3E55`)
- Polished shoes (`#6B4020`/`#7B5030`)
- Blue-grey eyes (`#445566`), subtle mustache
- Coffee cup in hand for typing/idle frames

**Frame mapping:**
- Frames 0-2: Relaxed walk (no pickaxe, hands at sides)
- Frame 3-4: Sipping coffee / checking clipboard
- Frame 5-6: Leaning back, relaxed
- Idle (frame 1): Standing with coffee

- [ ] **Step 2: Export to char_boss.png**

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/characters/char_boss.png
git commit -m "art: add capataz character sprite sheet"
```

---

### Task 3: Update CHARACTER_PALETTES in code

**Files:**
- Modify: `webview-ui/src/office/sprites/spriteData.ts`

- [ ] **Step 1: Read current palettes**

Read `webview-ui/src/office/sprites/spriteData.ts` to find the `CHARACTER_PALETTES` constant and understand how palette colors are mapped to sprite regions.

- [ ] **Step 2: Update palettes to Haitian skin tones**

Replace the existing palette definitions with the 6 miner tones. The exact structure depends on how the current code defines palettes (likely an array of color mappings for skin/shirt/pants). Update each palette to use the spec colors.

- [ ] **Step 3: Add boss palette**

Add a 7th palette entry for the capataz sprite, or handle it separately in the character loading logic (since char_boss.png is a separate file).

- [ ] **Step 4: Verify build**

Run: `cd webview-ui && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/office/sprites/spriteData.ts
git commit -m "feat: update CHARACTER_PALETTES to Haitian skin tones + capataz"
```

---

### Task 4: Create cave floor tiles

**Files:**
- Modify: `webview-ui/public/assets/floors/floor_0.png` through `floor_8.png`

- [ ] **Step 1: Design 9 floor patterns (16x16 grayscale each)**

| File | Pattern |
|------|---------|
| floor_0.png | Rough dirt — uneven brown texture |
| floor_1.png | Rocky ground — grey-brown with cracks |
| floor_2.png | Loose gravel/dust — speckled |
| floor_3.png | Wooden planks — old, gapped boards |
| floor_4.png | Wooden planks + carpet weave pattern |
| floor_5.png | Wet rock — darker with slight shine pixels |
| floor_6.png | Mine cart rails on dirt — parallel lines |
| floor_7.png | Polished stone — smooth, slight gradient |
| floor_8.png | Mud/clay — dark, organic texture |

Design as grayscale — the colorize system applies hue/saturation at runtime.

- [ ] **Step 2: Replace floor PNGs**

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/floors/
git commit -m "art: replace floor tiles with cave mine patterns"
```

---

### Task 5: Create cave wall tiles

**Files:**
- Modify: `webview-ui/public/assets/walls/wall_0.png`

- [ ] **Step 1: Design cave rock auto-tile (64x128, 4x4 grid of 16x32 pieces)**

16 pieces following the 4-bit bitmask convention (N=1, E=2, S=4, W=8):
- Each piece is 16px wide x 32px tall (16px tile + 16px vertical face above)
- Rock texture: irregular, jagged edges, visible strata lines
- Occasional wooden support beam detail
- Design as grayscale (colorized at runtime)

Use `scripts/generate-walls.js` and `scripts/wall-tile-editor.html` as design aids.

- [ ] **Step 2: Replace wall_0.png**

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/walls/
git commit -m "art: replace wall tiles with cave rock auto-tile"
```

---

### Task 6: Update default colors

**Files:**
- Modify: `webview-ui/src/constants.ts`

- [ ] **Step 1: Read current color constants**

Find `DEFAULT_FLOOR_COLOR`, `DEFAULT_WALL_COLOR`, `WALL_COLOR` in `webview-ui/src/constants.ts`.

- [ ] **Step 2: Update to cave palette**

```typescript
// Before:
export const DEFAULT_FLOOR_COLOR = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR = { h: 240, s: 25, b: 0, c: 0 };
export const WALL_COLOR = '#3A3A5C';

// After:
export const DEFAULT_FLOOR_COLOR = { h: 25, s: 40, b: 10, c: 0 };  // warm dark brown
export const DEFAULT_WALL_COLOR = { h: 30, s: 30, b: 5, c: 0 };    // dark warm brown
export const WALL_COLOR = '#2A1F0F';  // cave rock base
```

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/constants.ts
git commit -m "feat: update default colors to cave mine palette"
```

---

### Task 7: Create cave furniture sprites

**Files:**
- Create: `webview-ui/public/assets/furniture/ROCK_VEIN/` (manifest.json + PNGs)
- Create: `webview-ui/public/assets/furniture/STONE_SEAT/`
- Create: `webview-ui/public/assets/furniture/LANTERN/`
- Create: `webview-ui/public/assets/furniture/TOOL_RACK/`
- Create: `webview-ui/public/assets/furniture/STALAGMITE/`
- Create: `webview-ui/public/assets/furniture/CAVE_MUSHROOM/`
- Create: `webview-ui/public/assets/furniture/WOOD_BENCH/`
- Create: `webview-ui/public/assets/furniture/WALL_TORCH/`
- Create: `webview-ui/public/assets/furniture/HANGING_PICK/`
- Create: `webview-ui/public/assets/furniture/CAVE_MARKING/`
- Create: `webview-ui/public/assets/furniture/WATER_BARREL/`
- Create: `webview-ui/public/assets/furniture/MINE_CART/`
- Create: `webview-ui/public/assets/furniture/DYNAMITE_CRATE/`

- [ ] **Step 1: Design mining area furniture sprites**

Each item needs:
- PNG sprites (front, back, side orientations as needed)
- `manifest.json` with correct `footprintW`, `footprintH`, `category`, `isDesk`, `canPlaceOnWalls`, etc.

Example manifest for ROCK_VEIN:
```json
{
  "id": "ROCK_VEIN",
  "name": "Rock Vein",
  "category": "desks",
  "type": "group",
  "groupType": "rotation",
  "rotationScheme": "2-way",
  "members": [
    {
      "type": "asset", "id": "ROCK_VEIN_FRONT",
      "file": "ROCK_VEIN_FRONT.png",
      "width": 48, "height": 32,
      "footprintW": 3, "footprintH": 1,
      "isDesk": true, "canPlaceOnWalls": false
    },
    {
      "type": "asset", "id": "ROCK_VEIN_SIDE",
      "file": "ROCK_VEIN_SIDE.png",
      "width": 16, "height": 64,
      "footprintW": 1, "footprintH": 2,
      "isDesk": true, "canPlaceOnWalls": false
    }
  ]
}
```

- [ ] **Step 2: Create all manifest.json files and PNG sprites**

Follow existing patterns in `webview-ui/public/assets/furniture/DESK/manifest.json` etc.

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/furniture/ROCK_VEIN/ webview-ui/public/assets/furniture/STONE_SEAT/ webview-ui/public/assets/furniture/LANTERN/ webview-ui/public/assets/furniture/TOOL_RACK/ webview-ui/public/assets/furniture/STALAGMITE/ webview-ui/public/assets/furniture/CAVE_MUSHROOM/ webview-ui/public/assets/furniture/WOOD_BENCH/ webview-ui/public/assets/furniture/WALL_TORCH/ webview-ui/public/assets/furniture/HANGING_PICK/ webview-ui/public/assets/furniture/CAVE_MARKING/ webview-ui/public/assets/furniture/WATER_BARREL/ webview-ui/public/assets/furniture/MINE_CART/ webview-ui/public/assets/furniture/DYNAMITE_CRATE/
git commit -m "art: add cave mining area furniture sprites"
```

---

### Task 8: Create capataz cabin furniture sprites

**Files:**
- Create: `webview-ui/public/assets/furniture/NICE_TABLE/`
- Create: `webview-ui/public/assets/furniture/NICE_CHAIR/`
- Create: `webview-ui/public/assets/furniture/NICE_LAMP/`
- Create: `webview-ui/public/assets/furniture/NICE_BOOKSHELF/`
- Create: `webview-ui/public/assets/furniture/STOVE/`
- Create: `webview-ui/public/assets/furniture/COFFEE_MUG/`
- Create: `webview-ui/public/assets/furniture/CABIN_RUG/`
- Create: `webview-ui/public/assets/furniture/WALL_FRAME/`
- Create: `webview-ui/public/assets/furniture/POTTED_PLANT/`

- [ ] **Step 1: Design cabin furniture**

Higher quality than mining furniture — clean lines, warmer colors, polished look. Same manifest structure.

COFFEE_MUG should have `canPlaceOnSurfaces: true`.
STOVE and NICE_LAMP should have `state: "on"` / `state: "off"` variants.
WALL_FRAME should have `canPlaceOnWalls: true`.

- [ ] **Step 2: Create manifests and PNGs**

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/furniture/NICE_TABLE/ webview-ui/public/assets/furniture/NICE_CHAIR/ webview-ui/public/assets/furniture/NICE_LAMP/ webview-ui/public/assets/furniture/NICE_BOOKSHELF/ webview-ui/public/assets/furniture/STOVE/ webview-ui/public/assets/furniture/COFFEE_MUG/ webview-ui/public/assets/furniture/CABIN_RUG/ webview-ui/public/assets/furniture/WALL_FRAME/ webview-ui/public/assets/furniture/POTTED_PLANT/
git commit -m "art: add capataz cabin furniture sprites"
```

---

### Task 9: Create cave default layout

**Files:**
- Modify: `webview-ui/public/assets/default-layout.json`

- [ ] **Step 1: Design cave layout (20x11 grid)**

Layout structure:
- Left ~60%: Mining area with VOID tiles at edges for irregular cave shape
- Right ~30%: Cabin separated by wall tiles, nice floor
- Bottom: Tunnel entrance with rails

Place furniture:
- Mining area: 3-4 ROCK_VEIN desks, STONE_SEAT chairs, LANTERN lamps, TOOL_RACK, STALAGMITE, WALL_TORCH on walls
- Cabin: NICE_TABLE, NICE_CHAIR, NICE_LAMP, STOVE, COFFEE_MUG, WALL_FRAME, POTTED_PLANT

```json
{
  "version": 1,
  "cols": 20,
  "rows": 11,
  "tiles": [ /* TileType values: 0=VOID, 1=FLOOR, 2=WALL */ ],
  "tileColors": [ /* FloorColor per tile */ ],
  "furniture": [ /* PlacedFurniture items */ ]
}
```

- [ ] **Step 2: Test layout loads correctly**

Run: `npm run build`, open Extension Dev Host, check the default layout renders.

- [ ] **Step 3: Commit**

```bash
git add webview-ui/public/assets/default-layout.json
git commit -m "art: add cave mine default layout with cabin"
```

---

### Task 10: Rename tool status labels

**Files:**
- Modify: `webview-ui/src/office/toolUtils.ts`

- [ ] **Step 1: Read current toolUtils.ts**

Find the `STATUS_TO_TOOL` mapping and `formatToolStatus` / `extractToolName` functions.

- [ ] **Step 2: Update status labels**

```typescript
// Replace label strings per spec:
// "Reading" → "Examinando"
// "Writing" → "Picando"
// "Editing" → "Tallando"
// "Running" → "Excavando"
// "Searching" → "Buscando veta"
// "Globbing" → "Explorando"
// "Fetching" → "Extrayendo"
// "Task" → "Faena"
// "Searching web" → "Prospectando"
```

Update the `STATUS_TO_TOOL` map keys and the `formatToolStatus` function to use the new labels.

- [ ] **Step 3: Verify build**

Run: `cd webview-ui && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add webview-ui/src/office/toolUtils.ts
git commit -m "feat: rename tool status labels to mining theme"
```

---

### Task 11: Add capataz detection logic

**Files:**
- Modify: `webview-ui/src/office/engine/characters.ts`
- Modify: `webview-ui/src/office/engine/officeState.ts`

- [ ] **Step 1: Read current character and officeState code**

Understand:
- How `addAgent()` creates characters with palette
- How `updateCharacterTool()` changes animation state
- How sub-agent tracking works (`subagentMeta`)

- [ ] **Step 2: Add capataz sprite loading in officeState.ts**

When an agent's `activeSubagentToolNames` map becomes non-empty, mark that character as capataz:

```typescript
// In officeState.ts — method that handles agentToolStart with sub-agent
updateAgentRole(agentId: number, hasSubagents: boolean): void {
  const ch = this.characters.get(agentId);
  if (!ch) return;

  if (hasSubagents && !ch.isCapataz) {
    ch.isCapataz = true;
    ch.palette = BOSS_PALETTE_INDEX; // index for char_boss.png
    ch.hueShift = 0;
    // Pathfind to cabin seat if available
    const cabinSeat = this.findCabinSeat();
    if (cabinSeat) {
      this.assignSeat(agentId, cabinSeat);
    }
  } else if (!hasSubagents && ch.isCapataz) {
    ch.isCapataz = false;
    // Revert to original palette
    ch.palette = ch.originalPalette;
    ch.hueShift = ch.originalHueShift;
  }
}
```

- [ ] **Step 3: Add isCapataz field to Character type**

In `webview-ui/src/office/types.ts`:

```typescript
export interface Character {
  // ... existing fields
  isCapataz?: boolean;
  originalPalette?: number;
  originalHueShift?: number;
}
```

- [ ] **Step 4: Update getCharacterSprites in characters.ts**

When `ch.isCapataz` is true, use the boss sprite set instead of the regular miner sprites:

```typescript
export function getCharacterSprites(
  palette: number,
  hueShift: number,
  isCapataz?: boolean,
): CharacterSprites {
  if (isCapataz) {
    return getBossSprites(); // loads from char_boss.png data
  }
  return getMinerSprites(palette, hueShift);
}
```

- [ ] **Step 5: Verify build and test**

Run: `npm run build`
Expected: PASS — capataz logic compiles, regular agents still work.

- [ ] **Step 6: Commit**

```bash
git add webview-ui/src/office/engine/characters.ts webview-ui/src/office/engine/officeState.ts webview-ui/src/office/types.ts
git commit -m "feat: add capataz detection — switch to boss sprite when orchestrating sub-agents"
```

---

### Task 12: Remove old office furniture (optional cleanup)

**Files:**
- Remove: `webview-ui/public/assets/furniture/DESK/`, `CUSHIONED_CHAIR/`, `PC/`, `MONITOR/`, etc.

- [ ] **Step 1: Delete old office furniture that has been fully replaced**

Keep any furniture that's still referenced by the new layout or that doesn't have a cave equivalent yet.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — no missing asset references.

- [ ] **Step 3: Commit**

```bash
git add -A webview-ui/public/assets/furniture/
git commit -m "chore: remove old office furniture assets, replaced by cave theme"
```

---

### Task 13: Final integration test

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Test in VS Code Extension Dev Host**

- Open Extension Dev Host (F5)
- Verify cave layout loads as default
- Create an agent → miner appears with pickaxe animation
- Create agent with sub-agents → capataz appears in cabin with coffee
- Verify tool labels show mining theme ("Examinando", "Picando", etc.)
- Verify floor/wall tiles render with cave textures

- [ ] **Step 3: Test in browser (CLI target)**

Run: `npm run start:browser -- --project .`
- Verify same visualization appears in browser
- Verify WebSocket communication works (agents create/update)

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat: cave mine theme integration complete"
```
