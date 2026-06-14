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
      // editor:onready fires when app.js is fully initialized (after socket.io
      // disconnect). At this point, this.tma/Qk/Gig() conditions are true,
      // making asc_nativeOpenFile actually trigger the full rendering pipeline.
      // We call asc_nativeOpenFile directly instead of going through appReady()
      // → openDocument → loadBinary → asc_openDocumentFromBytes (server-mode).
      if (cmd === 'editor:onready' && !window.__nativeFileLoaded) {
        var orig = window.parent && window.parent.__pendingOriginalFile;
        var api = window.__nativeFileApi || (window.Asc && window.Asc.editor);
        if (orig && orig.byteLength && api && typeof api.asc_nativeOpenFile === 'function') {
          window.__nativeFileLoaded = true;
          var copy = new Uint8Array(orig.byteLength);
          copy.set(orig);
          log('execCommand: editor:onready → asc_nativeOpenFile (app.js ready)', copy.byteLength + 'b');
          try { api.asc_nativeOpenFile(copy); } catch(e) { log('nativeOpenFile err', e.message||String(e)); }
        }
      }
    },
    CreateEditorApi: function(api) {
      log('CreateEditorApi', api);
      window._editorApi = api;
      if (!api || typeof api.asc_registerCallback !== 'function') return;
      // Suppress "Connection is lost" dialog
      api.asc_registerCallback('asc_onCoAuthoringDisconnect', function(){});
      api.asc_registerCallback('asc_onConnectionStateChanged', function(){});
      // Wrap asc_openDocumentFromBytes to temporarily clear AscDesktopEditor.
      // Without this, Shc() in Desktop mode ignores the binary data.
      // This also makes the loadBinary path (via app.js) work correctly.
      var origOpenBytes = api.asc_openDocumentFromBytes.bind(api);
      api.asc_openDocumentFromBytes = function(data) {
        var savedDE = window.AscDesktopEditor;
        window.AscDesktopEditor = null;
        try { return origOpenBytes(data); }
        finally { window.AscDesktopEditor = savedDE; }
      };
      // Intercept asc_onDocumentContentReady registration — this fires in app.js
      // onLaunch, signaling that app.js is fully initialized and ready to receive
      // asc_nativeOpenFile. This bypasses the 60s socket.io timeout completely.
      var origRegister = api.asc_registerCallback.bind(api);
      api.asc_registerCallback = function(name, fn) {
        origRegister(name, fn);
        if (name === 'asc_onDocumentContentReady' && !window.__nativeFileReady) {
          // Mark that onLaunch has run and the callback is registered.
          // We call asc_nativeOpenFile later from LocalStartOpen when ta is ready.
          window.__nativeFileReady = true;
          window.__nativeFileApi = api;
          log('asc_onDocumentContentReady registered, will call asc_nativeOpenFile in LocalStartOpen');
        }
      };
    },
    SetDocumentName: function(name) { log('SetDocumentName', name); },
    // Called by SDK when Desktop mode is ready to start opening a file.
    // Step 1: call asc_openDocumentFromBytes(x2t_bin) to start server-mode loading.
    //         This sets up state and eventually causes app.js to initialize.
    // Step 2: after editor:onready fires (app.js ready), call asc_nativeOpenFile
    //         with the ORIGINAL file for actual OOXML rendering.
    LocalStartOpen: function() {
      log('LocalStartOpen');
      if (window.__localStartOpenFired) return;
      window.__localStartOpenFired = true;
      function tryLoad() {
        if (window.__localBinaryInjected) return false;
        // Prefer asc_nativeOpenFile (OOXML path, direct rendering) if onLaunch
        // has already registered asc_onDocumentContentReady (indicated by __nativeFileReady).
        // This avoids the 60s socket.io timeout of the asc_openDocumentFromBytes path.
        var orig = window.parent && window.parent.__pendingOriginalFile;
        var api = window.__nativeFileApi || (window.Asc && window.Asc.editor);
        // Use asc_openDocumentFromBytes (wrapped in CreateEditorApi to auto-clear AscDE).
        // The wrapper ensures BRj() path runs. editor:onready → appReady() will trigger
        // a second call via loadBinary, which is what actually renders the canvas.
        var bin = window.parent && window.parent.__pendingBinary;
        var editor = window.Asc && window.Asc.editor;
        if (!bin || !bin.byteLength || !editor || typeof editor.asc_openDocumentFromBytes !== 'function') {
          return false;
        }
        var copyB = new Uint8Array(bin.byteLength);
        copyB.set(bin);
        log('LocalStartOpen: asc_openDocumentFromBytes (fallback)', copyB.byteLength + 'b');
        window.__localBinaryInjected = true;
        // asc_openDocumentFromBytes is already wrapped in CreateEditorApi to clear AscDE
        editor.asc_openDocumentFromBytes(copyB);
        // Do NOT set __localDocumentLoaded — let editor:onready → appReady() handle rendering.
        return true;
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

// Hide #seo-content before first paint to eliminate flash-of-unstyled-content
// when navigating between pages. JS removes it and renders the landing panel.
// noscript re-shows it so crawlers without JS still see the content.
function injectCriticalStyle(): Plugin {
  const style = `<style>#seo-content{display:none}</style><noscript><style>#seo-content{display:block}</style></noscript>`;
  return {
    name: 'inject-critical-style',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('<head>', `<head>\n${style}`);
      },
    },
  };
}

// Inject Google Analytics into every HTML page at build time.
// Only active in production — dev mode skips it to keep the console clean.
function injectGtag(): Plugin {
  const GTAG_ID = 'G-VQCV194W8Q';
  const snippet = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GTAG_ID}');
</script>`;
  return {
    name: 'inject-gtag',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return html; // skip in dev
        return html.replace('</head>', `${snippet}\n</head>`);
      },
    },
  };
}

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export default defineConfig({
  root: 'pages',
  base: './',
  publicDir: resolve(__dirname, 'public'),
  plugins: [onlyofficeVersionRewrite(), injectCriticalStyle(), injectGtag()],
  server: {
    fs: {
      // Allow Vite to serve src/ which lives outside the pages/ root
      allow: [__dirname],
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'pages/index.html'),
        privateDocumentEditor: resolve(__dirname, 'pages/private-document-editor/index.html'),
        docxEditor: resolve(__dirname, 'pages/docx-editor/index.html'),
        xlsxEditor: resolve(__dirname, 'pages/xlsx-editor/index.html'),
        pptxEditor: resolve(__dirname, 'pages/pptx-editor/index.html'),
        csvEditor: resolve(__dirname, 'pages/csv-editor/index.html'),
        onlyofficeWasm: resolve(__dirname, 'pages/onlyoffice-wasm/index.html'),
        embedDocumentEditor: resolve(__dirname, 'pages/embed-document-editor/index.html'),
        selfHostedDocumentEditor: resolve(__dirname, 'pages/self-hosted-document-editor/index.html'),
        // zh-cn pages
        zhCnMain: resolve(__dirname, 'pages/zh-cn/index.html'),
        zhCnDocxEditor: resolve(__dirname, 'pages/zh-cn/docx-editor/index.html'),
        zhCnXlsxEditor: resolve(__dirname, 'pages/zh-cn/xlsx-editor/index.html'),
        zhCnPptxEditor: resolve(__dirname, 'pages/zh-cn/pptx-editor/index.html'),
        zhCnCsvEditor: resolve(__dirname, 'pages/zh-cn/csv-editor/index.html'),
        zhCnPrivateDocumentEditor: resolve(__dirname, 'pages/zh-cn/private-document-editor/index.html'),
        zhCnOnlyofficeWasm: resolve(__dirname, 'pages/zh-cn/onlyoffice-wasm/index.html'),
        zhCnEmbedDocumentEditor: resolve(__dirname, 'pages/zh-cn/embed-document-editor/index.html'),
        zhCnSelfHostedDocumentEditor: resolve(__dirname, 'pages/zh-cn/self-hosted-document-editor/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@/lib': resolve(__dirname, 'src/lib'),
      '@/store': resolve(__dirname, 'src/store'),
      '@/types': resolve(__dirname, 'src/types'),
      '@/styles': resolve(__dirname, 'src/styles'),
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
