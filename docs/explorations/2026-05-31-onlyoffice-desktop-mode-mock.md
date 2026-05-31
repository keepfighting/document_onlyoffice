# OnlyOffice 9.3.0 Desktop Mode Mock 探索

**日期：** 2026-05-31  
**分支：** `upgrade/onlyoffice-9.3.0`  
**状态：** 接近成功 — 文档可加载，最后一步时序问题待解

---

## 问题背景

在 [2026-05-31-onlyoffice-9.3.0-upgrade.md](./2026-05-31-onlyoffice-9.3.0-upgrade.md) 中确认，9.3.0 Document Server（Docker）是服务端连接版本，无法离线使用。`code.js` 需要 socket.io 握手才加载，`onAppReady` 永远不触发。

Desktop Editors 9.3.0 的文件结构与 Document Server 几乎相同（build 140 vs 138），同样有 `code.js`。但 Desktop 模式通过 `window.AscDesktopEditor` native bridge 绕过 socket.io。

本文记录：**如何 mock `AscDesktopEditor` 让 9.3.0 在纯 web 环境下离线运行**。

---

## 核心发现：两种初始化路径

### Server 模式（9.3.0 默认）

```
index.html → require(['app']) → app.js
  → socket.io 连接 /doc/{id}/c/?EIO=4&transport=polling
  → 服务器响应 → 动态加载 code.js
  → Common.Gateway.appReady() 触发
  → 父页面收到 onAppReady → 发送 openDocumentFromBinary
  → 文档渲染
```

**关键问题**：没有 socket.io 服务器，code.js 永远不加载，onAppReady 不触发。

### Desktop 模式（mock 目标）

```
index.html（检测到 AscDesktopEditor）
  → execCommand("webapps:entry", ...) → execCommand("webapps:features", ...)
  → CreateEditorApi(sdkApi)
  → SetDocumentName(fileName)
  → GetInstallPlugins() → UpdateSystemPlugins()
  → LocalStartOpen()   ← 关键转折点
  → [native app 提供文件内容]
  → 文档加载 → preloader:hide → execCommand("editor:onready")
```

Desktop 模式完全不依赖 socket.io，`code.js` 也不需要。

---

## 实施步骤与关键发现

### 1. 基础 Mock 注入

在 Vite 插件里把 `<script>` 注入到所有编辑器 `index.html` 的 `<head>` 最前面：

```typescript
// vite.config.ts
function onlyofficeDesktopMock(): Plugin {
  const EDITOR_HTML = /\/web-apps\/apps\/(documenteditor|presentationeditor|spreadsheeteditor)\/main\/index\.html/;
  return {
    name: 'onlyoffice-desktop-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !EDITOR_HTML.test(req.url)) return next();
        const html = await fs.readFile(filePath, 'utf-8');
        res.end(html.replace('<head>', `<head>\n${MOCK_SCRIPT}`));
      });
    },
  };
}
```

### 2. api.js 两处必要补丁

**补丁一：去掉版本哈希前缀**

Desktop 版 `api.js` 里有 `const ver = '/9.3.0-{{HASH_POSTFIX}}'`，把它设为空字符串让路径回到自然位置：

```bash
sed -i '' "s|const ver = '/9.3.0-{{HASH_POSTFIX}}'|const ver = ''|" \
  public/web-apps/apps/api/documents/api.js
```

**补丁二：parentOrigin 设为 file://**

```bash
sed -i '' "s|_config.parentOrigin = window.location.origin;|_config.parentOrigin = \"file://\";|" \
  public/web-apps/apps/api/documents/api.js
```

原因：`openDocumentFromBinary` postMessage 路由的条件是：
```javascript
if (t.origin === window.parentOrigin || t.origin === window.location.origin || ...)
```
设为 `"file://"` 后，`t.origin === window.location.origin`（两者都是 localhost:5174）这一分支仍然成立，所以路由正常，但同时激活了 Desktop-specific 的处理路径。

### 3. AscDesktopEditor mock 方法列表

逐步通过 "X is not a function" 错误发现需要的方法：

| 方法 | 原因 |
|------|------|
| `execCommand(cmd, data)` | 编辑器状态通知，editor:onready 在这里触发 |
| `CreateEditorApi(api)` | Desktop 模式不走 socket.io，直接创建 SDK API |
| `SetDocumentName(name)` | SDK 设置文档标题 |
| `GetInstallPlugins()` | **必须返回含 2 个 group 的 JSON 字符串**（见下方） |
| `LocalStartOpen()` | SDK 通知 native app "我准备好接收文件了" |

**GetInstallPlugins 关键**：SDK 的 `window.UpdateSystemPlugins` 强制访问 `a[0].url` 和 `a[1].url`，所以必须返回至少 2 个元素：

```javascript
GetInstallPlugins: function() {
  return JSON.stringify([
    { url: '', pluginsData: [] },
    { url: '', pluginsData: [] }
  ]);
}
```

**LocalStartOpen 陷阱**：每个字体脚本加载都会触发一次，需要加 guard：

```javascript
LocalStartOpen: function() {
  if (window.__localStartOpenFired) return;
  window.__localStartOpenFired = true;
  // ... inject binary
}
```

### 4. AllFonts.js 问题

Desktop Editors 的 sdkjs 没有预构建的 `AllFonts.js`（这个文件在 Desktop app 运行时由 native 端从系统字体生成）。

**解决方案**：从 Docker 版 sdkjs 备份里拷贝：

```bash
cp public/sdkjs/common.docker/AllFonts.js public/sdkjs/common/AllFonts.js
```

**注意**：AllFonts.js 会被 Service Worker 缓存。如果之前请求过 404（文件不存在时 Vite 返回 SPA HTML），SW 会缓存这个 HTML。必须清除 SW 缓存后重试：

```javascript
await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
await navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())));
```

### 5. Common.Gateway 事件系统解析

```javascript
// 定义
Common.Gateway = new function() {
  var t = this, e = $(t);  // e 是 jQuery 包装的 Gateway 本身
  var i = {
    openDocumentFromBinary: function(data) { e.trigger("opendocumentfrombinary", data) },
    // ...
  };
  return {
    on: function(eventName, callback) {
      e.on(eventName, function(jqEvent, data) {
        callback.call(t, data);  // 注意：jQuery handler 收到 (event, data)，Gateway.on 的回调只收到 data
      });
    },
    appReady: function() { n({event: "onAppReady"}) },
    // ...
  };
}
```

**关键**：`Common.Gateway` 没有 `trigger` 方法——`e.trigger()` 是通过内部 jQuery 包装对象调用的，外部无法直接触发。要触发 `opendocumentfrombinary` 只能通过：
- 发送 postMessage `{command: 'openDocumentFromBinary', data: ArrayBuffer}`
- 或直接调用 `window.Asc.editor.asc_openDocumentFromBytes(uint8Array)`

### 6. 二进制注入：asc_openDocumentFromBytes

**关键发现**：直接调用 `asc_openDocumentFromBytes` 确认有效：

```javascript
// 从 DevTools 控制台直接调用成功：
const bin = window.parent.__pendingBinary;  // 存储在父页面的 Uint8Array
const copy = new Uint8Array(bin.byteLength);
copy.set(bin);
window.Asc.editor.asc_openDocumentFromBytes(copy);
// → 文档成功加载！标题变为 "test.docx - ONLYOFFICE"
```

**Emscripten WASM heap 陷阱**：`FS.readFile()` 返回的 Uint8Array 是 WASM heap 的 view。`uint8.buffer` 是整个 WASM heap（几十 MB）不是文件本身。必须先复制：

```typescript
const copy = new Uint8Array(src.byteLength);
copy.set(src);
// 现在 copy.buffer 是独立的 ArrayBuffer，只含文件内容
```

### 7. 时序问题（当前待解）

`LocalStartOpen` 在字体脚本加载时触发（SDK 中途初始化阶段），此时 `app.js` 的 Main controller 还没运行（`opendocumentfrombinary` 监听器未注册）。

调用 `asc_openDocumentFromBytes` 的时机必须在 SDK 完全准备好后。已验证：`app.js` 初始化时会自动调用 `Common.Gateway.appReady()`，这是最合适的注入时机：

```javascript
// 拦截 appReady 作为触发信号
var orig = gw.appReady.bind(gw);
gw.appReady = function() {
  tryLoad();  // 在 appReady 时注入 binary
  orig();     // 继续正常触发 onAppReady
};
```

**当前状态**：此拦截方案尚未验证成功，是下一步的主要方向。

---

## 当前 mock 完整实现

```javascript
(function () {
  function log() { /* ... */ }

  window.UpdateSystemPlugins = function(json) { /* SDK 自己定义，no-op */ };

  window.AscDesktopEditor = {
    execCommand: function(cmd, data) {
      log('execCommand', cmd, data ? data.slice(0, 200) : '');
    },
    CreateEditorApi: function(api) {
      log('CreateEditorApi', api);
      window._editorApi = api;
      // 抑制 "Connection is lost" 弹框
      if (api && typeof api.asc_registerCallback === 'function') {
        api.asc_registerCallback('asc_onCoAuthoringDisconnect', function(){});
        api.asc_registerCallback('asc_onConnectionStateChanged', function(){});
      }
    },
    SetDocumentName: function(name) { log('SetDocumentName', name); },
    LocalStartOpen: function() {
      if (window.__localStartOpenFired) return;
      window.__localStartOpenFired = true;
      // 拦截 Common.Gateway.appReady 作为"SDK 完全就绪"信号
      var gwCheckInterval = setInterval(function() {
        var gw = window.Common && window.Common.Gateway;
        if (!gw || gw.__appReadyIntercepted) return;
        gw.__appReadyIntercepted = true;
        var orig = gw.appReady.bind(gw);
        gw.appReady = function() {
          // 在此时注入 binary — SDK 所有 controller 已初始化
          var bin = window.parent.__pendingBinary;
          var editor = window.Asc && window.Asc.editor;
          if (bin && editor && typeof editor.asc_openDocumentFromBytes === 'function') {
            var copy = new Uint8Array(bin.byteLength);
            copy.set(bin);
            editor.asc_openDocumentFromBytes(copy);
            window.parent.__localDocumentLoaded = true;
          }
          orig();
        };
        clearInterval(gwCheckInterval);
      }, 20);
    },
    GetInstallPlugins: function() {
      return JSON.stringify([{ url: '', pluginsData: [] }, { url: '', pluginsData: [] }]);
    }
  };
})();
```

---

## 文件变更清单

```
public/web-apps/apps/api/documents/api.js
  - ver = ''（去掉版本哈希前缀）
  - _config.parentOrigin = "file://"（激活 Desktop 文档路由）

public/sdkjs/common/AllFonts.js
  - 从 Docker 7.5.0 备份拷贝（Desktop sdkjs 不含此文件）

vite.config.ts
  - onlyofficeVersionRewrite()：/doc/ socket.io 路由返回 404
  - onlyofficeDesktopMock()：注入 AscDesktopEditor mock 到编辑器 HTML

lib/onlyoffice-editor.ts
  - 存储 binData 到 window.__pendingBinary（iframe mock 可访问）
  - onAppReady 时检查 __localDocumentLoaded，跳过重复的 openDocument 调用
  - parentOrigin: 'file://' 加入 DocEditor config（冗余但保留）

lib/document-converter.ts
  - absolutePath = new URL(SCRIPT_PATH, window.location.href).href
    （新版 x2t.js pre-js 要求绝对 URL，否则 new URL(mySrc) 报错）
```

---

---

## 最终工作机制（2026-05-31 晚间）

经过完整调试，以下是稳定工作的完整流程：

### 完整初始化链路

```
1. 用户上传文件 → x2t 转换 → binary 存入 window.__pendingBinary
2. DocsAPI.DocEditor 创建（parentOrigin="file://", ver=''）
3. AscDesktopEditor mock 注入：webapps:entry → webapps:features → CreateEditorApi
4. GetInstallPlugins → UpdateSystemPlugins（2 group 数组）
5. LocalStartOpen 触发（第一次：设置 guard，启动 500ms 定时器）
6. 500ms 后：tryLoad() 调用，binary 注入：
   a. 临时清除 window.AscDesktopEditor = null
   b. 调用 editor.asc_openDocumentFromBytes(copy)
      → Shc() 使用 BRj(d)（原始路径，处理二进制数据）
   c. 恢复 window.AscDesktopEditor
7. asc_openDocumentFromBytes 开始加载文档（server mode via BRj）
8. 约 60 秒后：socket.io 重试超时 → asc_onCoAuthoringDisconnect 触发
   （Common.UI.warning 拦截，弹框被抑制）
9. app.js Main controller 初始化 → title:button → editor:onready
10. 文档渲染（字体从 ascdesktop://fonts/ 加载，CORS 失败后用 fallback）
```

### 关键发现总结

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `Shc()` 忽略 binary 数据 | Desktop 模式下 `Shc` 被重写，检测到 `AscDesktopEditor` 就调 `LocalStartOpen` | 临时清除 `AscDesktopEditor = null` 后再调 `asc_openDocumentFromBytes` |
| `opendocumentfrombinary` 事件无效 | Desktop 模式下 `app.js` 的 Main controller 不走 `onLaunch` | 直接调 SDK 的 `asc_openDocumentFromBytes` 绕过事件路由 |
| appReady 不可写 | `Common.Gateway` 的 `appReady` 是 return 对象属性，`Object.assign` 无效 | 用 `gwCheckInterval` 轮询 + `gw.appReady = wrapper`（实测可写） |
| `GetInstallPlugins` 返回 `[]` 崩溃 | SDK `UpdateSystemPlugins` 强制访问 `a[0].url` | 必须返回含 2 个 group 的 JSON 字符串 |
| `AllFonts.js` 引起字体崩溃 | Docker 版 `AllFonts.js` 列了 218 个字体 ID，SDK 等待全部加载 | 换回原版（empty `__fonts_files`） |
| socket.io 重连循环 | fake handshake 让 socket.io 认为能连，一直重试 | 保持 404，接受 ~60s 超时 |
| "Connection is lost" 弹框 | socket.io 超时后 `asc_onCoAuthoringDisconnect` 触发 app.js 回调 | 拦截 `Common.UI.warning`，屏蔽含 "Connection is lost" 的消息 |
| 字体不渲染 | 文档引用 Windows 字体（Arial, Calibri 等），SDK 尝试 `ascdesktop://fonts/` | CORS 失败 → SDK 用 fallback，文字显示为 gray bars |

### 当前状态

- ✅ 文档正常加载（~60 秒，等 socket.io 超时）
- ✅ 无 "Connection is lost" 弹框
- ✅ 无 "An error has occurred while opening the file" 错误
- ⏳ 字体渲染：文档结构正确但文字显示为灰条（Windows 字体不可用）
- ⏳ 加载时间：需要约 60 秒

### 下一步优化路径

1. **字体渲染**：把 `AllFonts.js` 的 `__fonts_infos` 从 Windows 路径改为我们的 TTF 文件，这样 SDK 能用 `public/fonts/` 里的开源字体渲染
2. **加载速度**：研究如何让 SDK 在 socket.io 超时前就触发 `asc_onCoAuthoringDisconnect`（可能需要在 OnlyOffice SDK 里找到 co-authoring 模块的超时参数）
3. **生产构建**：`onlyofficeDesktopMock` 仅在 dev server 注入，生产需要把 mock 作为单独文件通过 SW 注入
4. **新建文档**：`empty_bin.ts` 里的空文档 binary 是 7.5.0 格式，需要用 x2t 9.3.0 重新生成
