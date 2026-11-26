// ============================================================================
// Krunked & Fred — Persistent IndexedDB Custom Asset Pack Store
// Database: krunked_n_fred_custom_pack_v1
// Stores user-owned custom pack manifest.json, PNG/WebP sprites, and audio
// files locally across reloads with graceful no-op in SSR / private browsing.
// ============================================================================

import type { AssetPackManifest } from '../contracts';

export const CUSTOM_PACK_DB_NAME = 'krunked_n_fred_custom_pack_v1';
export const CUSTOM_PACK_DB_VERSION = 1;

const META_STORE = 'pack_meta';
const FILES_STORE = 'pack_files';
const META_KEY = 'active_pack';

export type StoredPackFileKind = 'manifest' | 'image' | 'audio';

export interface StoredPackFile {
  path: string;
  name: string;
  mimeType: string;
  kind: StoredPackFileKind;
  data: ArrayBuffer;
}

export interface StoredPackMetadata {
  key: string;
  manifest: AssetPackManifest | null;
  savedAt: string;
  fileCount: number;
}

export interface StoredCustomPack {
  manifest: AssetPackManifest | null;
  files: StoredPackFile[];
  savedAt: string;
}

export class IndexedDbPackStore {
  private readonly dbName: string;

  constructor(dbName: string = CUSTOM_PACK_DB_NAME) {
    this.dbName = dbName;
  }

  /**
   * Returns true only when browser IndexedDB is available.
   * Safely returns false in SSR, Node test runners, or locked-down frames.
   */
  isSupported(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Persists the imported custom pack manifest and binary sprite/audio buffers.
   * Gracefully returns false on SSR, private-browsing quota refusal, or error.
   */
  async savePack(pack: StoredCustomPack): Promise<boolean> {
    const db = await this.openDb();
    if (!db) return false;

    try {
      const ok = await new Promise<boolean>((resolve) => {
        const tx = db.transaction([META_STORE, FILES_STORE], 'readwrite');
        const metaStore = tx.objectStore(META_STORE);
        const filesStore = tx.objectStore(FILES_STORE);

        metaStore.clear();
        filesStore.clear();

        const meta: StoredPackMetadata = {
          key: META_KEY,
          manifest: pack.manifest,
          savedAt: pack.savedAt || new Date().toISOString(),
          fileCount: pack.files.length,
        };
        metaStore.put(meta);

        for (let i = 0; i < pack.files.length; i++) {
          const entry = pack.files[i];
          filesStore.put({
            path: entry.path,
            name: entry.name,
            mimeType: entry.mimeType,
            kind: entry.kind,
            data: entry.data,
          });
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
      return ok;
    } catch {
      return false;
    } finally {
      this.safeClose(db);
    }
  }

  /**
   * Loads the previously persisted custom pack from IndexedDB, or returns null
   * when absent, unsupported, or unreadable.
   */
  async loadPack(): Promise<StoredCustomPack | null> {
    const db = await this.openDb();
    if (!db) return null;

    try {
      return await new Promise<StoredCustomPack | null>((resolve) => {
        const tx = db.transaction([META_STORE, FILES_STORE], 'readonly');
        const metaReq = tx.objectStore(META_STORE).get(META_KEY);
        const filesReq = tx.objectStore(FILES_STORE).getAll();

        let meta: StoredPackMetadata | undefined;
        let files: StoredPackFile[] = [];

        metaReq.onsuccess = () => {
          meta = metaReq.result as StoredPackMetadata | undefined;
        };
        filesReq.onsuccess = () => {
          const raw = filesReq.result;
          files = Array.isArray(raw) ? (raw as StoredPackFile[]) : [];
        };

        tx.oncomplete = () => {
          if (!meta && files.length === 0) {
            resolve(null);
            return;
          }
          resolve({
            manifest: meta?.manifest ?? null,
            files,
            savedAt: meta?.savedAt ?? new Date().toISOString(),
          });
        };
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      });
    } catch {
      return null;
    } finally {
      this.safeClose(db);
    }
  }

  /**
   * Lightweight check whether a persisted custom pack exists in IndexedDB.
   */
  async hasSavedPack(): Promise<boolean> {
    const db = await this.openDb();
    if (!db) return false;

    try {
      return await new Promise<boolean>((resolve) => {
        const tx = db.transaction([META_STORE], 'readonly');
        const req = tx.objectStore(META_STORE).get(META_KEY);
        let found = false;
        req.onsuccess = () => {
          const meta = req.result as StoredPackMetadata | undefined;
          found = Boolean(meta && (meta.fileCount > 0 || meta.manifest !== null));
        };
        tx.oncomplete = () => resolve(found);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
    } catch {
      return false;
    } finally {
      this.safeClose(db);
    }
  }

  /**
   * Clears all persisted custom pack records cleanly. Never throws.
   */
  async clearPack(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;

    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([META_STORE, FILES_STORE], 'readwrite');
        tx.objectStore(META_STORE).clear();
        tx.objectStore(FILES_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // Graceful no-op
    } finally {
      this.safeClose(db);
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) {
      return Promise.resolve(null);
    }

    return new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, CUSTOM_PACK_DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(FILES_STORE)) {
            db.createObjectStore(FILES_STORE, { keyPath: 'path' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            this.safeClose(db);
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private safeClose(db: IDBDatabase): void {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
}
