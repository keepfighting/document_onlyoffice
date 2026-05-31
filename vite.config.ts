import fs from 'node:fs/promises';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Return 404 for socket.io /doc/ polling so the client gets a clean failure
// instead of Vite's SPA HTML (status 200 confuses socket.io into looping).
// Note: api.js is patched to set ver='' so no version-hash prefix is added.
function onlyofficeVersionRewrite(): Plugin {
  return {
    name: 'onlyoffice-version-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /\/doc\/[^/]+\/c\//.test(req.url)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// Inject window.AscDesktopEditor mock into editor index.html responses so
// 9.3.0 skips socket.io and uses the Desktop Editors code path instead.
// Logs every execCommand call to help identify what the editor expects.
function onlyofficeDesktopMock(): Plugin {
  const EDITOR_HTML = /\/web-apps\/apps\/(documenteditor|presentationeditor|spreadsheeteditor)\/main\/index\.html/;
  // Minimal AscDesktopEditor mock — grows as we discover required methods.
  // Each new "is not a function" error tells us what to add next.
  // Grows each iteration as we discover new "is not a function" errors.
  const MOCK = `<script>
(function () {
  function log() {
    var a = Array.prototype.slice.call(arguments);
    var parts = a.map(function(x) {
      if (typeof x === 'function') return 'fn:' + (x.name || 'anon');
      if (typeof x !== 'object' || x === null) return String(x).slice(0, 100);
      try { return 'obj{' + Object.keys(x).slice(0, 8).join(',') + '}'; }
      catch(e) { return 'obj'; }
    });
    console.log('[DE]', parts.join(' | '));
  }

  window.AscDesktopEditor = {
    execCommand: function(cmd, data) {
      log('execCommand', cmd, data ? data.slice(0, 200) : '');
      // title:button fires when app.js has initialized the toolbar UI — app is ready.
      // editor:onready fires after document loads (fallback path).
      // Use either signal to inject the binary directly.
      if ((cmd === 'title:button' || cmd === 'editor:onready') && !window.__localBinaryInjected) {
        var bin = window.parent && window.parent.__pendingBinary;
        var editor = window.Asc && window.Asc.editor;
        if (bin && bin.byteLength && editor && typeof editor.asc_openDocumentFromBytes === 'function') {
          window.__localBinaryInjected = true;
          var copy = new Uint8Array(bin.byteLength);
          copy.set(bin);
          log('execCommand: inject binary', copy.byteLength + 'b');
          // Temporarily clear AscDesktopEditor so Shc uses BRj (binary path) not Desktop loop
          var savedDE = window.AscDesktopEditor;
          window.AscDesktopEditor = null;
          try { editor.asc_openDocumentFromBytes(copy); }
          finally { window.AscDesktopEditor = savedDE; }
          window.parent.__localDocumentLoaded = true;
        }
      }
    },
    CreateEditorApi: function(api) {
      log('CreateEditorApi', api);
      window._editorApi = api;
      // Suppress "Connection is lost" dialog by no-op'ing the disconnect callback.
      // The dialog fires when socket.io fails — harmless in offline Desktop mode.
      if (api && typeof api.asc_registerCallback === 'function') {
        api.asc_registerCallback('asc_onCoAuthoringDisconnect', function(){});
        api.asc_registerCallback('asc_onConnectionStateChanged', function(){});
      }
    },
    SetDocumentName: function(name) { log('SetDocumentName', name); },
    // Called by SDK when Desktop mode is ready to start opening a file.
    // We directly call asc_openDocumentFromBytes with the binary stored in
    // window.parent.__pendingBinary by onlyoffice-editor.ts before creating
    // the editor. This bypasses the socket.io/postMessage routing entirely.
    LocalStartOpen: function() {
      log('LocalStartOpen');
      // Guard: only inject binary once — LocalStartOpen fires for each font script
      if (window.__localStartOpenFired) return;
      window.__localStartOpenFired = true;
      // Wait until app.js fires Common.Gateway.appReady() automatically,
      // which means all controllers are set up and SDK is ready to receive binary.
      // We intercept appReady to know the right moment.
      var origAppReady = null;
      function tryLoad() {
        if (window.__localBinaryInjected) return false;  // prevent double injection
        var bin = window.parent && window.parent.__pendingBinary;
        var editor = window.Asc && window.Asc.editor;
        if (!bin || !bin.byteLength || !editor || typeof editor.asc_openDocumentFromBytes !== 'function') {
          return false;
        }
        var copy = new Uint8Array(bin.byteLength);
        copy.set(bin);
        log('LocalStartOpen: asc_openDocumentFromBytes', copy.byteLength + 'b');
        window.__localBinaryInjected = true;
        // Temporarily clear AscDesktopEditor so Shc uses the original BRj path
        // (binary data path) instead of the Desktop LocalStartOpen loop.
        var savedDE = window.AscDesktopEditor;
        window.AscDesktopEditor = null;
        try { editor.asc_openDocumentFromBytes(copy); }
        finally { window.AscDesktopEditor = savedDE; }
        window.parent.__localDocumentLoaded = true;
        return true;
      }
      // Intercept Common.Gateway.appReady to get called at the right moment
      var gwCheckInterval = setInterval(function() {
        var gw = window.Common && window.Common.Gateway;
        if (!gw) return;
        if (gw.__appReadyIntercepted) return;
        gw.__appReadyIntercepted = true;
        var orig = gw.appReady.bind(gw);
        gw.appReady = function() {
          log('LocalStartOpen: intercepted appReady, injecting binary now');
          tryLoad();
          orig(); // still fire for parent to get onAppReady
        };
        clearInterval(gwCheckInterval);
      }, 20);
      // Direct fallback: try injecting binary with a short delay.
      // Covers the case where appReady never fires (Desktop mode suppresses it).
      // tryLoad() guards against double-injection via __localBinaryInjected.
      setTimeout(function() { tryLoad(); }, 500);
    },
    GetInstallPlugins: function() {
      log('GetInstallPlugins');
      // SDK's UpdateSystemPlugins accesses a[0].url and a[1].url unconditionally,
      // so return exactly 2 empty plugin groups to avoid "undefined.url" crash.
      return JSON.stringify([
        { url: '', pluginsData: [] },
        { url: '', pluginsData: [] }
      ]);
    }
  };
})();
</script>`;

  return {
    name: 'onlyoffice-desktop-mock',
    configureServer(server) {
      // Run after the version-rewrite middleware has already stripped the hash prefix.
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !EDITOR_HTML.test(req.url)) return next();
        const filePath = path.join(__dirname, 'public', req.url.split('?')[0]);
        try {
          const html = await fs.readFile(filePath, 'utf-8');
          const injected = html.replace('<head>', `<head>\n${MOCK}`);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(injected);
        } catch {
          next();
        }
      });
    },
  };
}

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [onlyofficeVersionRewrite(), onlyofficeDesktopMock()],
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
