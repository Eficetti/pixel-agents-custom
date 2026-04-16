/**
 * VS Code adapter for core/assetLoader. Load* functions are pure fs I/O and
 * re-exported unchanged; send* functions wrap vscode.Webview → MessageSender
 * so callers using the extension keep their existing signatures.
 */
import type * as vscode from 'vscode';

import * as core from '../core/src/assetLoader.js';
import type { MessageSender } from '../core/src/interfaces.js';

// Type / interface re-exports (erase at runtime).
export type {
  CharacterDirectionSprites,
  FurnitureAsset,
  LoadedAssets,
  LoadedCharacterSprites,
  LoadedFloorTiles,
  LoadedWallTiles,
} from '../core/src/assetLoader.js';

// Value re-exports (pure filesystem, no vscode deps).
export const mergeLoadedAssets = core.mergeLoadedAssets;
export const loadFurnitureAssets = core.loadFurnitureAssets;
export const loadDefaultLayout = core.loadDefaultLayout;
export const loadWallTiles = core.loadWallTiles;
export const loadFloorTiles = core.loadFloorTiles;
export const loadCharacterSprites = core.loadCharacterSprites;
export const loadExternalCharacterSprites = core.loadExternalCharacterSprites;
export const mergeCharacterSprites = core.mergeCharacterSprites;

const toSender = (webview: vscode.Webview): MessageSender => ({
  postMessage: (msg: unknown) => webview.postMessage(msg),
});

export function sendWallTilesToWebview(
  webview: vscode.Webview,
  wallTiles: core.LoadedWallTiles,
): void {
  core.sendWallTilesToWebview(toSender(webview), wallTiles);
}

export function sendFloorTilesToWebview(
  webview: vscode.Webview,
  floorTiles: core.LoadedFloorTiles,
): void {
  core.sendFloorTilesToWebview(toSender(webview), floorTiles);
}

export function sendCharacterSpritesToWebview(
  webview: vscode.Webview,
  charSprites: core.LoadedCharacterSprites,
): void {
  core.sendCharacterSpritesToWebview(toSender(webview), charSprites);
}

export function sendAssetsToWebview(webview: vscode.Webview, assets: core.LoadedAssets): void {
  core.sendAssetsToWebview(toSender(webview), assets);
}
