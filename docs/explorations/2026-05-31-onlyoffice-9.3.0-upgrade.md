# OnlyOffice 升级探索：7.5.0 → 9.3.0

**日期：** 2026-05-31  
**分支：** `upgrade/onlyoffice-9.3.0`  
**状态：** 进行中 — Desktop Mode Mock 方案接近成功，见 [desktop-mode-mock 文档](./2026-05-31-onlyoffice-desktop-mode-mock.md)

---

## 背景与动机

原项目使用 OnlyOffice 7.5.0（build: 2024-10-16），包含三个独立组件：

| 组件 | 路径 | 作用 |
|------|------|------|
| sdkjs | `public/sdkjs/` | 文档渲染引擎（word/cell/slide/common） |
| web-apps | `public/web-apps/` | 编辑器 UI 外壳（工具栏、菜单、API） |
| x2t WASM | `public/wasm/x2t/` | 格式转换器（docx↔bin，xlsx↔bin 等） |

升级目标：v9.3.0（2026-04-24），主要收益是 v9.2 的 Plugin API 扩展（Agent 协同开发所需）。

---

## 执行过程

### 阶段一：资源来源确认

在决定升级路径前，首先确认了各组件是否有对应的 9.3.0 版本：

```
cryptpad/onlyoffice-x2t-wasm releases：
  v9.3.0+0  (2026-04-24)  ✅ 有现成构建
  v8.3.0+0
  v7.3+1

onlyoffice/documentserver releases：
  v9.4.0  (2026-05-19)
  v9.3.1
  v9.3.0
  v9.3.0
```

结论：x2t WASM 有 9.3.0 版本可用；为保持版本对齐，选择升到 9.3.0 而非 9.4.0。

### 阶段二：从 Docker 提取静态文件

```bash
docker pull onlyoffice/documentserver:9.3.0
docker run -d --name oo930 onlyoffice/documentserver:9.3.0

# 打包后复制（docker cp 对有权限的目录报错）
docker exec oo930 tar czf /tmp/sdkjs.tar.gz -C /var/www/onlyoffice/documentserver sdkjs
docker cp oo930:/tmp/sdkjs.tar.gz /tmp/sdkjs.tar.gz
# 同理处理 web-apps
```

Docker 镜像内文件布局：`/var/www/onlyoffice/documentserver/{sdkjs,web-apps}`

**裁剪策略**（Docker 全量 → 项目实际需要）：

| 删除内容 | 原因 |
|---------|------|
| `sdkjs/pdf/`、`sdkjs/visio/` | 项目不支持这两种格式 |
| `web-apps/apps/pdfeditor/`、`visioeditor/` | 同上 |
| 各编辑器的 `mobile/`、`embed/`、`forms/` | 项目不使用这些变体 |
| 各编辑器的 `resources/help/` | 382+75+47=504MB 内置帮助文档 |
| `ie/` 目录 | IE 兼容层 |
| 所有 `*.gz` 文件 | GitHub Pages / Vite dev 不使用预压缩文件 |

裁剪后体积：sdkjs 90MB（原 47MB），web-apps 94MB（原 19MB）。体积增加来自新增的 `.bin` 数据文件（SmartArt 预设等运行时资产）。

### 阶段三：x2t WASM 替换

从 `cryptpad/onlyoffice-x2t-wasm@v9.3.0+0` 下载并替换：

```bash
curl -L "https://github.com/cryptpad/onlyoffice-x2t-wasm/releases/download/v9.3.0%2B0/x2t.zip" \
  -o /tmp/x2t-9.3.0.zip
unzip /tmp/x2t-9.3.0.zip -d public/wasm/x2t/
```

新版文件：`x2t.js`（133KB）、`x2t.wasm`（34MB）、`x2t.wasm.br`（6.5MB）。
旧版：`x2t.wasm` 55MB（wasm 体积缩小 38%）。

**注意**：新版用 `.br`（Brotli）替换了旧版的 `.gz` 压缩格式。项目代码只引用 `x2t.js`，路径未变，无需修改业务代码。

### 阶段四：代码 breaking changes 检查

CLAUDE.md 中列出三处潜在 breaking changes，全部在项目代码中**无引用**：

| 改动 | 版本 | 影响评估 |
|------|------|---------|
| `CreateTable(rows, cols)` 参数顺序变更 | v8.0 | 项目代码无调用 |
| `commentAuthorOnly` 参数移除 | v8.x | 项目配置无此项 |
| `installDeveloperPlugin` shim 移除 | v9.3.1 | 项目无插件加载逻辑 |

### 阶段五：发现 x2t.js URL 构造问题

**错误：**
```
x2t.js:24 Uncaught TypeError: Failed to construct 'URL': Invalid URL
```

**原因：** 新版 x2t.js 的 pre-js 代码在初始化时会执行：
```javascript
const mySrc = myScript.getAttribute("src");
suffix = new URL(mySrc).search;  // 根相对路径无 base → 报错
```

旧版没有这段 pre-js。新版 Emscripten 构建要求脚本以绝对 URL 加载。

**修复（`lib/document-converter.ts`）：**
```typescript
// 修复前
await scriptOnLoad([this.SCRIPT_PATH]);

// 修复后
const absolutePath = new URL(this.SCRIPT_PATH, window.location.href).href;
await scriptOnLoad([absolutePath]);
```

### 阶段六：发现版本哈希前缀问题

**现象：** 编辑器 iframe 加载的 URL 带有版本哈希前缀：
```
http://localhost:5174/9.3.0-e8849642d4e0376767bff939a16123a4/web-apps/apps/documenteditor/main/index.html
```

**原因：** 9.3.0 的 `api.js` 中硬编码了版本前缀：
```javascript
const ver = '/9.3.0-e8849642d4e0376767bff939a16123a4';
// 所有编辑器路径都会被插入这个前缀
```

该前缀用于 Service Worker 的作用域隔离。但 Vite 只在 `/web-apps/...` 提供文件，带前缀的路径返回 SPA fallback HTML（200）。

**修复（`vite.config.ts`）：**
```typescript
function onlyofficeVersionRewrite(): Plugin {
  return {
    name: 'onlyoffice-version-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        // 对 socket.io 连接路径返回 404，避免收到 HTML 误判为成功
        if (/\/doc\/[^/]+\/c\//.test(req.url)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        // 剥离版本前缀
        if (/^\/\d+\.\d+\.\d+-[a-f0-9]+\//.test(req.url)) {
          req.url = req.url.replace(/^\/\d+\.\d+\.\d+-[a-f0-9]+\//, '/');
        }
        next();
      });
    },
  };
}
```

---

## 根本问题：两种不同的 OnlyOffice 构建

经过以上修复后，编辑器 iframe 和所有静态资源（require.js、app.js、sdkjs、socket.io 等）均正常加载（HTTP 200）。但 `onAppReady` 始终未触发，文档无法打开。

### 问题分析

通过对比两个版本的架构，发现根本差异：

**7.5.0（原项目，Desktop Editors 离线构建）：**
- `app.js`：5.2MB，单一完整包，包含所有编辑器逻辑
- 有 `loading.js`（UI loading 动画）
- 无 `code.js`
- `onAppReady` 在 RequireJS 模块初始化完成后直接触发
- socket.io 作为可选依赖加载，连接失败不阻塞编辑器

**9.3.0（Docker documentserver，服务端连接版本）：**
- `app.js`：2.1MB（UI 外壳 + socket.io 客户端）
- `code.js`：1.1MB（实际编辑器引擎，动态加载）
- **`code.js` 在 socket.io 握手成功后才被动态加载**
- 无法离线使用——没有后端就没有 `onAppReady`

```
9.3.0 加载流程：
  index.html → require.js → app.js
    → socket.io 连接 /doc/{id}/c/?EIO=4&transport=polling
    → 服务器响应 → 动态加载 code.js
    → onAppReady 触发
    → （收到 asc_openDocument 命令 → 渲染文档）

7.5.0 加载流程：
  index.html → require.js → app.js（含完整引擎）
    → 初始化完成
    → onAppReady 触发（不依赖服务器）
    → （收到 asc_openDocument 命令 → 渲染文档）
```

### 验证方式

通过网络请求日志确认：在 9.3.0 下，`code.js` 从未被请求，即便等待 40+ 秒。`sdk-all.js` 不含任何 socket.io 代码，连接逻辑完全在 `app.js` 中。

### 正确的文件来源

原项目的 7.5.0 文件来自 **OnlyOffice Desktop Editors** 的内嵌 web 组件，不是 Docker documentserver。两者是完全不同的产品线：

| 产品 | 文件来源 | 是否需要服务器 |
|------|---------|-------------|
| Document Server | Docker `onlyoffice/documentserver` | ✅ 必须 |
| Desktop Editors（内嵌 web） | AppImage / DMG 内部 | ❌ 完全离线 |

---

## 结论与建议

### 已成功的部分

**x2t WASM 升级（✅ 可保留）：**
- 版本：7.5.0 → 9.3.0+0
- wasm 体积：55MB → 34MB（-38%）
- 代码修复：`document-converter.ts` 改用绝对 URL 加载脚本

**Vite 插件（✅ 可保留，用于未来升级）：**
- `onlyofficeVersionRewrite`：处理版本哈希前缀路径重写
- 对当前 7.5.0 无副作用

### 需要回滚的部分

**sdkjs 和 web-apps（❌ 需回滚到 7.5.0）：**
- Docker 9.3.0 版本无法离线使用
- 正确路径：从 Desktop Editors 9.3.0 的安装包中提取

### 未来升级的正确路径

要获得 9.3.0 的 Desktop Editors 离线文件，可行方案：

1. **从 Desktop App 提取**
   ```bash
   # Linux AppImage
   ./ONLYOFFICE_DesktopEditors-x86_64.AppImage --appimage-extract
   # 文件在 squashfs-root/opt/onlyoffice/desktopeditors/
   ```

2. **检查是否有独立分发**
   - 查看 `ONLYOFFICE/desktop-sdk` 仓库的 release artifacts
   - 查看 `ONLYOFFICE/web-apps` 是否有 offline build CI 产物

3. **对比两种构建的关键差异**
   - Desktop 版 `app.js` 应是单一完整包（类似 7.5.0 的 5.2MB）
   - 不应有 `code.js` 动态加载机制
   - socket.io 应为可选而非必须

### 当前建议

在找到正确的 9.3.0 Desktop 离线文件之前：
- 在 `upgrade/onlyoffice-9.3.0` 分支回滚 sdkjs 和 web-apps
- 只合并 x2t WASM 升级 + `document-converter.ts` 修复
- Agent 阶段零（Plugin API 验证）先在 7.5.0 上进行，验证基础可行性

---

## 相关文件变更

```
修改（保留）：
  lib/document-converter.ts    # absolutePath 修复
  vite.config.ts               # onlyofficeVersionRewrite 插件

需回滚：
  public/sdkjs/                # 从 9.3.0 Docker → 恢复 7.5.0
  public/web-apps/             # 从 9.3.0 Docker → 恢复 7.5.0

保留：
  public/wasm/x2t/             # 9.3.0+0（cryptpad 构建）
```
