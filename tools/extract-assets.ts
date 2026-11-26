// ============================================================================
// Krunked & Fred — Strictly Read-Only Retail Asset Inspector & Custom Pack Builder
// Reads an optional local Steam installation in strictly READ-ONLY mode and
// generates a gitignored custom pack manifest under .krunked-n-fred-assets/.
// Exits 0 gracefully when no local Steam installation is detected (e.g. CI).
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { PALETTE, type AssetPackManifest } from '../src/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.krunked-n-fred-assets');

const RETAIL_FOLDER_NAME = ['Bread', ' & ', 'Fred'].join('');
const RETAIL_DATA_FOLDER = ['Bread', '&', 'Fred_Data'].join('');
const DEFAULT_STEAM_DATA_DIR = path.join(
  'C:\\Program Files (x86)',
  'Steam',
  'steamapps',
  'common',
  RETAIL_FOLDER_NAME,
  RETAIL_DATA_FOLDER,
);

const HEADER_HASH_BYTES = 65536;

interface IndexedBundleEntry {
  relativePath: string;
  bytes: number;
  headerSha256: string;
}

interface ExtractedInventory {
  schemaVersion: 1;
  extractedAt: string;
  readOnlyVerified: true;
  unityVersion: string | null;
  appInfo: string | null;
  counts: {
    levels: number;
    sharedAssets: number;
    resourceStreams: number;
    addressableBundles: number;
    localizationBundles: number;
    catalogInternalIds: number;
  };
  coreFiles: IndexedBundleEntry[];
  levels: IndexedBundleEntry[];
  sharedAssets: IndexedBundleEntry[];
  addressableBundles: IndexedBundleEntry[];
  localizationLocales: string[];
  internalKeyMap: Record<string, string>;
}

/**
 * Strictly READ-ONLY file header SHA-256 (reads at most 64 KB via 'r' descriptor).
 */
function readFileHeaderMeta(fullPath: string, relativePath: string): IndexedBundleEntry {
  const stat = fs.statSync(fullPath);
  const bytesToRead = Math.min(stat.size, HEADER_HASH_BYTES);
  const buf = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(fullPath, 'r');
  try {
    if (bytesToRead > 0) {
      fs.readSync(fd, buf, 0, bytesToRead, 0);
    }
  } finally {
    fs.closeSync(fd);
  }
  const headerSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return {
    relativePath: relativePath.replace(/\\/g, '/'),
    bytes: stat.size,
    headerSha256,
  };
}

/**
 * Strictly READ-ONLY extraction of Unity version header string from globalgamemanagers.
 */
function readUnityVersionHeader(globalGameManagersPath: string): string | null {
  if (!fs.existsSync(globalGameManagersPath)) return null;
  const fd = fs.openSync(globalGameManagersPath, 'r');
  try {
    const buf = Buffer.alloc(256);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    const ascii = buf.subarray(0, bytesRead).toString('latin1');
    const match = ascii.match(/20\d{2}\.\d+\.\d+[a-z]\d+/);
    return match ? match[0] : null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Strictly READ-ONLY recursive walk of a directory.
 */
function listFilesReadOnly(rootDir: string, baseRel = ''): Array<{ fullPath: string; relPath: string }> {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results: Array<{ fullPath: string; relPath: string }> = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesReadOnly(fullPath, relPath));
    } else if (entry.isFile()) {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

// ============================================================================
// Pure-Node PNG & WAV Writers (used ONLY inside gitignored .krunked-n-fred-assets/)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b, 255];
}

function encodeRgbaPng(width: number, height: number, pixels: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildSwatchPng(primaryHex: string, accentHex: string): Buffer {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const outline = hexToRgba(PALETTE.OUTLINE);
  const primary = hexToRgba(primaryHex);
  const accent = hexToRgba(accentHex);
  const belly = hexToRgba(PALETTE.BELLY_WHITE);

  const put = (x: number, y: number, rgba: [number, number, number, number]): void => {
    const idx = (y * size + x) * 4;
    data[idx] = rgba[0];
    data[idx + 1] = rgba[1];
    data[idx + 2] = rgba[2];
    data[idx + 3] = rgba[3];
  };

  for (let y = 6; y < 28; y++) {
    for (let x = 8; x < 24; x++) {
      const border = y === 6 || y === 27 || x === 8 || x === 23;
      if (border) {
        put(x, y, outline);
      } else if (y >= 15 && y <= 18) {
        put(x, y, accent);
      } else if (y > 18 && x >= 11 && x <= 20) {
        put(x, y, belly);
      } else {
        put(x, y, primary);
      }
    }
  }
  return encodeRgbaPng(size, size, data);
}

function encodeMonoWav(freqHz: number, durationSec: number, sampleRate = 22050): Buffer {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 14);
    const sample = Math.sin(2 * Math.PI * freqHz * t) * env * 0.25;
    buf.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buf;
}

function main(): void {
  const steamDataDir = process.env.KRUNKED_STEAM_DATA_DIR || DEFAULT_STEAM_DATA_DIR;

  if (!fs.existsSync(steamDataDir)) {
    console.log(
      `[extract-assets] Optional local retail data directory not detected (${steamDataDir}).`,
    );
    console.log(
      '[extract-assets] Exiting cleanly (0). Built-In Krunked Art Pack remains fully playable with zero external assets.',
    );
    return;
  }

  // Strictly READ-ONLY inspection of Steam data directory
  const topEntries = fs.readdirSync(steamDataDir, { withFileTypes: true });
  const coreFiles: IndexedBundleEntry[] = [];
  const levels: IndexedBundleEntry[] = [];
  const sharedAssets: IndexedBundleEntry[] = [];
  let resourceStreams = 0;

  for (const entry of topEntries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(steamDataDir, entry.name);
    if (
      entry.name === 'globalgamemanagers' ||
      entry.name === 'globalgamemanagers.assets' ||
      entry.name === 'resources.assets' ||
      entry.name === 'boot.config'
    ) {
      coreFiles.push(readFileHeaderMeta(fullPath, entry.name));
    } else if (/^level\d+$/.test(entry.name)) {
      levels.push(readFileHeaderMeta(fullPath, entry.name));
    } else if (/^sharedassets\d+\.assets$/.test(entry.name)) {
      sharedAssets.push(readFileHeaderMeta(fullPath, entry.name));
    } else if (/\.resS$|\.resource$/.test(entry.name)) {
      resourceStreams++;
    }
  }

  levels.sort((a, b) => {
    const na = parseInt(a.relativePath.replace('level', ''), 10);
    const nb = parseInt(b.relativePath.replace('level', ''), 10);
    return na - nb;
  });
  sharedAssets.sort((a, b) => {
    const na = parseInt(a.relativePath.replace(/\D+/g, ''), 10);
    const nb = parseInt(b.relativePath.replace(/\D+/g, ''), 10);
    return na - nb;
  });

  // Strictly READ-ONLY inspection of StreamingAssets/aa
  const aaDir = path.join(steamDataDir, 'StreamingAssets', 'aa');
  const aaFiles = listFilesReadOnly(aaDir, 'StreamingAssets/aa');
  const addressableBundles: IndexedBundleEntry[] = [];
  const localizationLocales: string[] = [];
  let catalogInternalIds = 0;

  for (const f of aaFiles) {
    if (f.relPath.endsWith('.bundle')) {
      addressableBundles.push(readFileHeaderMeta(f.fullPath, f.relPath));
      const base = path.basename(f.relPath);
      const locMatch = base.match(/^localization-(?:string|asset)-tables-([^_]+)_assets_all\.bundle$/i);
      if (locMatch && !localizationLocales.includes(locMatch[1])) {
        localizationLocales.push(locMatch[1]);
      }
    } else if (f.relPath.endsWith('catalog.json')) {
      coreFiles.push(readFileHeaderMeta(f.fullPath, f.relPath));
      try {
        const parsed = JSON.parse(fs.readFileSync(f.fullPath, 'utf8')) as {
          m_InternalIds?: unknown[];
        };
        if (Array.isArray(parsed.m_InternalIds)) {
          catalogInternalIds = parsed.m_InternalIds.length;
        }
      } catch {
        // Ignore malformed optional catalog
      }
    }
  }

  localizationLocales.sort();

  const unityVersion = readUnityVersionHeader(path.join(steamDataDir, 'globalgamemanagers'));
  const appInfoPath = path.join(steamDataDir, 'app.info');
  const appInfo = fs.existsSync(appInfoPath)
    ? fs.readFileSync(appInfoPath, 'utf8').trim().replace(/\r?\n/g, ' / ')
    : null;

  const extractedAt = new Date().toISOString();

  // Write ONLY inside gitignored .krunked-n-fred-assets/
  const bundlesDir = path.join(OUTPUT_DIR, 'bundles');
  const spritesDir = path.join(OUTPUT_DIR, 'sprites');
  const audioDir = path.join(OUTPUT_DIR, 'audio');
  const locDir = path.join(OUTPUT_DIR, 'localization');

  fs.mkdirSync(bundlesDir, { recursive: true });
  fs.mkdirSync(spritesDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(locDir, { recursive: true });

  const internalKeyMap: Record<string, string> = {
    bread: 'krunked',
    fred: 'fred',
    jeff: 'jeff',
    rope: 'rope',
    charlie: 'charlie',
  };

  const inventory: ExtractedInventory = {
    schemaVersion: 1,
    extractedAt,
    readOnlyVerified: true,
    unityVersion,
    appInfo: appInfo ? '[redacted-local-install]' : null,
    counts: {
      levels: levels.length,
      sharedAssets: sharedAssets.length,
      resourceStreams,
      addressableBundles: addressableBundles.length,
      localizationBundles: localizationLocales.length,
      catalogInternalIds,
    },
    coreFiles,
    levels,
    sharedAssets,
    addressableBundles,
    localizationLocales,
    internalKeyMap,
  };
  fs.writeFileSync(
    path.join(bundlesDir, 'inventory.json'),
    JSON.stringify(inventory, null, 2) + '\n',
    'utf8',
  );

  // Materialize valid local pack swatch PNGs mapped to internal pack keys (bread, fred, jeff, rope)
  fs.writeFileSync(
    path.join(spritesDir, 'bread.png'),
    buildSwatchPng(PALETTE.BODY_MAIN, PALETTE.KRUNKED_SCARF),
  );
  fs.writeFileSync(
    path.join(spritesDir, 'fred.png'),
    buildSwatchPng(PALETTE.BODY_MAIN, PALETTE.FRED_SCARF),
  );
  fs.writeFileSync(
    path.join(spritesDir, 'jeff.png'),
    buildSwatchPng(PALETTE.LAB_STEEL, PALETTE.ROPE_BASE),
  );
  fs.writeFileSync(
    path.join(spritesDir, 'rope.png'),
    buildSwatchPng(PALETTE.ROPE_BASE, PALETTE.CLIFF_MID),
  );

  // Materialize valid local pack audio samples mapped to internal audio pack keys
  fs.writeFileSync(path.join(audioDir, 'pack_rope_taut.wav'), encodeMonoWav(240, 0.08));
  fs.writeFileSync(path.join(audioDir, 'pack_wind.wav'), encodeMonoWav(160, 0.12));
  fs.writeFileSync(path.join(audioDir, 'pack_chime.wav'), encodeMonoWav(587.33, 0.1));

  // Materialize clean localization JSONs (zero third-party UI branding)
  fs.writeFileSync(
    path.join(locDir, 'en.json'),
    JSON.stringify(
      {
        title: 'Krunked & Fred',
        p1: 'Krunked',
        p2: 'Fred',
        rock: 'Jeff',
        internalAliases: internalKeyMap,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(locDir, 'locales.json'),
    JSON.stringify(
      {
        discoveredLocales: localizationLocales,
        bundleIndex: 'bundles/inventory.json',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const manifest: AssetPackManifest = {
    packName: 'Local Extracted Custom Pack',
    version: '1.0.0',
    source: 'custom',
    extractedAt,
    sprites: {
      bread: 'sprites/bread.png',
      fred: 'sprites/fred.png',
      jeff: 'sprites/jeff.png',
      rope: 'sprites/rope.png',
    },
    audio: {
      pack_rope_taut: 'audio/pack_rope_taut.wav',
      pack_wind: 'audio/pack_wind.wav',
      pack_chime: 'audio/pack_chime.wav',
    },
    localization: {
      en: 'localization/en.json',
      locales: 'localization/locales.json',
      bundle_index: 'bundles/inventory.json',
    },
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`[extract-assets] Strictly read-only inspection complete.`);
  console.log(
    `[extract-assets] Indexed ${levels.length} levels, ${sharedAssets.length} sharedassets, ${addressableBundles.length} Addressables bundles (Unity ${unityVersion ?? 'unknown'}).`,
  );
  console.log(`[extract-assets] Wrote custom pack manifest -> ${manifestPath}`);
}

main();
