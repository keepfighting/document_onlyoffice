import fs from 'node:fs/promises';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Return 404 for socket.io /doc/ polling. After socket.io's retry backoff
// (~60s), the SDK fires asc_onCoAuthoringDisconnect and document renders.
// api.js is patched: ver='' (no hash prefix), parentOrigin="file://".
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

  // Redirect ascdesktop://fonts/ only for fonts we actually have in public/fonts/.
  // For others, leave the ascdesktop:// URL → CORS failure → SDK skips gracefully.
  // (The SDK handles CORS failures well but fails on 404/HTML responses.)
  // Map Windows font filenames → our open-source alternatives in public/fonts/.
  // Unmapped fonts keep ascdesktop:// URL → CORS failure → SDK skips gracefully.
  (function() {
    var map = {
      // Arial family → LiberationSans (metric-compatible)
      'arial.ttf':'LiberationSans-Regular.ttf',
      'arialbd.ttf':'LiberationSans-Bold.ttf',
      'ariali.ttf':'LiberationSans-Italic.ttf',
      'arialbi.ttf':'LiberationSans-BoldItalic.ttf',
      'arialn.ttf':'LiberationSans-Regular.ttf',
      'arialnb.ttf':'LiberationSans-Bold.ttf',
      'arialblk.ttf':'LiberationSans-Bold.ttf',
      // Calibri/Candara/Corbel → LiberationSans
      'calibri.ttf':'LiberationSans-Regular.ttf',
      'calibrib.ttf':'LiberationSans-Bold.ttf',
      'calibrii.ttf':'LiberationSans-Italic.ttf',
      'calibriz.ttf':'LiberationSans-BoldItalic.ttf',
      'calibril.ttf':'LiberationSans-Regular.ttf',
      'candara.ttf':'LiberationSans-Regular.ttf',
      'candrab.ttf':'LiberationSans-Bold.ttf',
      'candrai.ttf':'LiberationSans-Italic.ttf',
      'candrabi.ttf':'LiberationSans-BoldItalic.ttf',
      'corbel.ttf':'LiberationSans-Regular.ttf',
      'corbelb.ttf':'LiberationSans-Bold.ttf',
      'corbeli.ttf':'LiberationSans-Italic.ttf',
      'corbelbi.ttf':'LiberationSans-BoldItalic.ttf',
      // Helvetica → LiberationSans
      'helvetica.ttf':'LiberationSans-Regular.ttf',
      'helveticabd.ttf':'LiberationSans-Bold.ttf',
      // Verdana/Tahoma → DejaVuSans
      'verdana.ttf':'DejaVuSans.ttf',
      'verdanab.ttf':'DejaVuSans-Bold.ttf',
      'verdanai.ttf':'DejaVuSans-Oblique.ttf',
      'verdanaz.ttf':'DejaVuSans-BoldOblique.ttf',
      'tahoma.ttf':'DejaVuSans.ttf',
      'tahomabd.ttf':'DejaVuSans-Bold.ttf',
      // Times/Book Antiqua → DejaVuSans
      'times.ttf':'DejaVuSans.ttf',
      'timesbd.ttf':'DejaVuSans-Bold.ttf',
      'timesi.ttf':'DejaVuSans-Oblique.ttf',
      'timesbi.ttf':'DejaVuSans-BoldOblique.ttf',
      // Cambria/Georgia → DejaVuSans
      'cambria.ttc':'DejaVuSans.ttf',
      'cambriab.ttf':'DejaVuSans-Bold.ttf',
      'cambriai.ttf':'DejaVuSans-Oblique.ttf',
      'cambriaz.ttf':'DejaVuSans-BoldOblique.ttf',
      'georgia.ttf':'DejaVuSans.ttf',
      'georgiab.ttf':'DejaVuSans-Bold.ttf',
      'georgiai.ttf':'DejaVuSans-Oblique.ttf',
      'georgiaz.ttf':'DejaVuSans-BoldOblique.ttf',
      // Courier/Consolas → DejaVuSansMono
      'cour.ttf':'DejaVuSansMono.ttf',
      'courbd.ttf':'DejaVuSansMono-Bold.ttf',
      'couri.ttf':'DejaVuSansMono-Oblique.ttf',
      'courbi.ttf':'DejaVuSansMono-BoldOblique.ttf',
      'consolab.ttf':'DejaVuSansMono-Bold.ttf',
      'consolai.ttf':'DejaVuSansMono-Oblique.ttf',
      'consolaz.ttf':'DejaVuSansMono-BoldOblique.ttf',
      // Comic Sans → ComicNeue
      'comic.ttf':'ComicNeue-Regular.ttf',
      'comicbd.ttf':'ComicNeue-Bold.ttf',
      'comici.ttf':'ComicNeue-Italic.ttf',
      'comicz.ttf':'ComicNeue-BoldItalic.ttf',
      // CJK fonts → Noto Sans
      'msyh.ttc':'NotoSansSC-VF.ttf',
      'msyhbd.ttc':'NotoSansSC-VF.ttf',
      'msyhl.ttc':'NotoSansSC-VF.ttf',
      'simsun.ttc':'NotoSansSC-VF.ttf',
      'simhei.ttf':'NotoSansSC-VF.ttf',
      'msjh.ttc':'NotoSansTC-VF.ttf',
      'msjhbd.ttc':'NotoSansTC-VF.ttf',
      'msmincho.ttc':'NotoSansJP-VF.ttf',
      'msgothic.ttc':'NotoSansJP-VF.ttf',
      'malgun.ttf':'NotoSansKR-VF.ttf',
    };
    var origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && url.indexOf('ascdesktop://fonts/') === 0) {
        var bs = String.fromCharCode(92);
        var fp = url.slice(19);
        var ls = Math.max(fp.lastIndexOf('/'), fp.lastIndexOf(bs));
        var fn = fp.slice(ls + 1).toLowerCase();
        var mapped = map[fn];
        if (mapped) arguments[1] = '/fonts/' + mapped;
        // else leave ascdesktop:// URL → CORS failure → SDK skips gracefully
      }
      return origOpen.apply(this, arguments);
    };
  })();

  // Suppress "Connection is lost" dialog by intercepting Common.UI.warning
  // once app.js has initialized it. Polls until available then wraps it.
  (function suppressDialog() {
    var ui = window.Common && window.Common.UI;
    if (!ui || typeof ui.warning !== 'function' || ui.__dlgSuppressed) {
      setTimeout(suppressDialog, 200);
      return;
    }
    ui.__dlgSuppressed = true;
    var orig = ui.warning.bind(ui);
    ui.warning = function(opts) {
      if (opts && typeof opts.msg === 'string' && opts.msg.indexOf('Connection is lost') !== -1) return;
      return orig.apply(ui, arguments);
    };
  })();

  window.AscDesktopEditor = {
    execCommand: function(cmd, data) {
      log('execCommand', cmd, data ? data.slice(0, 200) : '');
      // title:button fires when app.js has initialized the toolbar UI — app is ready.
      // editor:onready fires after document loads (fallback path).
      // Use either signal to inject the binary directly.
      // Suppress "Connection is lost" dialog after app.js initializes its callbacks.
      // The disconnect callback is registered by app.js in onLaunch (after CreateEditorApi),
      // so we must re-suppress it here after initialization.
      if (cmd === 'editor:onready') {
        var ed = window.Asc && window.Asc.editor;
        if (ed && typeof ed.asc_registerCallback === 'function') {
          ed.asc_registerCallback('asc_onCoAuthoringDisconnect', function(){});
          ed.asc_registerCallback('asc_onConnectionStateChanged', function(){});
        }
      }
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
