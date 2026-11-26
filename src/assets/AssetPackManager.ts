// ============================================================================
// Krunked & Fred — Dual Asset Pack Manager (Built-In Krunked Art + Custom Pack)
// Instant built-in boot, clean /.krunked-n-fred-assets/ probe, runtime folder
// picker, and seamless per-key fallback with ZERO console errors.
// ============================================================================

import type { AssetPackManifest, PackSource } from '../contracts';
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

  private activeSource: PackSource = 'builtin';
  private customPackAvailable = false;
  private probedServerPack = false;
  private probePromise: Promise<boolean> | null = null;

  private manifest: AssetPackManifest | null = null;
  private readonly customSprites = new Map<string, HTMLImageElement>();
  private customAudioUrls: Record<string, string> = {};
  private readonly createdObjectUrls: string[] = [];

  constructor(atlas?: ProceduralPixelAtlas) {
    this.atlas = atlas ?? new ProceduralPixelAtlas();
  }

  getAtlas(): ProceduralPixelAtlas {
    return this.atlas;
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

  /**
   * Probes /.krunked-n-fred-assets/manifest.json safely with zero thrown errors
   * or console spam if no custom pack is present.
   */
  async probeCustomPack(): Promise<boolean> {
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
            resolvedAudio[k] = this.resolveCustomUrl(rel);
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

    if (!this.customPackAvailable && !this.probedServerPack) {
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
   * (e.g., <input type="file" webkitdirectory />).
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

    for (const file of list) {
      const rel = (
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      )
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
      const base = rel.replace(/^.*\//, '');
      byRelativePath.set(rel, file);
      byRelativePath.set(base, file);
      // Also store path with top-level selected directory stripped
      const slash = rel.indexOf('/');
      if (slash > 0) {
        byRelativePath.set(rel.slice(slash + 1), file);
      }

      if (base.toLowerCase() === 'manifest.json') {
        try {
          const text = await file.text();
          parsedManifest = JSON.parse(text) as Partial<AssetPackManifest>;
        } catch {
          parsedManifest = null;
        }
      } else if (IMAGE_EXT_RE.test(base)) {
        imageFiles.push(file);
      } else if (AUDIO_EXT_RE.test(base)) {
        const url = URL.createObjectURL(file);
        this.createdObjectUrls.push(url);
        this.customAudioUrls[stemOf(base)] = url;
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
          const clean = rel.replace(/\\/g, '/').replace(/^\.?\//, '');
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
        const clean = rel.replace(/\\/g, '/').replace(/^\.?\//, '');
        const file =
          byRelativePath.get(clean) ?? byRelativePath.get(clean.replace(/^.*\//, ''));
        if (file) {
          this.customAudioUrls[key] = getUrlForFile(file);
        }
      }
    }

    if (loadedCount === 0 && !parsedManifest) {
      return false;
    }

    this.manifest = {
      packName:
        typeof parsedManifest?.packName === 'string'
          ? parsedManifest.packName
          : 'Imported Custom Pack',
      version:
        typeof parsedManifest?.version === 'string' ? parsedManifest.version : '1.0.0',
      source: 'custom',
      extractedAt: parsedManifest?.extractedAt,
      sprites: parsedManifest?.sprites ?? {},
      audio: { ...this.customAudioUrls },
      localization: parsedManifest?.localization ?? {},
    };

    this.customPackAvailable = true;
    this.activeSource = 'custom';
    return true;
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

  private resolveCustomUrl(rel: string): string {
    if (rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('/') || rel.startsWith('blob:')) {
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
