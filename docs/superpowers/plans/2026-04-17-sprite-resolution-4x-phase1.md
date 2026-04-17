# Sprite Resolution 4× — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escalar la infraestructura de sprites de 16-px base a 64-px base (4× en cada dimensión), regenerando todos los PNGs vía `scripts/generate-cave-theme.ts` sin introducir nuevo detalle artístico. Output visual idéntico, archivos 4× más grandes.

**Architecture:** Un único `SCALE = 4` dentro de la clase `Canvas` del generador — todas las llamadas a `pixel()`/`rect()`/`line()`/`blit()` escriben bloques 4×4 al buffer interno. Las funciones que serializan manifests multiplican `width`/`height` por `SCALE` (footprints en tiles no cambian). Constantes `_PX` del webview escalan ×4. `defaultZoom()` pasa a computarse como `round(ZOOM_APPARENT_TILE_PX * dpr / TILE_SIZE)` para preservar tamaño aparente.

**Tech Stack:** TypeScript (webview-ui + scripts), `pngjs` (generador), `vitest` (tests), `esbuild` (bundle), `chrome-devtools` MCP (visual regression).

**Spec:** `docs/superpowers/specs/2026-04-17-sprite-resolution-4x-phase1-design.md`.

---

## File Structure

### Modified files

```
scripts/generate-cave-theme.ts                — Canvas class (SCALE=4), manifest writers scale width/height
webview-ui/src/constants.ts                   — TILE_SIZE=64, _PX constants ×4, new ZOOM_APPARENT_TILE_PX
webview-ui/src/office/toolUtils.ts            — defaultZoom() uses ZOOM_APPARENT_TILE_PX
```

### Regenerated (binary) files

```
webview-ui/public/assets/characters/char_0..5.png, char_boss.png   — 448×384 (was 112×96)
webview-ui/public/assets/floors/floor_0..8.png                     — 64×64 (was 16×16)
webview-ui/public/assets/walls/wall_0.png                          — 256×512 (was 64×128)
webview-ui/public/assets/furniture/<ID>/*.png                      — 4× each dim
webview-ui/public/assets/furniture/<ID>/manifest.json              — 4× width/height
```

---

### Task 1: Canvas class — SCALE=4 refactor

**Files:**

- Modify: `scripts/generate-cave-theme.ts` (lines 27–122)

- [ ] **Step 1: Add `SCALE` constant and refactor `Canvas` to internally scale**

Replace the existing `Canvas` class (lines 27–122) with:

```typescript
// ── Render scale ─────────────────────────────────────────────
// Single source of truth for 4× upscale. The drawing code expresses coordinates
// in "logical 16-px units"; the Canvas class turns every logical pixel into a
// SCALE×SCALE block, producing 4× output without touching call sites.
const SCALE = 4;

// ── Canvas primitive ─────────────────────────────────────────
class Canvas {
  readonly data: Uint8Array;
  readonly pw: number; // physical width (w * SCALE)
  readonly ph: number; // physical height (h * SCALE)

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.pw = w * SCALE;
    this.ph = h * SCALE;
    this.data = new Uint8Array(this.pw * this.ph * 4); // RGBA, all zero
  }

  pixel(x: number, y: number, hex: string, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = parseHex(hex);
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const i = ((y * SCALE + dy) * this.pw + (x * SCALE + dx)) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = alpha;
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.pixel(x + dx, y + dy, hex);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.pixel(x, y, hex);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  hline(x: number, y: number, w: number, hex: string): void {
    this.rect(x, y, w, 1, hex);
  }

  /** Blit another canvas at logical (x,y). Source alpha overrides destination. */
  blit(src: Canvas, x: number, y: number): void {
    for (let sy = 0; sy < src.ph; sy++) {
      for (let sx = 0; sx < src.pw; sx++) {
        const si = (sy * src.pw + sx) * 4;
        const a = src.data[si + 3];
        if (a === 0) continue;
        const dx = x * SCALE + sx;
        const dy = y * SCALE + sy;
        if (dx < 0 || dy < 0 || dx >= this.pw || dy >= this.ph) continue;
        const di = (dy * this.pw + dx) * 4;
        this.data[di] = src.data[si];
        this.data[di + 1] = src.data[si + 1];
        this.data[di + 2] = src.data[si + 2];
        this.data[di + 3] = a;
      }
    }
  }

  /** Horizontally mirror another canvas and blit at logical (x,y). */
  blitMirrored(src: Canvas, x: number, y: number): void {
    const mirrored = new Canvas(src.w, src.h);
    for (let sy = 0; sy < src.ph; sy++) {
      for (let sx = 0; sx < src.pw; sx++) {
        const si = (sy * src.pw + sx) * 4;
        const di = (sy * mirrored.pw + (src.pw - 1 - sx)) * 4;
        mirrored.data[di] = src.data[si];
        mirrored.data[di + 1] = src.data[si + 1];
        mirrored.data[di + 2] = src.data[si + 2];
        mirrored.data[di + 3] = src.data[si + 3];
      }
    }
    this.blit(mirrored, x, y);
  }

  savePng(filePath: string): void {
    const png = new PNG({ width: this.pw, height: this.ph });
    png.data = Buffer.from(this.data);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, PNG.sync.write(png));
  }
}
```

Key changes from original:

- Added `SCALE = 4` constant at module scope
- Added `pw`/`ph` (physical buffer dims = `w * SCALE`, `h * SCALE`)
- `pixel()` writes a `SCALE × SCALE` block instead of 1 pixel
- `blit()` iterates physical pixels of src and writes at `x*SCALE + sx` etc
- `blitMirrored()` mirrors in physical space
- `savePng()` uses `pw`/`ph` for PNG dimensions

Everything else (`rect`, `line`, `hline`) is unchanged; they call `pixel()` which handles the scaling transparently.

- [ ] **Step 2: Type-check the script**

Run: `npx tsc --noEmit scripts/generate-cave-theme.ts`
Expected: PASS. No type errors.

- [ ] **Step 3: Run the generator and spot-check one output file**

Run: `npx tsx scripts/generate-cave-theme.ts`
Expected: completes without errors; all `✓` messages print.

Check a known-simple output:

Run (bash): `file webview-ui/public/assets/floors/floor_0.png`
Expected: `PNG image data, 64 x 64, ...` (was 16 × 16).

Also check a character:

Run (bash): `file webview-ui/public/assets/characters/char_0.png`
Expected: `PNG image data, 448 x 384, ...` (was 112 × 96).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-cave-theme.ts webview-ui/public/assets/
git commit -m "feat(assets): Canvas SCALE=4 — regenerate all PNGs at 4x resolution"
```

---

### Task 2: Manifest writers scale width/height

**Files:**

- Modify: `scripts/generate-cave-theme.ts` (around lines 1370–1449, `writeFurnitureManifest` + `writeStatefulFurnitureManifest` + inline members in `generateMiningFurniture`)

- [ ] **Step 1: Update `writeFurnitureManifest`**

Find `writeFurnitureManifest` (starts ~line 1370). Modify the asset-branch and the members loop so that `width`/`height` of each member get multiplied by `SCALE` at serialization time. Replace the function body with:

```typescript
function writeFurnitureManifest(
  dir: string,
  def: FurnitureDef & { members?: ManifestMember[] },
): void {
  const manifest: Record<string, unknown> = {
    id: def.id,
    name: def.name,
    category: def.category,
    canPlaceOnWalls: def.canPlaceOnWalls ?? false,
    canPlaceOnSurfaces: def.canPlaceOnSurfaces ?? false,
    backgroundTiles: def.backgroundTiles ?? 0,
  };
  if (def.members) {
    manifest.type = 'group';
    manifest.groupType = 'rotation';
    manifest.rotationScheme = '2-way';
    manifest.members = def.members.map((m) => ({
      ...m,
      width: m.width * SCALE,
      height: m.height * SCALE,
    }));
  } else {
    manifest.type = 'asset';
    manifest.width = def.width * SCALE;
    manifest.height = def.height * SCALE;
    manifest.footprintW = def.footprintW;
    manifest.footprintH = def.footprintH;
    if (def.isDesk) manifest.isDesk = true;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
```

Note: footprints stay as-is (tile units, not pixels).

- [ ] **Step 2: Update `writeStatefulFurnitureManifest`**

Modify the two member entries' `width`/`height` to multiply by `SCALE`. Replace the function body with:

```typescript
function writeStatefulFurnitureManifest(
  dir: string,
  id: string,
  name: string,
  category: string,
  opts: {
    footprintW: number;
    footprintH: number;
    width: number;
    height: number;
    canPlaceOnSurfaces?: boolean;
    backgroundTiles?: number;
    canPlaceOnWalls?: boolean;
    isDesk?: boolean;
  },
): void {
  const w = opts.width * SCALE;
  const h = opts.height * SCALE;
  const manifest = {
    id,
    name,
    category,
    canPlaceOnWalls: opts.canPlaceOnWalls ?? false,
    canPlaceOnSurfaces: opts.canPlaceOnSurfaces ?? false,
    backgroundTiles: opts.backgroundTiles ?? 0,
    type: 'group',
    groupType: 'state',
    members: [
      {
        type: 'asset',
        id: `${id}_OFF`,
        file: `${id}_OFF.png`,
        width: w,
        height: h,
        footprintW: opts.footprintW,
        footprintH: opts.footprintH,
        state: 'off',
        ...(opts.isDesk ? { isDesk: true } : {}),
      },
      {
        type: 'asset',
        id: `${id}_ON`,
        file: `${id}_ON.png`,
        width: w,
        height: h,
        footprintW: opts.footprintW,
        footprintH: opts.footprintH,
        state: 'on',
        ...(opts.isDesk ? { isDesk: true } : {}),
      },
    ],
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
```

- [ ] **Step 3: Audit any inline `writeFurnitureManifest` calls with members that pass hardcoded width/height**

Run: `grep -n "members: \[" scripts/generate-cave-theme.ts`
Any call site where a member object is constructed inline (e.g., ROCK_VEIN at line ~1503) with hardcoded `width: 48` — these are now handled by the new `.map()` in `writeFurnitureManifest`. Confirm visually that no member object bypasses the serializer.

Expected: every member object passed to `writeFurnitureManifest` flows through the `members.map()` step and gets scaled.

- [ ] **Step 4: Re-run the generator**

Run: `npx tsx scripts/generate-cave-theme.ts`
Expected: completes without errors.

- [ ] **Step 5: Verify a manifest**

Run: `cat webview-ui/public/assets/furniture/STONE_SEAT/manifest.json`
Expected: `width` and `height` are now 64 (was 16). `footprintW`, `footprintH` remain 1.

Run: `cat webview-ui/public/assets/furniture/ROCK_VEIN/manifest.json`
Expected: `members[0].width = 192` (was 48), `members[0].height = 128` (was 32), `members[1].width = 64` (was 16), `members[1].height = 256` (was 64). Footprints unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-cave-theme.ts webview-ui/public/assets/
git commit -m "feat(assets): scale manifest width/height 4x (footprints unchanged)"
```

---

### Task 3: Scale runtime `_PX` constants

**Files:**

- Modify: `webview-ui/src/constants.ts`

- [ ] **Step 1: Update `TILE_SIZE` and all dependent constants**

Find and edit each constant. Exact changes:

```typescript
// Line 4
export const TILE_SIZE = 64; // was 16

// Line 11
export const WALK_SPEED_PX_PER_SEC = 192; // was 48 (3 tiles/sec preserved)

// Line 24
export const MATRIX_SPRITE_COLS = 64; // was 16

// Line 25
export const MATRIX_SPRITE_ROWS = 96; // was 24

// Line 39
export const CHARACTER_SITTING_OFFSET_PX = 24; // was 6

// Line 53
export const BUBBLE_SITTING_OFFSET_PX = 40; // was 10

// Line 54
export const BUBBLE_VERTICAL_OFFSET_PX = 96; // was 24

// Line 133
export const CHARACTER_HIT_HALF_WIDTH = 32; // was 8

// Line 134
export const CHARACTER_HIT_HEIGHT = 96; // was 24

// Line 135
export const TOOL_OVERLAY_VERTICAL_OFFSET = 128; // was 32
```

Do not change: `TYPE_FRAME_DURATION_SEC`, `WALK_FRAME_DURATION_SEC`, `MATRIX_*` timing/color/threshold constants, `CAMERA_*`, `ZOOM_MIN`/`MAX`, `PAN_MARGIN_FRACTION`, `LAYOUT_SAVE_DEBOUNCE_MS`, `MAX_DELTA_TIME_SEC`, `WAITING_BUBBLE_DURATION_SEC`, seat rest timers, hue shift ranges, fuel gauge dimensions (UI, not sprite). These are all times/ratios/UI widgets unaffected by sprite pixel scaling.

- [ ] **Step 2: Type-check**

Run: `npm run check-types`
Expected: PASS. No type errors (these are all `number` constants).

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/constants.ts
git commit -m "feat(webview): scale TILE_SIZE and _PX constants 4x"
```

---

### Task 4: `defaultZoom()` preserves apparent tile size

**Files:**

- Modify: `webview-ui/src/constants.ts`
- Modify: `webview-ui/src/office/toolUtils.ts`

- [ ] **Step 1: Add `ZOOM_APPARENT_TILE_PX` constant**

Edit `webview-ui/src/constants.ts`. Find the `// ── Zoom ──` block and add a new line after `ZOOM_DEFAULT_DPR_FACTOR`:

```typescript
// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2; // legacy — retained for reference, no longer consumed
export const ZOOM_APPARENT_TILE_PX = 32; // target CSS px per tile at default zoom; matches pre-Fase-1 UX at DPR=2
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
// ... rest unchanged
```

Note: `ZOOM_APPARENT_TILE_PX = 32` is chosen to keep apparent size on DPR=2 displays identical to today. On DPR=1–1.5 the world will appear ~33% larger than today — this is a trade-off of integer zoom at `TILE_SIZE=64` and is acceptable (documented in spec "Zoom defaults").

- [ ] **Step 2: Update `defaultZoom()` in `toolUtils.ts`**

Replace the body of `defaultZoom()`:

```typescript
import { TILE_SIZE, ZOOM_APPARENT_TILE_PX, ZOOM_MIN } from '../constants.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(ZOOM_MIN, Math.round((ZOOM_APPARENT_TILE_PX * dpr) / TILE_SIZE));
}
```

Remove `ZOOM_DEFAULT_DPR_FACTOR` from the import list (but keep it exported from constants — `ZOOM_DEFAULT_DPR_FACTOR` may still be referenced by other code; verify in Step 3).

- [ ] **Step 3: Confirm `ZOOM_DEFAULT_DPR_FACTOR` has no other consumers**

Run: `grep -rn "ZOOM_DEFAULT_DPR_FACTOR" webview-ui/src src server`
Expected: only the export line in `constants.ts` appears. If any other file still imports it, leave them alone — the constant is still exported.

- [ ] **Step 4: Type-check**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/constants.ts webview-ui/src/office/toolUtils.ts
git commit -m "feat(webview): defaultZoom preserves apparent tile size at new TILE_SIZE"
```

---

### Task 5: Audit hardcoded 16/32 pixel values in webview-ui/

**Files:**

- Potentially modify: various files under `webview-ui/src/` (to be identified)

Goal: find any remaining hardcoded numbers that used to represent 16-px tile units or 32-px sprite heights, and route them through constants or multiply by 4.

- [ ] **Step 1: Grep for suspicious hardcoded values**

Run: `grep -rn "\\b16\\b\\|\\b32\\b" webview-ui/src --include='*.ts' --include='*.tsx' | grep -v "constants.ts" | grep -v "^.*:.*//.*" | head -80`
Expected: a list of call sites containing `16` or `32` as literals.

For each hit, evaluate:

- **Is it a sprite pixel dimension/offset?** (e.g., `char.y + 32`, `const height = 32`, `frame * 16`) → replace with `TILE_SIZE` / 2 etc., or multiply by 4 if it's a raw literal.
- **Is it a frame/row count, timer ms, port number, color byte, hue degree?** → leave alone.

Common false positives to skip:

- HTTP status codes (e.g., `= 404`, `= 500` — but those aren't 16/32)
- Milliseconds (e.g., `32ms`)
- Numeric conversions (e.g., `.toString(16)`, `parseInt(..., 16)`)
- Color channel computations (e.g., `r << 16`, `g << 8`)
- Array indices or bit shifts
- Tests that seed specific values

- [ ] **Step 2: Fix each real sprite-dim literal**

For every confirmed sprite-pixel literal, replace with an expression built from `TILE_SIZE` (or another already-scaled constant). Preserve the semantic meaning. Example:

```typescript
// Character sprite cell is 1 tile wide, 2 tiles tall (pre-Fase-1: 16 × 32)
// Before:
const frameWidth = 16;
const frameHeight = 32;
// After:
const frameWidth = TILE_SIZE;
const frameHeight = TILE_SIZE * 2;
```

Another example — a 4-pixel inset pre-Fase-1 (quarter of a tile):

```typescript
// Before:
const inset = 4;
// After:
const inset = TILE_SIZE / 4;
```

Rule: each fix preserves the semantic ("1 tile", "2 tiles", "quarter tile", etc.). If unsure, the character sprite layout is 7 frames × 16-px wide × 3 rows × 32-px tall pre-Fase-1 (i.e. 7 × TILE_SIZE wide × 3 × (TILE_SIZE\*2) tall). Use that as the anchor.

- [ ] **Step 3: Type-check + build webview**

Run: `npm run check-types`
Expected: PASS.

Run: `cd webview-ui && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add webview-ui/src/
git commit -m "fix(webview): route remaining hardcoded sprite dims through TILE_SIZE"
```

If no changes needed, skip the commit — the constants in Task 3 may already have covered everything.

---

### Task 6: Full build + unit test run

**Files:** none modified — verification only.

- [ ] **Step 1: Full compile**

Run: `npm run compile`
Expected: check-types passes, lint passes, esbuild completes, webview builds. No errors.

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all existing tests pass (no pixel-dim asserts in current test suite — server + cli logic only).

If any test fails, investigate. Common cause: a test that hardcoded a `16` or `32` for sprite dims would fail; fix per Task 5.

- [ ] **Step 3: Commit only if any fixups were needed**

Only commit if additional changes were introduced to pass tests — otherwise this is a verification step.

---

### Task 7: Visual regression with chrome-devtools

**Files:** none modified — manual verification.

Goal: open the CLI dashboard in a browser, verify the office looks the same apparent size as before Fase 1, and that all interactions (character animation, seat selection, layout editor) still work.

- [ ] **Step 1: Build + start CLI**

Run (terminal 1): `npm run build:cli`
Expected: `✓ Built cli/ → cli/dist/index.js`.

Run (terminal 2): `node cli/dist/index.js --port 3200 --project .`
Expected: CLI prints `[pixel-agents] Running at http://localhost:3200`.

- [ ] **Step 2: Open dashboard with chrome-devtools**

Use the chrome-devtools MCP tools to:

1. `navigate_page` to `http://localhost:3200`
2. `take_screenshot` of the initial office view
3. Inspect the rendered canvas — verify characters are visible and roughly occupy the same screen area as pre-Fase-1 (one or two tiles tall).

- [ ] **Step 3: Test interactions**

Using chrome-devtools:

1. Click a character → `take_snapshot` → verify selection outline appears
2. Open layout editor (Layout button) → verify toolbar renders
3. Paint a floor tile → verify tile updates visually
4. Place a furniture item from the palette → verify ghost preview appears and drops correctly
5. Zoom in with the + button → verify pixel-perfect scaling (no blurry edges)

- [ ] **Step 4: Test at different DPRs**

Using chrome-devtools `emulate`:

1. DPR=1: verify tile is ~64 CSS px (larger than pre-Fase-1's 32, acceptable trade-off)
2. DPR=1.5: verify tile is ~42 CSS px
3. DPR=2: verify tile is ~32 CSS px (matches pre-Fase-1)

Characters should animate smoothly in all three cases.

- [ ] **Step 5: Test matrix effect**

Spawn a new agent (via the dashboard's "+ Agent" button in the office scene, or by launching `claude` in another terminal). Observe the 0.3s matrix rain spawn effect — verify it renders smoothly (no noticeable lag compared to pre-Fase-1). If it feels laggy, note it as a follow-up for Fase 2 or a performance ticket.

- [ ] **Step 6: Shut down CLI**

In terminal 2: `Ctrl+C`.
Expected: clean shutdown, no stray processes.

- [ ] **Step 7: Commit a short development note**

Append to `docs/development-setup.md` (or create if missing) a "Sprite resolution 4×" section with:

````markdown
## Sprite Resolution (post-Fase-1)

Base sprite resolution is 64 px per tile (was 16 px pre-2026-04-17). All PNGs in `webview-ui/public/assets/` are generated by `scripts/generate-cave-theme.ts` with internal `SCALE = 4`.

To regenerate assets after tweaking generators:

```bash
npx tsx scripts/generate-cave-theme.ts
```
````

Zoom default is chosen so that tile-on-screen size matches pre-Fase-1 behavior at DPR=2 (~32 CSS px per tile).

````

```bash
git add docs/development-setup.md
git commit -m "docs: sprite resolution 4x dev notes"
````

---

## Deliverables

After this plan:

- All generated assets at 4× (PNGs + manifests) committed under `webview-ui/public/assets/`.
- `scripts/generate-cave-theme.ts` with `SCALE = 4` — re-runnable idempotently to regenerate assets from code.
- `webview-ui/src/constants.ts` with `TILE_SIZE = 64` + scaled `_PX` constants + new `ZOOM_APPARENT_TILE_PX`.
- `defaultZoom()` formula preserves apparent size.
- Full build (`npm run compile` + `npm run build:cli`) passes; `npm test` passes.
- Visual regression OK at DPR 1, 1.5, 2.

## Notes for agentic workers

- **Order matters**: Task 1 (Canvas refactor) must be done before Task 2 (manifests) because both re-run the generator and share commits of regenerated PNGs.
- **PNG diff is huge**: the regenerated PNGs will produce a big binary diff. That's expected — the "feat(assets)" commits should be scoped to cover both the code change and the regenerated assets together.
- **Do NOT hand-edit any asset PNG.** The generator is the source of truth. If something looks wrong, fix the generator and re-run.
- **Do NOT change any drawing code in `generate-cave-theme.ts`.** That's explicitly Fase 2 scope. This plan is infrastructure only.
