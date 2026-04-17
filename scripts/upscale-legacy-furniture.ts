/**
 * Nearest-neighbor 4× upscaler for legacy (pre-cave-theme) furniture assets.
 *
 * Some furniture items under webview-ui/public/assets/furniture/ pre-date the
 * programmatic cave-theme generator and live as hand-authored PNGs. The rest
 * of the world was upscaled 4× (see Canvas SCALE=4 in generate-cave-theme.ts),
 * but these legacy items were never regenerated and would render visibly
 * smaller than everything else.
 *
 * This script detects 1× legacy items (any item whose largest PNG is < 64 px
 * wide — cave-theme sprites start at 64 px per tile) and rewrites each PNG as
 * a 4× nearest-neighbor copy, plus multiplies the manifest's width/height
 * fields by SCALE. Idempotent: already-scaled items are skipped.
 *
 * Usage:   npx tsx scripts/upscale-legacy-furniture.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCALE = 4;
const CAVE_MIN_WIDTH = 64; // cave-theme assets are never narrower than one tile at 4×
const FURNITURE_ROOT = path.join(__dirname, '..', 'webview-ui', 'public', 'assets', 'furniture');

interface Manifest {
  type?: string;
  width?: number;
  height?: number;
  members?: Array<Manifest>;
  file?: string;
  id?: string;
  [k: string]: unknown;
}

function readPngDims(filePath: string): { w: number; h: number } {
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);
  return { w: png.width, h: png.height };
}

function largestPngWidth(dir: string): number {
  let max = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const { w } = readPngDims(path.join(dir, f));
    if (w > max) max = w;
  }
  return max;
}

function upscalePng(filePath: string): void {
  const buf = fs.readFileSync(filePath);
  const src = PNG.sync.read(buf);
  const outW = src.width * SCALE;
  const outH = src.height * SCALE;
  const out = new PNG({ width: outW, height: outH });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const di = ((y * SCALE + dy) * outW + (x * SCALE + dx)) * 4;
          out.data[di] = src.data[si];
          out.data[di + 1] = src.data[si + 1];
          out.data[di + 2] = src.data[si + 2];
          out.data[di + 3] = src.data[si + 3];
        }
      }
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(out));
}

/**
 * Recursively scale all width/height fields on leaf asset nodes.
 * Handles arbitrarily nested group→group→asset structures (e.g. PC's
 * rotation→state→animation nesting).
 */
function scaleManifest(m: Manifest): Manifest {
  if (m.type === 'asset') {
    if (typeof m.width === 'number') m.width *= SCALE;
    if (typeof m.height === 'number') m.height *= SCALE;
    return m;
  }
  if (Array.isArray(m.members)) {
    m.members = m.members.map((member) => scaleManifest(member));
  }
  return m;
}

/**
 * Recursively collect all leaf asset nodes from a manifest tree.
 * Returns { file, width, height } tuples for every asset entry that has a file.
 */
function collectAssets(m: Manifest): Array<{ file: string; width: number; height: number }> {
  const results: Array<{ file: string; width: number; height: number }> = [];
  if (m.type === 'asset') {
    if (m.file && typeof m.width === 'number' && typeof m.height === 'number') {
      results.push({ file: m.file, width: m.width, height: m.height });
    }
    return results;
  }
  if (Array.isArray(m.members)) {
    for (const member of m.members) {
      results.push(...collectAssets(member));
    }
  }
  return results;
}

function verifyConsistency(): void {
  // Sanity check: for every furniture dir, every PNG's physical dims must
  // match the width/height declared in the manifest. This catches both
  // under-scaled (missed upscaling) and over-scaled (double-applied) cases.
  const issues: string[] = [];
  for (const id of fs.readdirSync(FURNITURE_ROOT)) {
    const dir = path.join(FURNITURE_ROOT, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;

    if (manifest.type === 'asset') {
      // Single-asset manifest: find the PNG (first .png in dir).
      const pngName = fs.readdirSync(dir).find((f) => f.endsWith('.png'));
      if (!pngName) continue;
      const { w, h } = readPngDims(path.join(dir, pngName));
      if (w !== manifest.width || h !== manifest.height) {
        issues.push(
          `${id}: manifest ${manifest.width}×${manifest.height} vs PNG ${w}×${h} (${pngName})`,
        );
      }
    } else {
      // Group manifest: walk all leaf asset nodes recursively.
      const assets = collectAssets(manifest);
      for (const asset of assets) {
        const pngPath = path.join(dir, asset.file);
        if (!fs.existsSync(pngPath)) {
          issues.push(`${id}/${asset.file}: file not found`);
          continue;
        }
        const { w, h } = readPngDims(pngPath);
        if (w !== asset.width || h !== asset.height) {
          issues.push(
            `${id}/${asset.file}: manifest ${asset.width}×${asset.height} vs PNG ${w}×${h}`,
          );
        }
      }
    }
  }
  if (issues.length > 0) {
    console.error('✗ Consistency issues after upscale:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  } else {
    console.log('✓ All manifest dims match their PNG dims.');
  }
}

function main(): void {
  const dirs = fs
    .readdirSync(FURNITURE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let upscaled = 0;
  let skipped = 0;

  for (const id of dirs) {
    const dir = path.join(FURNITURE_ROOT, id);
    const maxW = largestPngWidth(dir);
    if (maxW === 0) {
      console.warn(`⚠ ${id}: no PNGs found, skipping`);
      continue;
    }
    if (maxW >= CAVE_MIN_WIDTH) {
      skipped++;
      continue; // Already at 4×
    }
    // Upscale every PNG in this dir.
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.png')) upscalePng(path.join(dir, f));
    }
    // Scale the manifest, if present.
    const manifestPath = path.join(dir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
      fs.writeFileSync(manifestPath, JSON.stringify(scaleManifest(manifest), null, 2) + '\n');
    }
    console.log(`✓ Upscaled ${id}`);
    upscaled++;
  }

  console.log(`\nDone. Upscaled ${upscaled} legacy item(s), skipped ${skipped} already-scaled.`);
  verifyConsistency();
}

main();
