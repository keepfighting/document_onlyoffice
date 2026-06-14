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
// 9.3.0 Desktop tarball sdkjs skips socket.io and uses the Desktop code path.
//
// Correct Desktop flow (9.3.0):
//   index.html detects AscDesktopEditor → execCommand("webapps:entry")
//   app.js loads → execCommand("webapps:features")
//   sdkjs + app.js ready → preloader:hide → execCommand("editor:onready")
//   mock responds to editor:onready → Common.Gateway.openDocumentFromBinary(data)
//   → loadBinary → api.asc_openDocumentFromBytes(bytes) → Shc() → renders
function onlyofficeDesktopMock(): Plugin {
  const EDITOR_HTML = /\/web-apps\/apps\/(documenteditor|presentationeditor|spreadsheeteditor)\/main\/index\.html/;
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

  // Redirect ascdesktop://fonts/ to our open-source equivalents in public/fonts/.
  // Unmapped fonts keep ascdesktop:// URL → CORS failure → SDK skips gracefully.
  (function() {
    var map = {
      'arial.ttf':'LiberationSans-Regular.ttf',
      'arialbd.ttf':'LiberationSans-Bold.ttf',
      'ariali.ttf':'LiberationSans-Italic.ttf',
      'arialbi.ttf':'LiberationSans-BoldItalic.ttf',
      'arialn.ttf':'LiberationSans-Regular.ttf',
      'arialnb.ttf':'LiberationSans-Bold.ttf',
      'arialblk.ttf':'LiberationSans-Bold.ttf',
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
      'helvetica.ttf':'LiberationSans-Regular.ttf',
      'helveticabd.ttf':'LiberationSans-Bold.ttf',
      'verdana.ttf':'DejaVuSans.ttf',
      'verdanab.ttf':'DejaVuSans-Bold.ttf',
      'verdanai.ttf':'DejaVuSans-Oblique.ttf',
      'verdanaz.ttf':'DejaVuSans-BoldOblique.ttf',
      'tahoma.ttf':'DejaVuSans.ttf',
      'tahomabd.ttf':'DejaVuSans-Bold.ttf',
      'times.ttf':'DejaVuSans.ttf',
      'timesbd.ttf':'DejaVuSans-Bold.ttf',
      'timesi.ttf':'DejaVuSans-Oblique.ttf',
      'timesbi.ttf':'DejaVuSans-BoldOblique.ttf',
      'cambria.ttc':'DejaVuSans.ttf',
      'cambriab.ttf':'DejaVuSans-Bold.ttf',
      'cambriai.ttf':'DejaVuSans-Oblique.ttf',
      'cambriaz.ttf':'DejaVuSans-BoldOblique.ttf',
      'georgia.ttf':'DejaVuSans.ttf',
      'georgiab.ttf':'DejaVuSans-Bold.ttf',
      'georgiai.ttf':'DejaVuSans-Oblique.ttf',
      'georgiaz.ttf':'DejaVuSans-BoldOblique.ttf',
      'cour.ttf':'DejaVuSansMono.ttf',
      'courbd.ttf':'DejaVuSansMono-Bold.ttf',
      'couri.ttf':'DejaVuSansMono-Oblique.ttf',
      'courbi.ttf':'DejaVuSansMono-BoldOblique.ttf',
      'consolab.ttf':'DejaVuSansMono-Bold.ttf',
      'consolai.ttf':'DejaVuSansMono-Oblique.ttf',
      'consolaz.ttf':'DejaVuSansMono-BoldOblique.ttf',
      'comic.ttf':'ComicNeue-Regular.ttf',
      'comicbd.ttf':'ComicNeue-Bold.ttf',
      'comici.ttf':'ComicNeue-Italic.ttf',
      'comicz.ttf':'ComicNeue-BoldItalic.ttf',
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
      }
      return origOpen.apply(this, arguments);
    };
  })();

  // Suppress "Connection is lost" dialog — polls until Common.UI.warning is available.
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

  // Provide theme info so index.html Desktop init doesn't crash on uitheme.
  window.RendererProcessVariable = {
    theme: { id: 'default-light', type: 'light' }
  };

  window.AscDesktopEditor = {
    execCommand: function(cmd, data) {
      log('execCommand', cmd, (data || '').slice ? (data || '').slice(0, 120) : '');
    },

    CreateEditorApi: function(api) {
      log('CreateEditorApi');
      window.__desktopApi = api;
      if (!api || typeof api.asc_registerCallback !== 'function') return;

      // Patch AscCommon.r3.prototype.MOa() to always return true.
      // The 9.3.0 Desktop sdkjs overrides Shc() — when AscDesktopEditor is present and
      // MOa() returns false, Shc() ignores the bytes argument and calls LocalStartOpen()
      // instead of BRj(), creating a circular dependency. With MOa=true, Shc() always
      // falls through to BRj() (the original server-mode path) which correctly processes
      // bytes from openDocument(). AscDesktopEditor still stays for CreateEditorApi/etc.
      try {
        if (window.AscCommon && window.AscCommon.r3) {
          window.AscCommon.r3.prototype.MOa = function() { return true; };
          log('MOa patched → BRj path active');
        }
      } catch(e) { log('MOa patch err', e.message || String(e)); }

      api.asc_registerCallback('asc_onCoAuthoringDisconnect', function(){});
      api.asc_registerCallback('asc_onConnectionStateChanged', function(){});
    },

    SetDocumentName: function(name) { log('SetDocumentName', name); },

    // LocalStartOpen is normally called by the Desktop-mode Shc() override, but with
    // MOa patched to true, Shc() uses BRj() instead and never calls LocalStartOpen().
    // Kept as a no-op in case it's called from another code path.
    LocalStartOpen: function() { log('LocalStartOpen (no-op, MOa=true)'); },

    GetInstallPlugins: function() {
      // SDK accesses result[0].url and result[1].url unconditionally.
      return JSON.stringify([
        { url: '', pluginsData: [] },
        { url: '', pluginsData: [] }
      ]);
    },

    // Required by 9.3.0 Desktop sdkjs scale detection.
    GetSupportedScaleValues: function() {
      return [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
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
  plugins: [onlyofficeVersionRewrite(), onlyofficeDesktopMock(), injectCriticalStyle(), injectGtag()],
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
