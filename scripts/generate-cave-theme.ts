/**
 * Cave Mine Theme sprite generator.
 *
 * Writes all PNGs (characters, floors, walls, furniture) plus the furniture
 * manifests from pure code. Usage:
 *
 *   npx tsx scripts/generate-cave-theme.ts
 *
 * All output lands in webview-ui/public/assets/. Run once per theme tweak;
 * commit the generated files alongside this script. The script is
 * intentionally self-contained (no runtime deps beyond pngjs) and prefers
 * readability over terseness — every sprite is a sequence of `rect`/`line`/
 * `pixel` calls that map to the visual spec in
 * docs/superpowers/specs/2026-04-16-cave-mine-theme-design.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_ROOT = path.join(__dirname, '..', 'webview-ui', 'public', 'assets');

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

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── Character palette type ───────────────────────────────────

interface CharPalette {
  skinMain: string;
  skinShadow: string;
  skinHighlight: string;
  shirtMain: string;
  shirtShadow: string;
  shirtHighlight: string;
  pantsMain: string;
  pantsShadow: string;
  bootsMain: string;
  bootsShadow: string;
  helmetMain: string;
  helmetShadow: string;
  lampGlow: string;
  outline: string;
  eyeWhite: string;
  eyePupil: string;
  beltRope: string;
}

const MINER_PALETTES: CharPalette[] = [
  {
    // char_0 — base Haitian skin
    skinMain: '#8B5E3C',
    skinShadow: '#7A5232',
    skinHighlight: '#B88058',
    shirtMain: '#B86838',
    shirtShadow: '#8B4520',
    shirtHighlight: '#CC7844',
    pantsMain: '#6A6A80',
    pantsShadow: '#4A4A60',
    bootsMain: '#6B4020',
    bootsShadow: '#4A2810',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#D4B068',
  },
  {
    skinMain: '#7A5232',
    skinShadow: '#6B4628',
    skinHighlight: '#A07048',
    shirtMain: '#A05530',
    shirtShadow: '#7A3818',
    shirtHighlight: '#B86838',
    pantsMain: '#5A5A72',
    pantsShadow: '#3E3E52',
    bootsMain: '#5A3418',
    bootsShadow: '#3E2010',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#C8A060',
  },
  {
    skinMain: '#6E4828',
    skinShadow: '#5E3C1E',
    skinHighlight: '#8B5E3C',
    shirtMain: '#A05530',
    shirtShadow: '#7A3818',
    shirtHighlight: '#B86838',
    pantsMain: '#6A6A80',
    pantsShadow: '#4A4A60',
    bootsMain: '#6B4020',
    bootsShadow: '#4A2810',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#D4B068',
  },
  {
    skinMain: '#9B6B45',
    skinShadow: '#8B5E3C',
    skinHighlight: '#C08860',
    shirtMain: '#B86838',
    shirtShadow: '#8B4520',
    shirtHighlight: '#CC7844',
    pantsMain: '#5A5A72',
    pantsShadow: '#3E3E52',
    bootsMain: '#6B4020',
    bootsShadow: '#4A2810',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#D4B068',
  },
  {
    skinMain: '#845530',
    skinShadow: '#7A4A28',
    skinHighlight: '#A06840',
    shirtMain: '#A05530',
    shirtShadow: '#7A3818',
    shirtHighlight: '#B86838',
    pantsMain: '#6A6A80',
    pantsShadow: '#4A4A60',
    bootsMain: '#5A3418',
    bootsShadow: '#3E2010',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#C8A060',
  },
  {
    skinMain: '#7B4E2D',
    skinShadow: '#6B4220',
    skinHighlight: '#9B6840',
    shirtMain: '#B86838',
    shirtShadow: '#8B4520',
    shirtHighlight: '#CC7844',
    pantsMain: '#5A5A72',
    pantsShadow: '#3E3E52',
    bootsMain: '#6B4020',
    bootsShadow: '#4A2810',
    helmetMain: '#E8C030',
    helmetShadow: '#A88418',
    lampGlow: '#FFEE66',
    outline: '#1a1008',
    eyeWhite: '#FFFFFF',
    eyePupil: '#222222',
    beltRope: '#D4B068',
  },
];

const BOSS_PALETTE: CharPalette = {
  skinMain: '#E8C8A0',
  skinShadow: '#D4B490',
  skinHighlight: '#F5D8B0',
  shirtMain: '#FAFAE8',
  shirtShadow: '#E8E8D8',
  shirtHighlight: '#FFFFFF',
  pantsMain: '#3E3E55',
  pantsShadow: '#343448',
  bootsMain: '#6B4020',
  bootsShadow: '#4A2810',
  helmetMain: '#4A4A4A',
  helmetShadow: '#333333',
  lampGlow: '#DAA520',
  outline: '#1a1008',
  eyeWhite: '#FFFFFF',
  eyePupil: '#445566',
  beltRope: '#7A4A20',
};

// ── Character frame drawing ──────────────────────────────────
// Frame is 16 wide × 32 tall. Body occupies rows 8-31 (24px) with 8px top padding.
// Feet at rows 30-31, head/helmet rows 8-11.

type Direction = 'down' | 'up' | 'right';
type FrameKind = 'walk1' | 'walk2' | 'walk3' | 'type1' | 'type2' | 'read1' | 'read2';

function drawMinerFrame(
  c: Canvas,
  ox: number,
  oy: number,
  p: CharPalette,
  dir: Direction,
  frame: FrameKind,
): void {
  const o = p.outline;

  // Leg offsets per walk frame
  const leftLegY = frame === 'walk1' ? 1 : frame === 'walk3' ? -1 : 0;
  const rightLegY = -leftLegY;

  // ── Legs (rows 24-31) ──
  // Left leg (x 6-7), Right leg (x 8-9); bottom row = boots.
  const legTop = 24;
  const legBot = 30;

  // Pants
  for (let y = legTop; y <= legBot; y++) {
    c.rect(ox + 6, oy + y + leftLegY, 2, 1, p.pantsMain);
    c.rect(ox + 8, oy + y + rightLegY, 2, 1, p.pantsMain);
  }
  // Shadow stripe
  c.pixel(ox + 6, oy + legBot + leftLegY - 1, p.pantsShadow);
  c.pixel(ox + 9, oy + legBot + rightLegY - 1, p.pantsShadow);
  // Patch pixel (visible patches)
  c.pixel(ox + 7, oy + 26 + leftLegY, p.pantsShadow);
  c.pixel(ox + 8, oy + 27 + rightLegY, p.pantsShadow);

  // Boots
  c.rect(ox + 6, oy + 30 + leftLegY, 2, 1, p.bootsMain);
  c.rect(ox + 8, oy + 30 + rightLegY, 2, 1, p.bootsMain);
  c.pixel(ox + 6, oy + 30 + leftLegY, p.bootsShadow);
  c.pixel(ox + 9, oy + 30 + rightLegY, p.bootsShadow);
  // Outline under boots — the hard floor contact line
  c.pixel(ox + 5, oy + 31, o);
  c.pixel(ox + 10, oy + 31, o);

  // ── Torso (rows 16-23) ──
  // Body silhouette
  c.rect(ox + 5, oy + 16, 6, 8, p.shirtMain);
  // Outline
  c.hline(ox + 5, oy + 15, 6, o); // top (under shoulders)
  c.pixel(ox + 4, oy + 16, o);
  c.pixel(ox + 11, oy + 16, o);
  c.pixel(ox + 4, oy + 23, o);
  c.pixel(ox + 11, oy + 23, o);
  // Shirt shading
  c.rect(ox + 5, oy + 22, 6, 1, p.shirtShadow);
  c.rect(ox + 5, oy + 16, 6, 1, p.shirtHighlight);
  // Torn edges — deep shadow on lower corners
  c.pixel(ox + 5, oy + 23, p.shirtShadow);
  c.pixel(ox + 10, oy + 23, p.shirtShadow);

  // Belt
  c.rect(ox + 5, oy + 22, 6, 1, p.beltRope);

  // ── Arms (rows 17-22) ──
  if (dir === 'right') {
    // Right-facing: right arm forward; hold pickaxe
    c.rect(ox + 10, oy + 17, 2, 5, p.shirtMain);
    c.pixel(ox + 12, oy + 18, p.skinMain); // hand
    c.pixel(ox + 12, oy + 19, p.skinShadow);
  } else {
    // Symmetric arms
    c.rect(ox + 4, oy + 17, 1, 5, p.shirtMain);
    c.rect(ox + 11, oy + 17, 1, 5, p.shirtMain);
    // Hands
    c.pixel(ox + 4, oy + 21, p.skinMain);
    c.pixel(ox + 11, oy + 21, p.skinMain);
  }

  // ── Head (rows 8-15) ──
  const headY = 8;
  // Skin fill
  c.rect(ox + 5, oy + headY + 2, 6, 5, p.skinMain);
  // Outline of head
  c.hline(ox + 5, oy + headY + 1, 6, o);
  c.hline(ox + 5, oy + headY + 7, 6, o);
  c.pixel(ox + 4, oy + headY + 2, o);
  c.pixel(ox + 4, oy + headY + 6, o);
  c.pixel(ox + 11, oy + headY + 2, o);
  c.pixel(ox + 11, oy + headY + 6, o);
  // Shadows
  c.rect(ox + 5, oy + headY + 6, 6, 1, p.skinShadow);
  c.rect(ox + 5, oy + headY + 2, 6, 1, p.skinHighlight);

  // Eyes + features per direction
  if (dir === 'down') {
    c.pixel(ox + 6, oy + headY + 4, p.eyeWhite);
    c.pixel(ox + 6, oy + headY + 4, p.eyePupil);
    c.pixel(ox + 9, oy + headY + 4, p.eyeWhite);
    c.pixel(ox + 9, oy + headY + 4, p.eyePupil);
    // Mouth
    c.pixel(ox + 7, oy + headY + 6, p.outline);
    c.pixel(ox + 8, oy + headY + 6, p.outline);
  } else if (dir === 'up') {
    // Back of head — no eyes
  } else {
    // right
    c.pixel(ox + 9, oy + headY + 4, p.eyeWhite);
    c.pixel(ox + 9, oy + headY + 4, p.eyePupil);
    c.pixel(ox + 8, oy + headY + 6, p.outline);
  }

  // ── Helmet (rows 7-10) ──
  // Helmet dome
  c.rect(ox + 4, oy + 8, 8, 2, p.helmetMain);
  c.hline(ox + 4, oy + 7, 8, p.helmetShadow); // dark rim above
  c.hline(ox + 4, oy + 10, 8, p.helmetShadow); // brim
  c.pixel(ox + 4, oy + 8, o);
  c.pixel(ox + 11, oy + 8, o);

  // Lamp — always visible
  if (dir === 'down' || dir === 'right') {
    c.pixel(ox + (dir === 'right' ? 11 : 7), oy + 9, p.lampGlow);
    c.pixel(ox + (dir === 'right' ? 12 : 7), oy + 9, p.lampGlow);
  } else {
    // up — lamp back, darker
    c.pixel(ox + 7, oy + 9, p.helmetShadow);
  }

  // ── Tool / animation detail ──
  drawMinerToolOverlay(c, ox, oy, p, dir, frame);
}

function drawMinerToolOverlay(
  c: Canvas,
  ox: number,
  oy: number,
  p: CharPalette,
  dir: Direction,
  frame: FrameKind,
): void {
  const pickaxeHandle = '#8B5A2B';
  const pickaxeHead = '#555555';
  const pickaxeHeadShadow = '#333333';
  const cartBody = '#7A4A20';
  const cartShadow = '#5A3418';
  const cartMetal = '#888888';
  const goldVein = '#FFD700';
  const spark1 = '#FFE855';
  const spark2 = '#FFA500';
  const spark3 = '#FF6600';

  switch (frame) {
    case 'walk1':
    case 'walk2':
    case 'walk3': {
      // Pickaxe at side
      if (dir === 'right') {
        c.line(ox + 13, oy + 20, ox + 13, oy + 25, pickaxeHandle);
        c.rect(ox + 12, oy + 19, 3, 1, pickaxeHead);
        c.pixel(ox + 14, oy + 19, pickaxeHeadShadow);
      } else if (dir === 'down') {
        c.line(ox + 3, oy + 20, ox + 3, oy + 25, pickaxeHandle);
        c.rect(ox + 2, oy + 19, 3, 1, pickaxeHead);
      } else {
        // up — pickaxe handle visible behind
        c.line(ox + 12, oy + 18, ox + 12, oy + 24, pickaxeHandle);
      }
      break;
    }
    case 'type1': {
      // Pickaxe raised
      if (dir === 'right') {
        c.line(ox + 12, oy + 13, ox + 14, oy + 18, pickaxeHandle);
        c.rect(ox + 12, oy + 12, 3, 2, pickaxeHead);
        c.pixel(ox + 14, oy + 12, pickaxeHeadShadow);
      } else if (dir === 'down') {
        c.line(ox + 3, oy + 13, ox + 5, oy + 18, pickaxeHandle);
        c.rect(ox + 2, oy + 12, 3, 2, pickaxeHead);
      } else {
        // up — overhead raised
        c.line(ox + 11, oy + 11, ox + 12, oy + 16, pickaxeHandle);
        c.rect(ox + 10, oy + 10, 3, 2, pickaxeHead);
      }
      break;
    }
    case 'type2': {
      // Pickaxe down with sparks
      if (dir === 'right') {
        c.line(ox + 12, oy + 22, ox + 14, oy + 27, pickaxeHandle);
        c.rect(ox + 13, oy + 28, 3, 1, pickaxeHead);
        c.pixel(ox + 15, oy + 28, pickaxeHeadShadow);
        c.pixel(ox + 15, oy + 29, spark1);
        c.pixel(ox + 14, oy + 30, spark2);
        c.pixel(ox + 13, oy + 30, spark3);
      } else if (dir === 'down') {
        c.line(ox + 3, oy + 22, ox + 5, oy + 27, pickaxeHandle);
        c.rect(ox + 1, oy + 28, 3, 1, pickaxeHead);
        c.pixel(ox + 1, oy + 29, spark1);
        c.pixel(ox + 2, oy + 30, spark2);
        c.pixel(ox + 3, oy + 30, spark3);
      } else {
        c.line(ox + 11, oy + 20, ox + 12, oy + 26, pickaxeHandle);
        c.rect(ox + 10, oy + 26, 3, 1, pickaxeHead);
        c.pixel(ox + 12, oy + 27, spark1);
      }
      break;
    }
    case 'read1':
    case 'read2': {
      // Pushing wheelbarrow
      const push = frame === 'read1' ? 0 : 1;
      if (dir === 'right') {
        c.rect(ox + 12, oy + 22, 4, 4, cartBody);
        c.rect(ox + 12, oy + 25, 4, 1, cartShadow);
        c.pixel(ox + 15, oy + 26, cartMetal); // wheel
        c.pixel(ox + 14, oy + 27, cartMetal);
        c.pixel(ox + 13, oy + 23, goldVein);
      } else if (dir === 'down') {
        c.rect(ox + 4, oy + 23 + push, 8, 3, cartBody);
        c.hline(ox + 4, oy + 25 + push, 8, cartShadow);
        c.pixel(ox + 5, oy + 26 + push, cartMetal);
        c.pixel(ox + 10, oy + 26 + push, cartMetal);
        c.pixel(ox + 7, oy + 23 + push, goldVein);
        c.pixel(ox + 9, oy + 24 + push, goldVein);
      } else {
        // up — hidden behind body
        c.rect(ox + 4, oy + 16, 8, 2, cartBody);
        c.pixel(ox + 5, oy + 17, cartMetal);
      }
      break;
    }
  }
}

function drawBossFrame(
  c: Canvas,
  ox: number,
  oy: number,
  p: CharPalette,
  dir: Direction,
  frame: FrameKind,
): void {
  const o = p.outline;
  const hatBand = '#DAA520';
  const coffeeCup = '#A0522D';
  const coffeeRim = '#FAFAE8';
  const mustache = '#D4B490';
  const beltBuckle = '#DAA520';

  // Legs — boss walks/sits calmly, no offset swings
  const legBot = 30;
  for (let y = 24; y <= legBot - 1; y++) {
    c.rect(ox + 6, oy + y, 2, 1, p.pantsMain);
    c.rect(ox + 8, oy + y, 2, 1, p.pantsMain);
  }
  c.pixel(ox + 6, oy + legBot - 1, p.pantsShadow);
  c.pixel(ox + 9, oy + legBot - 1, p.pantsShadow);
  // Polished shoes
  c.rect(ox + 6, oy + 30, 2, 1, p.bootsMain);
  c.rect(ox + 8, oy + 30, 2, 1, p.bootsMain);
  c.pixel(ox + 7, oy + 30, '#7B5030'); // shoe shine
  c.pixel(ox + 9, oy + 30, '#7B5030');
  c.pixel(ox + 5, oy + 31, o);
  c.pixel(ox + 10, oy + 31, o);

  // Torso — clean white shirt under dark vest
  c.rect(ox + 5, oy + 16, 6, 8, p.shirtMain);
  c.rect(ox + 5, oy + 17, 2, 6, '#606060'); // vest left
  c.rect(ox + 9, oy + 17, 2, 6, '#606060'); // vest right
  c.hline(ox + 5, oy + 15, 6, o);
  c.pixel(ox + 4, oy + 16, o);
  c.pixel(ox + 11, oy + 16, o);
  c.pixel(ox + 4, oy + 23, o);
  c.pixel(ox + 11, oy + 23, o);
  // Belt with gold buckle
  c.rect(ox + 5, oy + 22, 6, 1, p.beltRope);
  c.pixel(ox + 7, oy + 22, beltBuckle);
  c.pixel(ox + 8, oy + 22, beltBuckle);

  // Arms — relaxed
  c.rect(ox + 4, oy + 17, 1, 5, p.shirtMain);
  c.rect(ox + 11, oy + 17, 1, 5, p.shirtMain);
  c.pixel(ox + 4, oy + 21, p.skinMain);
  c.pixel(ox + 11, oy + 21, p.skinMain);

  // Head
  const headY = 8;
  c.rect(ox + 5, oy + headY + 2, 6, 5, p.skinMain);
  c.hline(ox + 5, oy + headY + 1, 6, o);
  c.hline(ox + 5, oy + headY + 7, 6, o);
  c.pixel(ox + 4, oy + headY + 2, o);
  c.pixel(ox + 4, oy + headY + 6, o);
  c.pixel(ox + 11, oy + headY + 2, o);
  c.pixel(ox + 11, oy + headY + 6, o);
  c.rect(ox + 5, oy + headY + 6, 6, 1, p.skinShadow);
  c.rect(ox + 5, oy + headY + 2, 6, 1, p.skinHighlight);

  // Face per direction
  if (dir === 'down') {
    c.pixel(ox + 6, oy + headY + 4, p.eyePupil);
    c.pixel(ox + 9, oy + headY + 4, p.eyePupil);
    c.pixel(ox + 7, oy + headY + 5, mustache);
    c.pixel(ox + 8, oy + headY + 5, mustache);
    c.pixel(ox + 7, oy + headY + 6, p.outline);
    c.pixel(ox + 8, oy + headY + 6, p.outline);
  } else if (dir === 'up') {
    // Back of head — only hat visible
  } else {
    c.pixel(ox + 9, oy + headY + 4, p.eyePupil);
    c.pixel(ox + 9, oy + headY + 5, mustache);
    c.pixel(ox + 8, oy + headY + 5, mustache);
  }

  // Hat (dark with gold band)
  c.rect(ox + 3, oy + 7, 10, 1, p.helmetMain);
  c.rect(ox + 4, oy + 8, 8, 2, p.helmetShadow);
  c.hline(ox + 3, oy + 10, 10, hatBand); // gold band brim

  // Coffee cup in hand (type/read frames) or by side (walk)
  switch (frame) {
    case 'type1':
    case 'type2':
    case 'read1':
    case 'read2': {
      const cx = dir === 'right' ? 12 : 3;
      c.rect(ox + cx, oy + 18, 2, 3, coffeeCup);
      c.hline(ox + cx, oy + 18, 2, coffeeRim);
      c.pixel(ox + cx + 1, oy + 17, coffeeRim); // steam
      break;
    }
    default:
      break;
  }
}

function buildCharacterSheet(palette: CharPalette, drawer: typeof drawMinerFrame): Canvas {
  const c = new Canvas(16 * 7, 32 * 3);
  const frames: FrameKind[] = ['walk1', 'walk2', 'walk3', 'type1', 'type2', 'read1', 'read2'];
  const dirs: Direction[] = ['down', 'up', 'right'];
  for (let row = 0; row < dirs.length; row++) {
    for (let col = 0; col < frames.length; col++) {
      drawer(c, col * 16, row * 32, palette, dirs[row], frames[col]);
    }
  }
  return c;
}

// ── Floor tiles (16x16, grayscale — colorized at runtime) ───

function buildFloor(variant: number): Canvas {
  const c = new Canvas(16, 16);
  // Base value per variant — encodes a grayscale texture that the colorize
  // pipeline tints with the per-tile FloorColor.
  const fillByVariant: Record<number, () => void> = {
    0: () => fillRoughDirt(c),
    1: () => fillRocky(c),
    2: () => fillGravel(c),
    3: () => fillPlanks(c, false),
    4: () => fillPlanks(c, true),
    5: () => fillWetRock(c),
    6: () => fillRails(c),
    7: () => fillPolishedStone(c),
    8: () => fillMud(c),
  };
  (fillByVariant[variant] ?? fillRoughDirt)();
  return c;
}

function fillRoughDirt(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#7a7a7a'); // mid grey base
  const dots = [
    [2, 3],
    [5, 1],
    [8, 4],
    [11, 2],
    [14, 5],
    [1, 8],
    [7, 9],
    [10, 11],
    [13, 14],
    [4, 13],
    [6, 15],
    [12, 7],
    [3, 11],
    [9, 5],
  ];
  for (const [x, y] of dots) c.pixel(x, y, '#5a5a5a');
  const lights = [
    [4, 6],
    [11, 9],
    [6, 3],
    [13, 12],
  ];
  for (const [x, y] of lights) c.pixel(x, y, '#959595');
}

function fillRocky(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#707070');
  // Crack patterns
  c.line(2, 3, 6, 6, '#4a4a4a');
  c.line(7, 7, 11, 10, '#4a4a4a');
  c.line(12, 2, 14, 5, '#4a4a4a');
  c.line(3, 12, 7, 14, '#4a4a4a');
  // Speckle
  for (let i = 0; i < 20; i++) {
    c.pixel((i * 7) % 16, (i * 13) % 16, '#5d5d5d');
  }
}

function fillGravel(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#858585');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (x * 31 + y * 17) % 11;
      if (n === 0) c.pixel(x, y, '#606060');
      else if (n === 1) c.pixel(x, y, '#a0a0a0');
    }
  }
}

function fillPlanks(c: Canvas, withCarpet: boolean): void {
  c.rect(0, 0, 16, 16, '#8a8a8a');
  // Horizontal plank gaps every 4 rows
  c.hline(0, 3, 16, '#555555');
  c.hline(0, 7, 16, '#555555');
  c.hline(0, 11, 16, '#555555');
  c.hline(0, 15, 16, '#555555');
  // Plank ends (vertical dashes to suggest board edges)
  c.line(7, 0, 7, 3, '#4a4a4a');
  c.line(3, 4, 3, 7, '#4a4a4a');
  c.line(11, 4, 11, 7, '#4a4a4a');
  c.line(9, 8, 9, 11, '#4a4a4a');
  c.line(5, 12, 5, 15, '#4a4a4a');
  if (withCarpet) {
    // Carpet diamond in centre
    c.rect(3, 4, 10, 8, '#bcbcbc');
    c.pixel(3, 4, '#a0a0a0');
    c.pixel(12, 4, '#a0a0a0');
    c.pixel(3, 11, '#a0a0a0');
    c.pixel(12, 11, '#a0a0a0');
    // Weave pattern
    for (let y = 5; y < 11; y += 2) {
      for (let x = 4; x < 12; x += 2) c.pixel(x, y, '#a0a0a0');
    }
  }
}

function fillWetRock(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#555555');
  // Darker mottling
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (x * 23 + y * 11) % 9;
      if (n === 0) c.pixel(x, y, '#3a3a3a');
    }
  }
  // Wet highlights
  c.pixel(4, 3, '#a0a0a0');
  c.pixel(9, 5, '#a0a0a0');
  c.pixel(12, 10, '#a0a0a0');
  c.pixel(3, 11, '#a0a0a0');
}

function fillRails(c: Canvas): void {
  // Dirt base
  fillRoughDirt(c);
  // Two parallel rails (vertical)
  c.line(4, 0, 4, 15, '#333333');
  c.line(11, 0, 11, 15, '#333333');
  // Ties every 4 rows
  c.rect(3, 2, 10, 1, '#6b4020');
  c.rect(3, 7, 10, 1, '#6b4020');
  c.rect(3, 12, 10, 1, '#6b4020');
}

function fillPolishedStone(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#a5a5a5');
  // Subtle gradient from top (lighter) to bottom
  c.hline(0, 0, 16, '#c0c0c0');
  c.hline(0, 1, 16, '#b5b5b5');
  c.hline(0, 15, 16, '#8a8a8a');
  c.hline(0, 14, 16, '#959595');
  // Small veins
  c.line(2, 5, 6, 5, '#8a8a8a');
  c.line(10, 9, 14, 9, '#8a8a8a');
}

function fillMud(c: Canvas): void {
  c.rect(0, 0, 16, 16, '#6b5030');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (x * 19 + y * 29) % 7;
      if (n === 0) c.pixel(x, y, '#4a381c');
      else if (n === 1) c.pixel(x, y, '#7c6140');
    }
  }
  // Puddle pixels
  c.pixel(6, 7, '#3a2a18');
  c.pixel(7, 7, '#3a2a18');
  c.pixel(11, 11, '#3a2a18');
}

// ── Wall tile (64x128 — 4x4 auto-tile grid of 16x32 pieces) ──

function buildWall(): Canvas {
  const c = new Canvas(64, 128);
  // For each bitmask, decide which edges are solid vs open.
  // N=1, E=2, S=4, W=8. Position = (bitmask % 4, bitmask / 4).
  for (let bitmask = 0; bitmask < 16; bitmask++) {
    const gx = (bitmask % 4) * 16;
    const gy = Math.floor(bitmask / 4) * 32;
    drawWallPiece(c, gx, gy, bitmask);
  }
  return c;
}

function drawWallPiece(c: Canvas, ox: number, oy: number, bitmask: number): void {
  const rockMid = '#6a6a6a';
  const rockDark = '#3a3a3a';
  const rockLight = '#8a8a8a';
  const stratum = '#555555';
  const beam = '#7a4a20';
  const beamShadow = '#5a3418';

  // Top 16 rows = vertical wall face (3D look above the tile).
  // Bottom 16 rows = floor-level wall.
  // The bitmask dictates how edges blend with neighbours — we just draw
  // a consistent rock texture across the tile and let the tile placement
  // handle the rest.
  const N = (bitmask & 1) !== 0;
  const E = (bitmask & 2) !== 0;
  const S = (bitmask & 4) !== 0;
  const W = (bitmask & 8) !== 0;

  // Top face (rows 0-15)
  c.rect(ox, oy, 16, 16, rockMid);
  // Rock strata — horizontal darker lines
  c.hline(ox, oy + 3, 16, stratum);
  c.hline(ox, oy + 9, 16, stratum);
  c.hline(ox, oy + 14, 16, stratum);
  // Mottling
  c.pixel(ox + 2, oy + 1, rockDark);
  c.pixel(ox + 6, oy + 5, rockDark);
  c.pixel(ox + 10, oy + 7, rockDark);
  c.pixel(ox + 13, oy + 11, rockDark);
  c.pixel(ox + 5, oy + 13, rockDark);
  // Highlights
  c.pixel(ox + 4, oy + 2, rockLight);
  c.pixel(ox + 11, oy + 4, rockLight);
  c.pixel(ox + 8, oy + 10, rockLight);

  // Vertical face (rows 16-31)
  c.rect(ox, oy + 16, 16, 16, rockMid);
  c.hline(ox, oy + 20, 16, stratum);
  c.hline(ox, oy + 26, 16, stratum);
  c.pixel(ox + 3, oy + 18, rockDark);
  c.pixel(ox + 7, oy + 22, rockDark);
  c.pixel(ox + 12, oy + 24, rockDark);
  c.pixel(ox + 10, oy + 29, rockDark);
  // Highlights
  c.pixel(ox + 5, oy + 17, rockLight);
  c.pixel(ox + 14, oy + 21, rockLight);
  c.pixel(ox + 2, oy + 28, rockLight);

  // Edge shading — darker on sides that expose an open neighbour
  if (!N) {
    // Northern edge exposed — suggest cave opening above
    c.hline(ox, oy, 16, rockDark);
  }
  if (!E) {
    for (let y = 0; y < 32; y++) c.pixel(ox + 15, oy + y, rockDark);
  }
  if (!W) {
    for (let y = 0; y < 32; y++) c.pixel(ox, oy + y, rockDark);
  }
  if (!S) {
    c.hline(ox, oy + 31, 16, rockDark);
  }

  // Wooden support beam at certain bitmasks (vertical supports every few pieces)
  if (bitmask === 5 || bitmask === 10) {
    // Vertical beam on left
    c.rect(ox + 1, oy + 16, 2, 16, beam);
    c.rect(ox + 1, oy + 16, 2, 1, beamShadow);
    c.rect(ox + 1, oy + 31, 2, 1, beamShadow);
  }
}

// ── Furniture generators ─────────────────────────────────────

interface FurnitureDef {
  id: string;
  name: string;
  category: string;
  footprintW: number;
  footprintH: number;
  width: number;
  height: number;
  isDesk?: boolean;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  draw: (c: Canvas) => void;
}

function drawRockVein(c: Canvas): void {
  // 48x32 — 3 tile wide rock outcrop with a gold vein through it.
  const base = '#585858';
  const dark = '#3a3a3a';
  const light = '#7a7a7a';
  const gold = '#DAA520';
  const goldLight = '#FFD700';
  c.rect(0, 8, 48, 24, base);
  c.hline(0, 8, 48, dark);
  c.hline(0, 31, 48, dark);
  // Chunky rock surface
  for (let i = 0; i < 48; i += 3) {
    c.pixel(i, 10, light);
    c.pixel(i + 1, 15, dark);
    c.pixel(i + 2, 20, light);
  }
  // Gold vein — diagonal through middle
  c.line(4, 28, 44, 12, gold);
  c.line(5, 28, 45, 12, goldLight);
  c.pixel(12, 22, goldLight);
  c.pixel(28, 17, goldLight);
  c.pixel(38, 14, goldLight);
}

function drawRockVeinSide(c: Canvas): void {
  // 16x64 — tall rock face (2 tiles)
  const base = '#585858';
  const dark = '#3a3a3a';
  const gold = '#DAA520';
  c.rect(0, 0, 16, 64, base);
  c.hline(0, 0, 16, dark);
  c.hline(0, 63, 16, dark);
  c.line(0, 0, 15, 63, dark);
  c.pixel(4, 20, gold);
  c.pixel(8, 35, gold);
  c.pixel(12, 50, gold);
}

function drawStoneSeat(c: Canvas): void {
  // 16x16 — chunky stone block
  const base = '#6a6a6a';
  const dark = '#3a3a3a';
  const light = '#8a8a8a';
  c.rect(2, 6, 12, 9, base);
  c.hline(2, 6, 12, light);
  c.hline(2, 14, 12, dark);
  c.pixel(2, 6, dark);
  c.pixel(13, 6, dark);
  c.pixel(5, 9, light);
  c.pixel(10, 11, dark);
}

function drawLanternOff(c: Canvas): void {
  // 16x32 — hanging oil lamp on a small post
  const post = '#4a3418';
  const metal = '#555555';
  const glass = '#333333';
  // Post
  c.rect(7, 12, 2, 20, post);
  c.pixel(7, 12, '#2a1f0f');
  // Lamp body
  c.rect(4, 4, 8, 8, metal);
  c.rect(5, 5, 6, 6, glass);
  // Hook
  c.hline(6, 3, 4, metal);
  c.pixel(7, 2, metal);
}

function drawLanternOn(c: Canvas): void {
  drawLanternOff(c);
  // Glow replace
  const glow = '#FFEE66';
  const glowMid = '#FFA500';
  c.rect(5, 5, 6, 6, glow);
  c.rect(6, 6, 4, 4, '#FFFFFF');
  c.pixel(5, 10, glowMid);
  c.pixel(10, 10, glowMid);
}

function drawToolRack(c: Canvas): void {
  // 32x32 — wooden rack with pickaxe + shovel hanging
  const wood = '#7a4a20';
  const woodDark = '#5a3418';
  const metal = '#555555';
  const handle = '#8B5A2B';
  c.rect(0, 8, 32, 4, wood);
  c.hline(0, 8, 32, woodDark);
  c.hline(0, 11, 32, woodDark);
  c.rect(0, 28, 32, 4, wood);
  c.hline(0, 28, 32, woodDark);
  c.hline(0, 31, 32, woodDark);
  // Pickaxe
  c.rect(6, 12, 1, 14, handle);
  c.rect(4, 12, 5, 1, metal);
  c.pixel(4, 13, '#333333');
  c.pixel(8, 13, '#333333');
  // Shovel
  c.rect(22, 12, 1, 12, handle);
  c.rect(20, 22, 5, 4, metal);
  c.pixel(20, 25, '#333333');
}

function drawStalagmite(c: Canvas): void {
  const stone = '#6a6a6a';
  const stoneDark = '#3a3a3a';
  const stoneLight = '#8a8a8a';
  // Triangular stone
  for (let y = 0; y < 16; y++) {
    const w = Math.floor((y / 15) * 8) + 2;
    const x = 8 - Math.floor(w / 2);
    c.rect(x, 15 - y, w, 1, stone);
    c.pixel(x, 15 - y, stoneDark);
    c.pixel(x + w - 1, 15 - y, stoneDark);
    if (y > 5) c.pixel(8, 15 - y, stoneLight);
  }
}

function drawCaveMushroom(c: Canvas): void {
  const stem = '#C8B068';
  const stemDark = '#8B7028';
  const cap = '#4A7058';
  const capDark = '#2A5038';
  const glow = '#AEFF88';
  // Stem
  c.rect(7, 8, 2, 8, stem);
  c.pixel(6, 15, stemDark);
  c.pixel(9, 15, stemDark);
  // Cap
  c.rect(4, 5, 8, 4, cap);
  c.hline(3, 7, 10, cap);
  c.hline(4, 4, 8, capDark);
  c.pixel(3, 6, capDark);
  c.pixel(12, 6, capDark);
  // Glow pixels
  c.pixel(6, 6, glow);
  c.pixel(9, 7, glow);
  c.pixel(5, 9, glow);
}

function drawWoodBench(c: Canvas): void {
  // 32x16 — two-tile bench
  const wood = '#7a4a20';
  const woodDark = '#5a3418';
  const woodLight = '#8b5a2b';
  c.rect(0, 4, 32, 6, wood);
  c.hline(0, 4, 32, woodLight);
  c.hline(0, 9, 32, woodDark);
  // Legs
  c.rect(2, 10, 2, 6, woodDark);
  c.rect(28, 10, 2, 6, woodDark);
  c.rect(14, 10, 4, 6, woodDark);
}

function drawWallTorch(c: Canvas): void {
  // 16x32 — wall-mounted torch
  const mount = '#4a3418';
  const handle = '#7a4a20';
  const flameOuter = '#FFA500';
  const flameInner = '#FFEE66';
  const flameCore = '#FFFFFF';
  // Mount bracket
  c.rect(6, 20, 4, 10, mount);
  c.rect(5, 22, 6, 2, handle);
  // Flame
  c.rect(6, 12, 4, 6, flameOuter);
  c.rect(7, 10, 2, 5, flameOuter);
  c.rect(7, 12, 2, 4, flameInner);
  c.pixel(7, 14, flameCore);
  c.pixel(8, 14, flameCore);
  c.pixel(7, 8, flameOuter);
  c.pixel(8, 8, flameOuter);
}

function drawHangingPick(c: Canvas): void {
  // 16x32 — decorative pickaxe hung on wall
  const handle = '#8B5A2B';
  const metal = '#555555';
  const metalDark = '#333333';
  c.rect(7, 6, 2, 20, handle);
  c.rect(3, 4, 10, 3, metal);
  c.rect(3, 7, 10, 1, metalDark);
  c.pixel(3, 5, metalDark);
  c.pixel(12, 5, metalDark);
}

function drawCaveMarking(c: Canvas): void {
  // 32x32 — cave wall with chalk markings
  const wall = '#5a5a5a';
  const chalk = '#f0f0f0';
  c.rect(0, 0, 32, 32, wall);
  // Tally marks
  for (let i = 0; i < 5; i++) {
    c.rect(4 + i * 4, 8, 1, 10, chalk);
  }
  c.line(3, 14, 20, 14, chalk); // slash
  // Drawing: stick figure mining
  c.pixel(26, 12, chalk);
  c.line(26, 13, 26, 17, chalk);
  c.line(24, 15, 28, 15, chalk);
  c.line(26, 17, 24, 20, chalk);
  c.line(26, 17, 28, 20, chalk);
}

function drawWaterBarrel(c: Canvas): void {
  // 16x16 — wooden barrel full of water
  const wood = '#7a4a20';
  const woodDark = '#5a3418';
  const iron = '#3a3a3a';
  const water = '#3a5a7a';
  const waterLight = '#5a7a9a';
  c.rect(3, 4, 10, 11, wood);
  c.hline(3, 4, 10, iron);
  c.hline(3, 14, 10, iron);
  c.hline(3, 8, 10, iron);
  c.pixel(3, 4, woodDark);
  c.pixel(12, 4, woodDark);
  c.pixel(3, 14, woodDark);
  c.pixel(12, 14, woodDark);
  // Water
  c.rect(4, 5, 8, 3, water);
  c.pixel(5, 6, waterLight);
  c.pixel(9, 6, waterLight);
}

function drawMineCart(c: Canvas): void {
  // 32x16 — mine cart on rails
  const body = '#7a4a20';
  const bodyDark = '#5a3418';
  const metal = '#555555';
  const wheel = '#3a3a3a';
  const gold = '#DAA520';
  c.rect(2, 4, 28, 8, body);
  c.hline(2, 4, 28, bodyDark);
  c.hline(2, 11, 28, bodyDark);
  c.rect(4, 5, 24, 2, metal); // rim
  // Wheels
  c.rect(5, 12, 4, 3, wheel);
  c.rect(23, 12, 4, 3, wheel);
  // Ore inside
  c.pixel(10, 5, gold);
  c.pixel(14, 5, gold);
  c.pixel(20, 6, gold);
}

function drawDynamiteCrate(c: Canvas): void {
  // 16x16 — wooden crate with dynamite sticks
  const wood = '#7a4a20';
  const woodDark = '#5a3418';
  const dynamite = '#c8442c';
  const dynamiteDark = '#8b2a18';
  const fuse = '#d0d0d0';
  c.rect(1, 4, 14, 11, wood);
  c.hline(1, 4, 14, woodDark);
  c.hline(1, 14, 14, woodDark);
  c.rect(1, 4, 1, 11, woodDark);
  c.rect(14, 4, 1, 11, woodDark);
  // Dynamite sticks inside
  c.rect(3, 6, 2, 6, dynamite);
  c.rect(6, 5, 2, 7, dynamite);
  c.rect(9, 6, 2, 6, dynamite);
  c.rect(12, 5, 2, 7, dynamite);
  c.hline(3, 12, 2, dynamiteDark);
  c.hline(6, 12, 2, dynamiteDark);
  c.pixel(4, 4, fuse);
  c.pixel(7, 3, fuse);
  c.pixel(10, 4, fuse);
  c.pixel(13, 3, fuse);
}

// ── Cabin furniture ─────────────────────────────────────────

function drawNiceTable(c: Canvas): void {
  // 48x32 — table with cream cloth
  const wood = '#5a3418';
  const woodDark = '#3a1f08';
  const cloth = '#FAFAE8';
  const clothShadow = '#D8D8C0';
  c.rect(0, 8, 48, 4, cloth);
  c.hline(0, 8, 48, clothShadow);
  c.hline(0, 11, 48, clothShadow);
  // Table top
  c.rect(0, 12, 48, 2, wood);
  c.hline(0, 13, 48, woodDark);
  // Legs
  c.rect(2, 14, 2, 18, wood);
  c.rect(44, 14, 2, 18, wood);
  c.hline(2, 31, 2, woodDark);
  c.hline(44, 31, 2, woodDark);
}

function drawNiceChair(c: Canvas): void {
  // 16x32 — padded chair
  const wood = '#5a3418';
  const pad = '#8B4A2B';
  const padDark = '#6B3418';
  // Back
  c.rect(3, 6, 10, 12, wood);
  c.rect(4, 8, 8, 8, pad);
  c.hline(4, 15, 8, padDark);
  // Seat
  c.rect(3, 18, 10, 4, pad);
  c.hline(3, 21, 10, padDark);
  // Legs
  c.rect(3, 22, 2, 10, wood);
  c.rect(11, 22, 2, 10, wood);
}

function drawNiceLampOff(c: Canvas): void {
  // 16x32
  const brass = '#A88528';
  const brassDark = '#8B7028';
  const shadeOff = '#3a3a3a';
  c.rect(7, 14, 2, 14, brass);
  c.rect(4, 10, 8, 4, shadeOff);
  c.hline(4, 10, 8, brassDark);
  c.hline(4, 13, 8, brassDark);
  c.pixel(3, 11, brassDark);
  c.pixel(12, 11, brassDark);
  c.rect(5, 29, 6, 2, brass);
}

function drawNiceLampOn(c: Canvas): void {
  drawNiceLampOff(c);
  // Replace shade with glowing one
  c.rect(4, 10, 8, 4, '#FFD86A');
  c.rect(5, 11, 6, 2, '#FFF8D8');
  c.pixel(4, 10, '#FFA500');
  c.pixel(11, 10, '#FFA500');
}

function drawNiceBookshelf(c: Canvas): void {
  // 32x48
  const wood = '#5a3418';
  const woodDark = '#3a1f08';
  const books = ['#8B2B2B', '#2B6B8B', '#6B8B2B', '#8B6B2B', '#6B2B8B', '#2B8B6B'];
  c.rect(0, 0, 32, 48, wood);
  c.rect(2, 2, 28, 44, '#6B4228');
  c.hline(2, 2, 28, woodDark);
  c.hline(2, 45, 28, woodDark);
  // Shelves
  c.hline(2, 14, 28, woodDark);
  c.hline(2, 26, 28, woodDark);
  c.hline(2, 38, 28, woodDark);
  // Books per shelf
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 12;
    for (let i = 0; i < 6; i++) {
      c.rect(3 + i * 4, y, 3, 10, books[(i + row) % books.length]);
      c.pixel(3 + i * 4, y + 10, woodDark);
    }
  }
}

function drawStoveOff(c: Canvas): void {
  // 32x32 — cast iron stove
  const iron = '#3a3a3a';
  const ironDark = '#1a1a1a';
  const pipe = '#555555';
  c.rect(2, 10, 28, 20, iron);
  c.hline(2, 10, 28, ironDark);
  c.hline(2, 29, 28, ironDark);
  c.rect(2, 10, 2, 20, ironDark);
  c.rect(28, 10, 2, 20, ironDark);
  // Pipe
  c.rect(14, 0, 4, 10, pipe);
  c.hline(14, 0, 4, ironDark);
  // Door
  c.rect(8, 14, 16, 10, ironDark);
  c.pixel(16, 18, pipe);
}

function drawStoveOn(c: Canvas): void {
  drawStoveOff(c);
  // Glow through door
  const flame = '#FFA500';
  const flameCore = '#FFEE66';
  c.rect(9, 15, 14, 8, flame);
  c.rect(11, 17, 10, 4, flameCore);
  c.pixel(14, 19, '#FFFFFF');
  c.pixel(17, 19, '#FFFFFF');
}

function drawCoffeeMug(c: Canvas): void {
  // 16x16
  const mug = '#FAFAE8';
  const mugShadow = '#D8D8C0';
  const coffee = '#5a3418';
  const coffeeHighlight = '#8B5A2B';
  c.rect(4, 8, 6, 6, mug);
  c.hline(4, 13, 6, mugShadow);
  c.rect(4, 8, 6, 1, coffee);
  c.pixel(5, 8, coffeeHighlight);
  c.pixel(8, 8, coffeeHighlight);
  // Handle
  c.rect(10, 9, 2, 4, mug);
  c.pixel(11, 10, mugShadow);
  // Steam
  c.pixel(6, 6, '#d0d0d0');
  c.pixel(7, 5, '#d0d0d0');
  c.pixel(8, 6, '#d0d0d0');
}

function drawCabinRug(c: Canvas): void {
  // 32x16
  const base = '#8B2B2B';
  const accent = '#DAA520';
  const dark = '#5B1B1B';
  c.rect(0, 2, 32, 12, base);
  c.hline(0, 2, 32, dark);
  c.hline(0, 13, 32, dark);
  c.pixel(0, 2, dark);
  c.pixel(31, 2, dark);
  c.pixel(0, 13, dark);
  c.pixel(31, 13, dark);
  // Pattern
  for (let x = 4; x < 28; x += 4) {
    c.rect(x, 5, 2, 2, accent);
    c.rect(x, 10, 2, 2, accent);
  }
  c.line(2, 8, 30, 8, accent);
}

function drawWallFrame(c: Canvas): void {
  // 16x16 — wall-hung picture frame
  const frame = '#DAA520';
  const frameShadow = '#8B7028';
  const canvas = '#5A7A5A';
  c.rect(2, 2, 12, 12, frame);
  c.rect(3, 3, 10, 10, canvas);
  c.hline(2, 2, 12, frameShadow);
  c.hline(2, 13, 12, frameShadow);
  c.line(3, 4, 13, 12, '#A09060');
  // Rough landscape
  c.rect(3, 9, 10, 4, '#3A5A3A');
  c.pixel(6, 6, '#FFFFFF');
}

function drawPottedPlant(c: Canvas): void {
  // 16x32
  const potMain = '#8B4513';
  const potShadow = '#5a3418';
  const leaves = '#3A7A3A';
  const leavesDark = '#1A5A1A';
  const leavesLight = '#5A9A5A';
  // Pot
  c.rect(4, 22, 8, 9, potMain);
  c.hline(4, 22, 8, potShadow);
  c.hline(4, 30, 8, potShadow);
  c.rect(3, 20, 10, 2, potMain);
  // Leaves
  c.rect(3, 14, 10, 8, leaves);
  c.rect(5, 10, 6, 4, leaves);
  c.rect(7, 7, 2, 3, leaves);
  c.pixel(4, 14, leavesDark);
  c.pixel(11, 14, leavesDark);
  c.pixel(6, 16, leavesLight);
  c.pixel(9, 12, leavesLight);
}

// ── Build manifest helpers ───────────────────────────────────

interface ManifestMember {
  type: 'asset';
  id: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  orientation?: string;
  state?: string;
}

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
    manifest.members = def.members;
  } else {
    manifest.type = 'asset';
    manifest.width = def.width;
    manifest.height = def.height;
    manifest.footprintW = def.footprintW;
    manifest.footprintH = def.footprintH;
    if (def.isDesk) manifest.isDesk = true;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

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
        width: opts.width,
        height: opts.height,
        footprintW: opts.footprintW,
        footprintH: opts.footprintH,
        state: 'off',
        ...(opts.isDesk ? { isDesk: true } : {}),
      },
      {
        type: 'asset',
        id: `${id}_ON`,
        file: `${id}_ON.png`,
        width: opts.width,
        height: opts.height,
        footprintW: opts.footprintW,
        footprintH: opts.footprintH,
        state: 'on',
        ...(opts.isDesk ? { isDesk: true } : {}),
      },
    ],
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

// ── Main orchestration ───────────────────────────────────────

function generateCharacters(): void {
  const dir = path.join(ASSETS_ROOT, 'characters');
  for (let i = 0; i < 6; i++) {
    const sheet = buildCharacterSheet(MINER_PALETTES[i], drawMinerFrame);
    sheet.savePng(path.join(dir, `char_${i}.png`));
  }
  const boss = buildCharacterSheet(BOSS_PALETTE, drawBossFrame);
  boss.savePng(path.join(dir, 'char_boss.png'));
  console.log(`✓ Characters: ${7} sheets → ${dir}`);
}

function generateFloors(): void {
  const dir = path.join(ASSETS_ROOT, 'floors');
  for (let i = 0; i <= 8; i++) {
    const tile = buildFloor(i);
    tile.savePng(path.join(dir, `floor_${i}.png`));
  }
  console.log(`✓ Floors: 9 tiles → ${dir}`);
}

function generateWalls(): void {
  const dir = path.join(ASSETS_ROOT, 'walls');
  const wall = buildWall();
  wall.savePng(path.join(dir, 'wall_0.png'));
  console.log(`✓ Walls: wall_0.png → ${dir}`);
}

function generateMiningFurniture(): void {
  const root = path.join(ASSETS_ROOT, 'furniture');

  // ROCK_VEIN — rotation group (front + side)
  {
    const dir = path.join(root, 'ROCK_VEIN');
    fs.mkdirSync(dir, { recursive: true });
    const front = new Canvas(48, 32);
    drawRockVein(front);
    front.savePng(path.join(dir, 'ROCK_VEIN_FRONT.png'));
    const side = new Canvas(16, 64);
    drawRockVeinSide(side);
    side.savePng(path.join(dir, 'ROCK_VEIN_SIDE.png'));
    writeFurnitureManifest(dir, {
      id: 'ROCK_VEIN',
      name: 'Rock Vein',
      category: 'desks',
      footprintW: 3,
      footprintH: 2,
      width: 48,
      height: 32,
      isDesk: true,
      backgroundTiles: 1,
      members: [
        {
          type: 'asset',
          id: 'ROCK_VEIN_FRONT',
          file: 'ROCK_VEIN_FRONT.png',
          width: 48,
          height: 32,
          footprintW: 3,
          footprintH: 2,
          orientation: 'front',
        },
        {
          type: 'asset',
          id: 'ROCK_VEIN_SIDE',
          file: 'ROCK_VEIN_SIDE.png',
          width: 16,
          height: 64,
          footprintW: 1,
          footprintH: 4,
          orientation: 'side',
        },
      ],
    });
  }

  // STONE_SEAT — simple chair
  writeSingleFurniture(root, 'STONE_SEAT', 'Stone Seat', 'chairs', 16, 16, 1, 1, drawStoneSeat);

  // LANTERN — on/off state
  writeStatefulFurniture(
    root,
    'LANTERN',
    'Lantern',
    'electronics',
    16,
    32,
    1,
    2,
    drawLanternOn,
    drawLanternOff,
    { canPlaceOnSurfaces: true, backgroundTiles: 1 },
  );

  // TOOL_RACK — storage
  writeSingleFurniture(root, 'TOOL_RACK', 'Tool Rack', 'storage', 32, 32, 2, 2, drawToolRack, {
    backgroundTiles: 1,
  });

  // STALAGMITE — decor
  writeSingleFurniture(root, 'STALAGMITE', 'Stalagmite', 'decor', 16, 16, 1, 1, drawStalagmite);

  // CAVE_MUSHROOM — decor
  writeSingleFurniture(
    root,
    'CAVE_MUSHROOM',
    'Cave Mushroom',
    'decor',
    16,
    16,
    1,
    1,
    drawCaveMushroom,
  );

  // WOOD_BENCH — chairs, 2-tile seat
  writeSingleFurniture(root, 'WOOD_BENCH', 'Wood Bench', 'chairs', 32, 16, 2, 1, drawWoodBench);

  // WALL_TORCH — wall item
  writeSingleFurniture(root, 'WALL_TORCH', 'Wall Torch', 'wall', 16, 32, 1, 2, drawWallTorch, {
    canPlaceOnWalls: true,
  });

  // HANGING_PICK — wall item
  writeSingleFurniture(
    root,
    'HANGING_PICK',
    'Hanging Pickaxe',
    'wall',
    16,
    32,
    1,
    2,
    drawHangingPick,
    { canPlaceOnWalls: true },
  );

  // CAVE_MARKING — wall item
  writeSingleFurniture(
    root,
    'CAVE_MARKING',
    'Cave Marking',
    'wall',
    32,
    32,
    2,
    2,
    drawCaveMarking,
    { canPlaceOnWalls: true },
  );

  // WATER_BARREL — misc floor item
  writeSingleFurniture(root, 'WATER_BARREL', 'Water Barrel', 'misc', 16, 16, 1, 1, drawWaterBarrel);

  // MINE_CART — misc
  writeSingleFurniture(root, 'MINE_CART', 'Mine Cart', 'misc', 32, 16, 2, 1, drawMineCart);

  // DYNAMITE_CRATE — misc
  writeSingleFurniture(
    root,
    'DYNAMITE_CRATE',
    'Dynamite Crate',
    'misc',
    16,
    16,
    1,
    1,
    drawDynamiteCrate,
  );

  console.log(`✓ Mining furniture: 13 items → ${root}`);
}

function generateCabinFurniture(): void {
  const root = path.join(ASSETS_ROOT, 'furniture');

  writeSingleFurniture(root, 'NICE_TABLE', 'Nice Table', 'desks', 48, 32, 3, 2, drawNiceTable, {
    isDesk: true,
    backgroundTiles: 1,
  });
  writeSingleFurniture(root, 'NICE_CHAIR', 'Nice Chair', 'chairs', 16, 32, 1, 2, drawNiceChair);

  writeStatefulFurniture(
    root,
    'NICE_LAMP',
    'Nice Lamp',
    'electronics',
    16,
    32,
    1,
    2,
    drawNiceLampOn,
    drawNiceLampOff,
    { canPlaceOnSurfaces: true, backgroundTiles: 1 },
  );

  writeSingleFurniture(
    root,
    'NICE_BOOKSHELF',
    'Nice Bookshelf',
    'storage',
    32,
    48,
    2,
    3,
    drawNiceBookshelf,
    { backgroundTiles: 2 },
  );

  writeStatefulFurniture(
    root,
    'STOVE',
    'Stove',
    'electronics',
    32,
    32,
    2,
    2,
    drawStoveOn,
    drawStoveOff,
    { backgroundTiles: 1 },
  );

  writeSingleFurniture(root, 'COFFEE_MUG', 'Coffee Mug', 'decor', 16, 16, 1, 1, drawCoffeeMug, {
    canPlaceOnSurfaces: true,
  });

  writeSingleFurniture(root, 'CABIN_RUG', 'Cabin Rug', 'decor', 32, 16, 2, 1, drawCabinRug, {
    backgroundTiles: 1,
  });

  writeSingleFurniture(root, 'WALL_FRAME', 'Wall Frame', 'wall', 16, 16, 1, 1, drawWallFrame, {
    canPlaceOnWalls: true,
  });

  writeSingleFurniture(
    root,
    'POTTED_PLANT',
    'Potted Plant',
    'decor',
    16,
    32,
    1,
    2,
    drawPottedPlant,
    { backgroundTiles: 1 },
  );

  console.log(`✓ Cabin furniture: 9 items → ${root}`);
}

// Small helpers that encapsulate the common single-PNG flow.
function writeSingleFurniture(
  root: string,
  id: string,
  name: string,
  category: string,
  width: number,
  height: number,
  footprintW: number,
  footprintH: number,
  draw: (c: Canvas) => void,
  opts: Partial<FurnitureDef> = {},
): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const canvas = new Canvas(width, height);
  draw(canvas);
  canvas.savePng(path.join(dir, `${id}.png`));
  writeFurnitureManifest(dir, {
    id,
    name,
    category,
    footprintW,
    footprintH,
    width,
    height,
    draw,
    ...opts,
  });
}

function writeStatefulFurniture(
  root: string,
  id: string,
  name: string,
  category: string,
  width: number,
  height: number,
  footprintW: number,
  footprintH: number,
  drawOn: (c: Canvas) => void,
  drawOff: (c: Canvas) => void,
  opts: {
    canPlaceOnSurfaces?: boolean;
    canPlaceOnWalls?: boolean;
    backgroundTiles?: number;
    isDesk?: boolean;
  } = {},
): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const on = new Canvas(width, height);
  drawOn(on);
  on.savePng(path.join(dir, `${id}_ON.png`));
  const off = new Canvas(width, height);
  drawOff(off);
  off.savePng(path.join(dir, `${id}_OFF.png`));
  writeStatefulFurnitureManifest(dir, id, name, category, {
    footprintW,
    footprintH,
    width,
    height,
    ...opts,
  });
}

function main(): void {
  generateCharacters();
  generateFloors();
  generateWalls();
  generateMiningFurniture();
  generateCabinFurniture();
  console.log('\nAll cave-theme assets generated.');
}

main();
