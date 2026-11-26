import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ASSETS_DIR = path.resolve(__dirname, '.krunked-n-fred-assets');

const MIME_MAP: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function customAssetPackMiddleware(): Plugin {
  return {
    name: 'krunked-custom-pack-readonly-middleware',
    configureServer(server) {
      server.middlewares.use('/.krunked-n-fred-assets', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const safeRel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
        const fullPath = path.resolve(ASSETS_DIR, safeRel);
        if (!fullPath.startsWith(ASSETS_DIR) || !fs.existsSync(fullPath)) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        res.setHeader('Content-Type', MIME_MAP[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') {
          res.statusCode = 200;
          res.end();
          return;
        }
        fs.createReadStream(fullPath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [customAssetPackMiddleware()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
