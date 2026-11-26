// ============================================================================
// Krunked & Fred — Dual Asset Pack Manager (Built-In Krunked Art + Custom Pack)
// Instant built-in boot, persistent IndexedDB folder store, clean
// /.krunked-n-fred-assets/ probe, and seamless per-key fallback with ZERO
// console errors.
// ============================================================================

import type { AssetPackManifest, PackSource } from '../contracts';
import {
  IndexedDbPackStore,
  type StoredCustomPack,
  type StoredPackFile,
} from './IndexedDbPackStore';
import { ProceduralPixelAtlas } from './ProceduralPixelAtlas';

const CUSTOM_PACK_BASE = '/.krunked-n-fred-assets';
const CUSTOM_MANIFEST_URL = `${CUSTOM_PACK_BASE}/manifest.json`;

const IMAGE_EXT_RE = /\.(png|webp|gif|jpe?g)$/i;
const AUDIO_EXT_RE = /\.(wav|ogg|mp3)$/i;

function stemOf(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, '');
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

function normalizeRelPath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '');
}

function guessMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export class AssetPackManager {
  readonly atlas: ProceduralPixelAtlas;
  readonly packStore: IndexedDbPackStore;

  private activeSource: PackSource = 'builtin';
  private customPackAvailable = false;
  private hydratedFromDb = false;
  private probedServerPack = false;
  private probePromise: Promise<boolean> | null = null;
  private hydratePromise: Promise<boolean> | null = null;

  private manifest: AssetPackManifest | null = null;
  private readonly customSprites = new Map<string, HTMLImageElement>();
  private customAudioUrls: Record<string, string> = {};
  private readonly createdObjectUrls: string[] = [];

  constructor(atlas?: ProceduralPixelAtlas, packStore?: IndexedDbPackStore) {
    this.atlas = atlas ?? new ProceduralPixelAtlas();
    this.packStore = packStore ?? new IndexedDbPackStore();
  }

  getAtlas(): ProceduralPixelAtlas {
    return this.atlas;
  }

  getPackStore(): IndexedDbPackStore {
    return this.packStore;
  }

  getPackSource(): PackSource {
    return this.activeSource;
  }

  hasCustomPack(): boolean {
    return this.customPackAvailable;
  }

  getManifest(): AssetPackManifest | null {
    return this.manifest;
  }

  getCustomAudioUrls(): Record<string, string> {
    return { ...this.customAudioUrls };
  }

  async hasPersistedCustomPack(): Promise<boolean> {
    return this.packStore.hasSavedPack();
  }

  /**
   * Restores a user-selected Owned Custom Pack previously stored in IndexedDB
   * without making any network requests. Safe no-op in SSR / private browsing.
   */
  async hydratePersistedPack(): Promise<boolean> {
    if (this.customPackAvailable) {
      return true;
    }
    if (this.hydratedFromDb) {
      return this.customPackAvailable;
    }
    if (this.hydratePromise) {
      return this.hydratePromise;
    }

    this.hydratePromise = (async () => {
      try {
        const stored = await this.packStore.loadPack();
        this.hydratedFromDb = true;
        if (!stored || (stored.files.length === 0 && !stored.manifest)) {
          return false;
        }
        return await this.applyStoredPack(stored);
      } catch {
        this.hydratedFromDb = true;
        return false;
      } finally {
        this.hydratePromise = null;
      }
    })();

    return this.hydratePromise;
  }

  /**
   * Checks IndexedDB persistence first, then probes
   * /.krunked-n-fred-assets/manifest.json safely with zero thrown errors or
   * console spam if no custom pack is present.
   */
  async probeCustomPack(): Promise<boolean> {
    if (this.customPackAvailable) {
      return true;
    }

    // 1. Restore from IndexedDB first (zero network traffic!)
    if (!this.hydratedFromDb) {
      const restored = await this.hydratePersistedPack();
      if (restored) {
        return true;
      }
    }

    if (this.probedServerPack) {
      return this.customPackAvailable;
    }
    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = (async () => {
      if (typeof fetch === 'undefined') {
        this.probedServerPack = true;
        return this.customPackAvailable;
      }

      try {
        const res = await fetch(CUSTOM_MANIFEST_URL, {
          method: 'GET',
          cache: 'no-cache',
        });
        if (!res.ok) {
          this.probedServerPack = true;
          return this.customPackAvailable;
        }
        const parsed = (await res.json()) as Partial<AssetPackManifest> | null;
        if (!parsed || typeof parsed !== 'object') {
          this.probedServerPack = true;
          return this.customPackAvailable;
        }

        const spriteEntries =
          parsed.sprites && typeof parsed.sprites === 'object'
            ? Object.entries(parsed.sprites)
            : [];
        const audioEntries =
          parsed.audio && typeof parsed.audio === 'object'
            ? Object.entries(parsed.audio)
            : [];

        const resolvedAudio: Record<string, string> = {};
        for (const [k, rel] of audioEntries) {
          if (typeof rel === 'string' && rel.length > 0) {
            const resolved = this.resolveCustomUrl(rel);
            resolvedAudio[k] = resolved;
            resolvedAudio[k.toLowerCase()] = resolved;
          }
        }
        this.customAudioUrls = resolvedAudio;

        await Promise.all(
          spriteEntries.map(async ([key, rel]) => {
            if (typeof rel !== 'string' || rel.length === 0) return;
            const img = await loadImageElement(this.resolveCustomUrl(rel));
            if (img) {
              this.customSprites.set(key, img);
              this.customSprites.set(key.toLowerCase(), img);
            }
          })
        );

        this.manifest = {
          packName: typeof parsed.packName === 'string' ? parsed.packName : 'Custom Pack',
          version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
          source: 'custom',
          extractedAt: typeof parsed.extractedAt === 'string' ? parsed.extractedAt : undefined,
          sprites: parsed.sprites ?? {},
          audio: resolvedAudio,
          localization: parsed.localization ?? {},
        };

        this.customPackAvailable = true;
        this.probedServerPack = true;
        return true;
      } catch {
        this.probedServerPack = true;
        return this.customPackAvailable;
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  async setPackSource(source: PackSource): Promise<PackSource> {
    if (source === 'builtin') {
      this.activeSource = 'builtin';
      return 'builtin';
    }

    if (!this.customPackAvailable) {
      await this.probeCustomPack();
    }

    if (this.customPackAvailable) {
      this.activeSource = 'custom';
      return 'custom';
    }

    // Graceful fallback to Built-In Krunked Art
    this.activeSource = 'builtin';
    return 'builtin';
  }

  /**
   * Loads a custom asset pack directly from a runtime folder/file picker
   * (e.g., <input type="file" webkitdirectory />) and persists manifest.json,
   * sprites, and audio cleanly into IndexedDB so it survives page reloads.
   */
  async loadCustomPackFromFiles(files: FileList | File[]): Promise<boolean> {
    const list = Array.from(files ?? []);
    if (list.length === 0) return false;

    this.revokeCreatedUrls();
    this.customSprites.clear();
    this.customAudioUrls = {};

    let parsedManifest: Partial<AssetPackManifest> | null = null;
    const byRelativePath = new Map<string, File>();
    const imageFiles: File[] = [];
    const filesToPersist: StoredPackFile[] = [];

    for (const file of list) {
      const rel = normalizeRelPath(
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      );
      const base = rel.replace(/^.*\//, '');
      const strippedRel = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;

      byRelativePath.set(rel, file);
      byRelativePath.set(base, file);
      if (strippedRel) {
        byRelativePath.set(strippedRel, file);
      }

      if (base.toLowerCase() === 'manifest.json') {
        try {
          const text = await file.text();
          parsedManifest = JSON.parse(text) as Partial<AssetPackManifest>;
          const buf = await file.arrayBuffer();
          filesToPersist.push({
            path: strippedRel || base,
            name: base,
            mimeType: file.type || 'application/json',
            kind: 'manifest',
            data: buf,
          });
        } catch {
          parsedManifest = null;
        }
      } else if (IMAGE_EXT_RE.test(base)) {
        imageFiles.push(file);
        try {
          const buf = await file.arrayBuffer();
          filesToPersist.push({
            path: strippedRel || base,
            name: base,
            mimeType: file.type || guessMimeType(base),
            kind: 'image',
            data: buf,
          });
        } catch {
          // Skip unreadable buffer for persistence; still decode in-memory below
        }
      } else if (AUDIO_EXT_RE.test(base)) {
        const url = URL.createObjectURL(file);
        this.createdObjectUrls.push(url);
        this.customAudioUrls[stemOf(base)] = url;
        try {
          const buf = await file.arrayBuffer();
          filesToPersist.push({
            path: strippedRel || base,
            name: base,
            mimeType: file.type || guessMimeType(base),
            kind: 'audio',
            data: buf,
          });
        } catch {
          // Skip persistence if buffer copy fails
        }
      }
    }

    const fileUrlCache = new Map<File, string>();
    const getUrlForFile = (f: File): string => {
      const existing = fileUrlCache.get(f);
      if (existing) return existing;
      const url = URL.createObjectURL(f);
      fileUrlCache.set(f, url);
      this.createdObjectUrls.push(url);
      return url;
    };

    let loadedCount = 0;

    // 1. Load images directly by filename stem
    await Promise.all(
      imageFiles.map(async (file) => {
        const url = getUrlForFile(file);
        const img = await loadImageElement(url);
        if (img) {
          const stem = stemOf(file.name);
          this.customSprites.set(stem, img);
          loadedCount++;
        }
      })
    );

    // 2. Apply explicit manifest sprite/audio mappings if present
    if (parsedManifest?.sprites && typeof parsedManifest.sprites === 'object') {
      await Promise.all(
        Object.entries(parsedManifest.sprites).map(async ([key, rel]) => {
          if (typeof rel !== 'string') return;
          const clean = normalizeRelPath(rel);
          const file =
            byRelativePath.get(clean) ?? byRelativePath.get(clean.replace(/^.*\//, ''));
          if (!file) return;
          const img = await loadImageElement(getUrlForFile(file));
          if (img) {
            this.customSprites.set(key, img);
            this.customSprites.set(key.toLowerCase(), img);
            loadedCount++;
          }
        })
      );
    }

    if (parsedManifest?.audio && typeof parsedManifest.audio === 'object') {
      for (const [key, rel] of Object.entries(parsedManifest.audio)) {
        if (typeof rel !== 'string') continue;
        const clean = normalizeRelPath(rel);
        const file =
          byRelativePath.get(clean) ?? byRelativePath.get(clean.replace(/^.*\//, ''));
        if (file) {
          const url = getUrlForFile(file);
          this.customAudioUrls[key] = url;
          this.customAudioUrls[key.toLowerCase()] = url;
          loadedCount++;
        }
      }
    }

    const hasAudio = Object.keys(this.customAudioUrls).length > 0;
    if (loadedCount === 0 && !hasAudio && !parsedManifest) {
      return false;
    }

    const finalManifest: AssetPackManifest = {
      packName:
        typeof parsedManifest?.packName === 'string'
          ? parsedManifest.packName
          : 'Imported Custom Pack',
      version:
        typeof parsedManifest?.version === 'string' ? parsedManifest.version : '1.0.0',
      source: 'custom',
      extractedAt: parsedManifest?.extractedAt,
      sprites: parsedManifest?.sprites ?? {},
      audio: parsedManifest?.audio ?? {},
      localization: parsedManifest?.localization ?? {},
    };

    this.manifest = finalManifest;
    this.customPackAvailable = true;
    this.hydratedFromDb = true;
    this.activeSource = 'custom';

    // Persist cleanly into IndexedDB (non-fatal if private browsing / quota full)
    await this.packStore.savePack({
      manifest: finalManifest,
      files: filesToPersist,
      savedAt: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Clears both in-memory custom pack state and persisted IndexedDB storage,
   * returning seamlessly to Built-In Krunked Art.
   */
  async clearCustomPack(): Promise<void> {
    this.revokeCreatedUrls();
    this.customSprites.clear();
    this.customAudioUrls = {};
    this.manifest = null;
    this.customPackAvailable = false;
    this.activeSource = 'builtin';
    this.hydratedFromDb = false;
    this.probedServerPack = false;
    await this.packStore.clearPack();
  }

  /**
   * Returns a custom override image if activeSource === 'custom' and the key
   * exists and finished decoding; otherwise returns null so caller seamlessly
   * falls back to Built-In ProceduralPixelAtlas art.
   */
  getCustomSprite(key: string): HTMLImageElement | null {
    if (this.activeSource !== 'custom') return null;
    const img = this.customSprites.get(key) ?? this.customSprites.get(key.toLowerCase());
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    return img;
  }

  dispose(): void {
    this.revokeCreatedUrls();
    this.customSprites.clear();
    this.customAudioUrls = {};
  }

  private async applyStoredPack(stored: StoredCustomPack): Promise<boolean> {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
      return false;
    }

    this.revokeCreatedUrls();
    this.customSprites.clear();
    this.customAudioUrls = {};

    const byPath = new Map<string, StoredPackFile>();
    const urlCache = new Map<StoredPackFile, string>();
    const getUrl = (entry: StoredPackFile): string => {
      const existing = urlCache.get(entry);
      if (existing) return existing;
      const blob = new Blob([entry.data], { type: entry.mimeType || guessMimeType(entry.name) });
      const url = URL.createObjectURL(blob);
      urlCache.set(entry, url);
      this.createdObjectUrls.push(url);
      return url;
    };

    const imageEntries: StoredPackFile[] = [];
    for (let i = 0; i < stored.files.length; i++) {
      const entry = stored.files[i];
      const clean = normalizeRelPath(entry.path || entry.name);
      const base = clean.replace(/^.*\//, '');
      byPath.set(clean, entry);
      byPath.set(base, entry);

      if (entry.kind === 'image' || IMAGE_EXT_RE.test(base)) {
        imageEntries.push(entry);
      } else if (entry.kind === 'audio' || AUDIO_EXT_RE.test(base)) {
        this.customAudioUrls[stemOf(base)] = getUrl(entry);
      }
    }

    let loadedCount = 0;
    await Promise.all(
      imageEntries.map(async (entry) => {
        const img = await loadImageElement(getUrl(entry));
        if (img) {
          this.customSprites.set(stemOf(entry.name), img);
          loadedCount++;
        }
      })
    );

    const parsedManifest = stored.manifest;
    if (parsedManifest?.sprites && typeof parsedManifest.sprites === 'object') {
      await Promise.all(
        Object.entries(parsedManifest.sprites).map(async ([key, rel]) => {
          if (typeof rel !== 'string') return;
          const clean = normalizeRelPath(rel);
          const entry = byPath.get(clean) ?? byPath.get(clean.replace(/^.*\//, ''));
          if (!entry) return;
          const img = await loadImageElement(getUrl(entry));
          if (img) {
            this.customSprites.set(key, img);
            this.customSprites.set(key.toLowerCase(), img);
            loadedCount++;
          }
        })
      );
    }

    if (parsedManifest?.audio && typeof parsedManifest.audio === 'object') {
      for (const [key, rel] of Object.entries(parsedManifest.audio)) {
        if (typeof rel !== 'string') continue;
        const clean = normalizeRelPath(rel);
        const entry = byPath.get(clean) ?? byPath.get(clean.replace(/^.*\//, ''));
        if (entry) {
          const url = getUrl(entry);
          this.customAudioUrls[key] = url;
          this.customAudioUrls[key.toLowerCase()] = url;
          loadedCount++;
        }
      }
    }

    const hasAudio = Object.keys(this.customAudioUrls).length > 0;
    if (loadedCount === 0 && !hasAudio && !parsedManifest) {
      return false;
    }

    this.manifest = parsedManifest ?? {
      packName: 'Restored Custom Pack',
      version: '1.0.0',
      source: 'custom',
      sprites: {},
      audio: {},
      localization: {},
    };
    this.customPackAvailable = true;
    return true;
  }

  private resolveCustomUrl(rel: string): string {
    if (
      rel.startsWith('http://') ||
      rel.startsWith('https://') ||
      rel.startsWith('/') ||
      rel.startsWith('blob:')
    ) {
      return rel;
    }
    return `${CUSTOM_PACK_BASE}/${rel.replace(/^\.?\//, '')}`;
  }

  private revokeCreatedUrls(): void {
    for (let i = 0; i < this.createdObjectUrls.length; i++) {
      try {
        URL.revokeObjectURL(this.createdObjectUrls[i]);
      } catch {
        // Ignore revoke errors
      }
    }
    this.createdObjectUrls.length = 0;
  }
}
