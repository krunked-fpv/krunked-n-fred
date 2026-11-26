// ============================================================================
// Krunked & Fred — Assets Barrel Exports
// ============================================================================

export {
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  measurePixelText,
  drawPixelText,
  drawWrappedPixelText,
  drawPixelBox,
  type PixelTextOptions,
} from './bitmapFont';

export {
  ProceduralPixelAtlas,
  PENGUIN_ANIM_COUNTS,
  PENGUIN_ANIM_ORDER,
  resolvePenguinSkinPalette,
  type PenguinAnimName,
  type TileVisualGroup,
  type SpriteRect,
  type PenguinSkinPalette,
  type PenguinSpriteSet,
} from './ProceduralPixelAtlas';

export {
  IndexedDbPackStore,
  CUSTOM_PACK_DB_NAME,
  CUSTOM_PACK_DB_VERSION,
  type StoredPackFileKind,
  type StoredPackFile,
  type StoredPackMetadata,
  type StoredCustomPack,
} from './IndexedDbPackStore';

export { AssetPackManager } from './AssetPackManager';

export {
  POLAROID_NATIVE_W,
  POLAROID_NATIVE_H,
  MANUAL_NATIVE_W,
  MANUAL_NATIVE_H,
  ROPE_SKIN_STYLES,
  renderPolaroidPhoto,
  getAllPolaroidUrls,
  renderManualDiagram,
  getAllManualDiagramUrls,
  renderCoopSkinPreview,
  renderJeffSkinPreview,
  renderRopeSkinPreview,
  drawStyledRopePoints,
  clearCollectibleArtCache,
  type RopeSkinVisualStyle,
} from './CollectibleArt';
