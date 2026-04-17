# Sprite Resolution 4× — Fase 1 (Infra)

**Date:** 2026-04-17
**Status:** Approved for planning

## Overview

Escalar la resolución de pixel-art del mundo entero (characters, floors, walls, furniture) por un factor de 4×, desde la base actual de 16 px por tile a 64 px por tile. El objetivo de esta fase es **cambiar la infraestructura** — constantes, generador de assets, constantes dependientes, tamaños de archivo — sin introducir nuevo detalle artístico. El output visual es idéntico al actual (mismos pixeles, en mayor densidad).

Personaje ejemplo: hoy 16×32 px; post-Fase-1 64×128 px con los mismos pixeles escalados nearest-neighbor 4×.

## Goals

- `TILE_SIZE = 64` (antes 16) y todas las constantes dependientes escaladas consistentemente.
- `scripts/generate-cave-theme.ts` produce assets 4× más grandes introduciendo un único `SCALE = 4`; el código de dibujo no cambia (coordenadas siguen expresadas en "16-px units").
- Zoom default ajustado para que el mundo **se vea del mismo tamaño aparente** que hoy: hoy a zoom 2–4× sobre tile de 16px da tiles en pantalla de 32–64 px físicos → post-Fase-1 a zoom 1× sobre tile de 64px da la misma dimensión en pantalla.
- Runtime sigue funcionando igual: pathfinding, hit-testing, z-sort, animation speeds se mantienen equivalentes en términos de tiles/segundo.
- Assets regenerados commiteados al repo (PNGs + manifests).

## Non-Goals

- **No se agrega detalle artístico.** Cada pixel del generador sigue produciendo un bloque 4×4 de pixeles; el "more detail" lo hace Fase 2 reescribiendo generadores por categoría.
- **No se toca el VS Code extension path** más allá de consumir los nuevos assets. No hay feature nueva en extension UI.
- **No se introducen upscalers externos** (Real-ESRGAN, waifu2x, etc.). Todo se regenera desde código.
- **No se migran layouts/configs de usuario**: el formato persistido es agnóstico al `TILE_SIZE` (grid es cols×rows lógico, furniture footprint en tiles). Los layouts existentes cargan sin cambios.
- **No se modifican los 7 scripts del pipeline de extracción** (`scripts/0-*` a `5-*`). Son herramientas orthogonales al generador cave-theme y se pueden actualizar después si hace falta.

## Architecture

### Scaled Canvas approach

El generador (`scripts/generate-cave-theme.ts`) contiene centenas de llamadas hardcoded a `canvas.rect(x, y, w, h, ...)`, `canvas.pixel(x, y, ...)`, `new Canvas(16, 16)`, etc. Modificar cada número sería riesgoso y poco mantenible.

La **clase `Canvas`** se modifica para escalar internamente: se construye con dimensiones lógicas (16, 16), pero aloca un buffer de `16*SCALE × 16*SCALE`. Cada método de dibujo (`pixel`, `rect`, `line`, `hline`, `vline`) multiplica coordenadas y dimensiones por `SCALE` antes de escribir al buffer interno.

**Resultado:** el código de dibujo queda exactamente igual; el output es 4× el tamaño con bloques 4×4 por cada "pixel lógico".

```ts
// Antes:
const c = new Canvas(16, 16);
c.rect(0, 0, 16, 16, '#808080'); // llena el tile
c.savePng('floor_0.png'); // output: 16×16 PNG

// Después (con SCALE=4 en Canvas):
const c = new Canvas(16, 16);
c.rect(0, 0, 16, 16, '#808080'); // misma llamada — internamente dibuja 64×64 bloques
c.savePng('floor_0.png'); // output: 64×64 PNG
```

### Manifest dimensions

`writeFurnitureManifest()` y `writeSingleFurniture()` actualmente reciben width/height en pixeles lógicos (16, 32, 48...). Estos se usan para poblar el manifest JSON (`furniture/<ID>/manifest.json`) con `width`/`height` fields que el `assetLoader` del webview lee.

Cambio: las funciones de manifest multiplican por `SCALE` al serializar, pero el código que las llama sigue pasando las dimensiones lógicas. Footprint (tile units) NO se multiplica.

### Runtime constants scaling

`webview-ui/src/constants.ts` tiene muchas constantes `_PX` que describen offsets y tamaños expresados en pixeles de sprite (no de pantalla). Todas se escalan ×4:

| Constante                      | Antes | Después |
| ------------------------------ | ----- | ------- |
| `TILE_SIZE`                    | 16    | 64      |
| `WALK_SPEED_PX_PER_SEC`        | 48    | 192     |
| `CHARACTER_SITTING_OFFSET_PX`  | 6     | 24      |
| `BUBBLE_VERTICAL_OFFSET_PX`    | 24    | 96      |
| `BUBBLE_SITTING_OFFSET_PX`     | 10    | 40      |
| `TOOL_OVERLAY_VERTICAL_OFFSET` | 32    | 128     |
| `CHARACTER_HIT_HALF_WIDTH`     | 8     | 32      |
| `CHARACTER_HIT_HEIGHT`         | 24    | 96      |
| `MATRIX_SPRITE_COLS`           | 16    | 64      |
| `MATRIX_SPRITE_ROWS`           | 24    | 96      |

El resto (timings, colores, thresholds, ratios de matriz, zoom thresholds) no se tocan.

### Zoom defaults

Hoy: `ZOOM_DEFAULT_DPR_FACTOR = 2`, `ZOOM_MIN = 1`, `ZOOM_MAX = 10`. En un display DPR=1.5 default zoom = round(2×1.5) = 3 → tile en pantalla = 48 px.

Post-Fase-1: queremos el mismo tamaño aparente (~48 px físicos por tile en DPR=1.5). Con tile=64, default zoom debería ser round(2×1.5)/4 ≈ 1. Opciones:

- **A.** Introducir `ZOOM_APPARENT_TILE_PX = 48` (o similar) y computar el default como `max(1, round(ZOOM_APPARENT_TILE_PX * DPR / TILE_SIZE))`.
- **B.** Ajustar la fórmula actual dividiendo por 4 (ad-hoc).

Recomendación: **A** — más robusto a futuras cambios de `TILE_SIZE` y expresa intención ("queremos ~48 px por tile en pantalla").

`ZOOM_MAX` se mantiene en 10 (overkill en práctica pero no hace daño).

### Asset files

Todos los PNGs se regeneran. Inventario (todos en `webview-ui/public/assets/`):

| Path                                         | Antes                      | Después         |
| -------------------------------------------- | -------------------------- | --------------- |
| `characters/char_0..5.png` + `char_boss.png` | 112×96                     | 448×384         |
| `floors/floor_0..8.png`                      | 16×16                      | 64×64           |
| `walls/wall_0.png`                           | 64×128                     | 256×512         |
| `furniture/<ID>/*.png`                       | varía (16×16, 48×32, etc.) | 4× cada dim     |
| `furniture/<ID>/manifest.json`               | width/height en px         | 4× width/height |

## Backwards Compatibility

- **Layouts de usuario** (`~/.pixel-agents/layout.json`): no tocan pixel dims. Guardan cols/rows + footprint en tiles. Cargan sin cambios.
- **Config de usuario** (`~/.pixel-agents/config.json`): idem.
- **Agents persistidos en workspaceState**: idem.
- **Viejo `layout.json` con `version: 1`**: funciona igual — el serializer usa cols×rows y furniture positions en tiles, nada de pixeles.

## Performance Implications

**Sprite cache** (per-zoom WeakMap en `spriteCache.ts`): cada sprite cacheado ocupa 16× más memoria (16× pixels). Rango típico:

- Antes: floor 16×16 × zoom 1–10 = hasta 25.6k px/cache entry
- Después: floor 64×64 × zoom 1–10 = hasta 409k px/cache entry

Total proyectado: el character cache (6 palettes × hueShifts × 3 dirs × 7 frames × ~5 zoom levels usados) pasa de ~5 MB a ~80 MB. Aceptable en un webview moderno pero merece mención.

**Canvas renderer**: `offscreenCanvas.drawImage()` escala por hardware; el aumento de tamaño no impacta significativamente el frame rate (probado con tiles similares en otros proyectos).

**Riesgo**: matrix effect (`matrixEffect.ts`) hace render pixel-a-pixel; ir de 16×24 a 64×96 por character multiplica el costo por 16. Puede requerir optimización o disminuir `MATRIX_SPRITE_COLS` si hay lag. Se mide en testing.

## Testing Strategy

1. **Unit tests**: `npm test` debe seguir pasando (no hay asserts sobre pixel dims específicos en tests actuales — todo son tests de server + cli logic).
2. **Build verification**: `npm run build` + `npm run build:cli` + `npm run compile` sin errores.
3. **Visual regression (manual con chrome-devtools)**:
   - Abrir el extension webview, verificar que la oficina se ve del mismo tamaño aparente que antes de Fase 1.
   - Verificar que characters se mueven a misma velocidad aparente (tile/sec).
   - Verificar animations (typing/reading), bubbles posicionados correctamente.
   - Verificar matrix effect spawn/despawn.
   - Verificar layout editor: painting, furniture placing, ghost preview, hit-testing.
4. **Regeneración de assets**: `npx tsx scripts/generate-cave-theme.ts` completa sin warnings; todos los PNGs nuevos tienen las dimensiones esperadas.
5. **Multi-DPR**: probar en DPR=1.0, 1.5, 2.0 (chrome-devtools emulation) — default zoom debería dar tile de ~32–64 px físicos en los tres casos.

## Rollout

Un solo PR/commit grande, big-bang (no hay coexistencia de 16-px y 64-px assets). Pasos:

1. Modificar `Canvas` class + `SCALE` en `generate-cave-theme.ts`.
2. Regenerar todos los PNGs + manifests (comitear).
3. Escalar constantes en `webview-ui/src/constants.ts` + ajustar fórmula de zoom default.
4. Type-check, build, test.
5. Verificación visual manual con chrome-devtools.

## Open Questions

- **Asset extraction pipeline** (`scripts/0-*` a `5-*`): no se toca en Fase 1. Si alguien quiere seguir importando tilesets externos después, el pipeline necesita ajustes — queda fuera de scope.

## Deliverables (post-implementación)

- `scripts/generate-cave-theme.ts` con `SCALE = 4` en `Canvas` y manifest writers.
- Assets regenerados en `webview-ui/public/assets/` (characters, floors, walls, furniture).
- `webview-ui/src/constants.ts` con `TILE_SIZE = 64` + constantes escaladas.
- Lógica de zoom default preservando tamaño aparente.
- Build verde; visual regression manual OK; `npm test` verde.
