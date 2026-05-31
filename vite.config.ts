import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Handle OnlyOffice dev-server quirks:
// 1. Strip the version-hash prefix api.js inserts into all editor URLs.
//    e.g. /9.3.0-<hash>/web-apps/... → /web-apps/...
// 2. Return 404 for /doc/ socket.io polling paths so the socket.io client
//    gets a clean failure (not Vite's SPA HTML 200), triggering its offline
//    fallback rather than looping forever on bad responses.
function onlyofficeVersionRewrite(): Plugin {
  return {
    name: 'onlyoffice-version-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        // Block socket.io /doc/ polling before rewriting so the path check is simple.
        if (/\/doc\/[^/]+\/c\//.test(req.url)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        // Strip version prefix: /9.3.0-<hash>/anything → /anything
        if (/^\/\d+\.\d+\.\d+-[a-f0-9]+\//.test(req.url)) {
          req.url = req.url.replace(/^\/\d+\.\d+\.\d+-[a-f0-9]+\//, '/');
        }
        next();
      });
    },
  };
}

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [onlyofficeVersionRewrite()],
  resolve: {
    alias: {
      '@/lib': resolve(__dirname, 'lib'),
      '@/store': resolve(__dirname, 'store'),
      '@/assets': resolve(__dirname, 'assets'),
      '@/types': resolve(__dirname, 'types'),
      '@/styles': resolve(__dirname, 'styles'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/base.css";`,
      },
    },
  },
});
