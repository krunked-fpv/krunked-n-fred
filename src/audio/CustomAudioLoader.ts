// ============================================================================
// Krunked & Fred — Lazy Custom Audio Pack Loader & AudioBuffer Cache
// Decodes and caches user-owned custom audio files (from /.krunked-n-fred-assets/
// or IndexedDB / File-picker blob URLs) into AudioBuffers lazily with zero
// errors on missing or unsupported keys, transparently falling back to
// ProceduralSynth. Pure Web Audio API, zero external deps, SSR-safe.
// ============================================================================

import type { AssetPackManifest } from '../contracts';

const DEFAULT_CUSTOM_PACK_BASE = '/.krunked-n-fred-assets';
const DEFAULT_MANIFEST_URL = `${DEFAULT_CUSTOM_PACK_BASE}/manifest.json`;

export interface CustomAudioLoaderOptions {
  /** Base URL used to resolve relative paths from custom pack manifests. */
  basePath?: string;
  /** Optional manifest URL for probing server-hosted local custom packs. */
  manifestUrl?: string;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function resolveAudioUrl(raw: string, basePath: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  const cleanBase = basePath.replace(/\/+$/, '');
  const cleanRel = trimmed.replace(/^\.?\//, '');
  return `${cleanBase}/${cleanRel}`;
}

function decodeAudioDataCompat(ctx: AudioContext, raw: ArrayBuffer): Promise<AudioBuffer> {
  // Always pass a sliced copy since decodeAudioData detaches its ArrayBuffer
  const copy = raw.slice(0);
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(
        copy,
        (decoded) => resolve(decoded),
        (err) => reject(err ?? new Error('Audio decode failed'))
      );
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

export class CustomAudioLoader {
  private readonly basePath: string;
  private readonly manifestUrl: string;

  private ctx: AudioContext | null = null;
  private disposed = false;
  private generation = 0;

  private readonly urls = new Map<string, string>();
  private readonly blobs = new Map<string, Blob>();
  private readonly cache = new Map<string, AudioBuffer | null>();
  private readonly inFlight = new Map<string, Promise<AudioBuffer | null>>();

  private probedServer = false;
  private probePromise: Promise<boolean> | null = null;

  constructor(options: CustomAudioLoaderOptions = {}) {
    this.basePath = options.basePath ?? DEFAULT_CUSTOM_PACK_BASE;
    this.manifestUrl =
      options.manifestUrl ??
      (options.basePath ? `${this.basePath.replace(/\/+$/, '')}/manifest.json` : DEFAULT_MANIFEST_URL);
  }

  /**
   * Attaches (or swaps) the live Web Audio AudioContext.
   * Safe to call before or after setUrls() / registerBlob().
   */
  attachContext(ctx: AudioContext | null): void {
    if (this.disposed) return;
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    // AudioBuffers belong to the context that decoded them, so reset decoded cache on swap
    this.generation++;
    this.cache.clear();
    this.inFlight.clear();
  }

  /**
   * Replaces the registered custom audio URL map (e.g. from AssetPackManager,
   * /.krunked-n-fred-assets/manifest.json, or IndexedDB/File blob URLs).
   */
  setUrls(urls: Record<string, string>): void {
    if (this.disposed) return;
    this.generation++;
    this.urls.clear();
    this.blobs.clear();
    this.cache.clear();
    this.inFlight.clear();

    if (!urls || typeof urls !== 'object') return;
    for (const [key, rawUrl] of Object.entries(urls)) {
      if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) continue;
      const resolved = resolveAudioUrl(rawUrl, this.basePath);
      this.urls.set(normalizeKey(key), resolved);
    }
  }

  /**
   * Registers or overrides a single audio key from a URL or blob URL.
   */
  registerUrl(key: string, url: string): void {
    if (this.disposed || !key || typeof url !== 'string' || url.trim().length === 0) return;
    const norm = normalizeKey(key);
    this.urls.set(norm, resolveAudioUrl(url, this.basePath));
    this.blobs.delete(norm);
    this.cache.delete(norm);
    this.inFlight.delete(norm);
  }

  /**
   * Registers a raw Blob (e.g. loaded directly from IndexedDB) for lazy decoding
   * without needing an intermediate object URL.
   */
  registerBlob(key: string, blob: Blob): void {
    if (this.disposed || !key || !blob) return;
    const norm = normalizeKey(key);
    this.blobs.set(norm, blob);
    this.urls.delete(norm);
    this.cache.delete(norm);
    this.inFlight.delete(norm);
  }

  /**
   * Safely probes /.krunked-n-fred-assets/manifest.json once and registers any
   * declared custom audio entries. Never throws and logs zero errors if absent.
   */
  async probeServerPack(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.probedServer) return this.urls.size > 0 || this.blobs.size > 0;
    if (this.probePromise) return this.probePromise;

    this.probePromise = (async () => {
      if (typeof fetch !== 'function') {
        this.probedServer = true;
        return false;
      }
      try {
        const res = await fetch(this.manifestUrl, { method: 'GET', cache: 'no-cache' });
        if (!res.ok) {
          this.probedServer = true;
          return false;
        }
        const parsed = (await res.json()) as Partial<AssetPackManifest> | null;
        if (!parsed || typeof parsed !== 'object' || !parsed.audio || typeof parsed.audio !== 'object') {
          this.probedServer = true;
          return false;
        }
        if (this.disposed) return false;

        let added = 0;
        for (const [k, rel] of Object.entries(parsed.audio)) {
          if (typeof rel !== 'string' || rel.trim().length === 0) continue;
          const norm = normalizeKey(k);
          if (!this.urls.has(norm) && !this.blobs.has(norm)) {
            this.urls.set(norm, resolveAudioUrl(rel, this.basePath));
            added++;
          }
        }
        this.probedServer = true;
        return added > 0 || this.urls.size > 0;
      } catch {
        this.probedServer = true;
        return false;
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  /**
   * Synchronous cache lookup for real-time SFX / BGM triggers.
   * - If any candidate key has a decoded AudioBuffer cached, returns it immediately.
   * - If a registered candidate key has not been decoded yet, kicks off a lazy
   *   background fetch+decode and returns null immediately so the caller falls
   *   back transparently to ProceduralSynth with zero stall.
   * - Never throws on missing, malformed, or unsupported keys.
   */
  getBufferSync(keys: string | readonly string[]): AudioBuffer | null {
    if (this.disposed) return null;
    const list = typeof keys === 'string' ? [keys] : keys;
    for (let i = 0; i < list.length; i++) {
      const rawKey = list[i];
      if (!rawKey) continue;
      const norm = normalizeKey(rawKey);
      if (!this.urls.has(norm) && !this.blobs.has(norm)) continue;

      if (this.cache.has(norm)) {
        const cached = this.cache.get(norm);
        if (cached) return cached;
        continue;
      }

      if (this.ctx && !this.inFlight.has(norm)) {
        void this.decodeKey(norm);
      }
    }
    return null;
  }

  /**
   * Lazily fetches and decodes a registered key into an AudioBuffer.
   * Resolves to null on missing/unsupported/corrupt files (never rejects).
   */
  async preload(key: string): Promise<AudioBuffer | null> {
    if (this.disposed || !key || !this.ctx) return null;
    const norm = normalizeKey(key);
    if (!this.urls.has(norm) && !this.blobs.has(norm)) return null;
    if (this.cache.has(norm)) {
      return this.cache.get(norm) ?? null;
    }
    return this.decodeKey(norm);
  }

  /**
   * Preloads a list of candidate keys concurrently without throwing.
   */
  async preloadKeys(keys: readonly string[]): Promise<void> {
    if (this.disposed || !this.ctx || keys.length === 0) return;
    await Promise.all(keys.map((k) => this.preload(k)));
  }

  hasKey(key: string): boolean {
    if (!key) return false;
    const norm = normalizeKey(key);
    return this.urls.has(norm) || this.blobs.has(norm);
  }

  getRegisteredKeys(): string[] {
    const out = new Set<string>();
    for (const k of this.urls.keys()) out.add(k);
    for (const k of this.blobs.keys()) out.add(k);
    return Array.from(out);
  }

  getCachedCount(): number {
    let count = 0;
    for (const val of this.cache.values()) {
      if (val !== null) count++;
    }
    return count;
  }

  clear(): void {
    this.generation++;
    this.urls.clear();
    this.blobs.clear();
    this.cache.clear();
    this.inFlight.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.ctx = null;
    this.probePromise = null;
  }

  private decodeKey(normKey: string): Promise<AudioBuffer | null> {
    const existing = this.inFlight.get(normKey);
    if (existing) return existing;

    const ctxRef = this.ctx;
    if (!ctxRef || ctxRef.state === 'closed') {
      return Promise.resolve(null);
    }

    const gen = this.generation;
    const blob = this.blobs.get(normKey);
    const url = this.urls.get(normKey);

    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        let arrayBuf: ArrayBuffer;
        if (blob) {
          arrayBuf = await blob.arrayBuffer();
        } else if (url && typeof fetch === 'function') {
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          arrayBuf = await res.arrayBuffer();
        } else {
          return null;
        }

        if (this.disposed || gen !== this.generation || ctxRef.state === 'closed') {
          return null;
        }

        const decoded = await decodeAudioDataCompat(ctxRef, arrayBuf);
        if (this.disposed || gen !== this.generation) {
          return null;
        }
        this.cache.set(normKey, decoded);
        return decoded;
      } catch {
        // Unsupported format, missing file, or revoked blob URL: cache null silently
        // so playback transparently falls back to ProceduralSynth with zero console noise.
        if (!this.disposed && gen === this.generation) {
          this.cache.set(normKey, null);
        }
        return null;
      } finally {
        if (gen === this.generation) {
          this.inFlight.delete(normKey);
        }
      }
    })();

    this.inFlight.set(normKey, task);
    return task;
  }
}
