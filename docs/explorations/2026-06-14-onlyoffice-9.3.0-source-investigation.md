# OnlyOffice 9.x 升级路径终极调查

**日期：** 2026-06-14  
**分支：** `upgrade/onlyoffice-9.3.0`  
**状态：** 🔄 更新中 — 架构分析有重要修正，Desktop tarball 路径可能可行

---

## 调查背景

[上一篇文档](./2026-05-31-onlyoffice-9.3.0-upgrade.md)确认：
- Docker `documentserver:9.3.0` 无法离线（当时误认为 code.js 需服务器 — **此结论已修正，见下**）
- Desktop Mode Mock 卡在 `Ec.Ms` 初始化，放弃（当时使用的是 Docker 构建的 sdkjs，非 Desktop 构建）
- 推测 Desktop Editors 安装包可能包含离线构建

本篇记录对以下来源的逐一验证，以及对 `build_tools` 构建流程和 JS 包内部结构的深度研究。

---

## 验证结果：所有 9.x 来源均为服务端架构

### 测试 1：macOS Desktop Editors 9.4（ONLYOFFICE-arm.dmg）

```
路径：/Volumes/ONLYOFFICE/ONLYOFFICE.app/Contents/Resources/editors/
app.js：  2.1MB
code.js： 存在 ✅ → 服务端架构
版本：    9.4.0-{{HASH_POSTFIX}}
```

### 测试 2：Linux Desktop Editors 9.3.0（官方 GitHub Release tarball）

```
来源：https://github.com/ONLYOFFICE/DesktopEditors/releases/download/v9.3.0/
      onlyoffice-desktopeditors-x64.tar.xz（250MB）
路径：opt/onlyoffice/desktopeditors/editors/web-apps/apps/documenteditor/main/
app.js：  2.1MB
code.js： 存在 ✅ → 服务端架构
```

### 汇总对比

| 来源 | 版本 | app.js | code.js | 直接可用 |
|------|------|--------|---------|------|
| Docker `documentserver:9.3.0` | 9.3.0 | 2.1MB | ✅ | ❌（需服务器）|
| macOS Desktop Editors DMG | 9.4.0 | 2.1MB | ✅ | ❌（需 native bridge）|
| Linux Desktop Editors tarball | 9.3.0 | 2.1MB | ✅ | ❌（需 native bridge）|
| **main 分支（build:1）** | **7.4.1** | **5.2MB** | **❌** | **✅（独立离线）** |

> ⚠️ **重要修正**：`code.js` 存在并不等于「需要服务器」。
> 详细分析见下方「JS 包内部架构深度分析」章节。

---

## JS 包内部架构深度分析（重要修正）

### 方法

对 Linux Desktop Editors 9.3.0 tarball 中的每个 JS 文件进行关键词扫描，确认 socket.io 的实际位置。

```
tar -xJOf tarball.tar.xz "path/to/file.js" > /tmp/file.js
python3 -c "d=open('/tmp/file.js',errors='replace').read(); print(d.count('keyword'))"
```

### 各文件关键词分布（9.3.0 Desktop tarball）

| 文件 | 大小 | `socket` | `authChanges` | `io.connect` | `AscDesktopEditor` | `nativeOpenFile` |
|------|------|----------|---------------|--------------|-------------------|-----------------|
| `web-apps/.../app.js` | 2.1MB | 4 | 0 | 0 | 4 | 0 |
| `web-apps/.../code.js` | 1.1MB | **0** | **0** | **0** | **0** | **0** |
| `sdkjs/word/sdk-all-min.js` | 1.2MB | 7 | 2 | 0 | **202** | **2** |

### 结论：socket.io 在 `sdk-all-min.js`，`code.js` 与网络无关

- **`app.js`（UI 外壳）**：仅包含 RequireJS 路径配置，定义 `socketio` 路径为 `"../vendor/socketio/socket.io.min"`，但无任何 `io.connect` 或实际建连代码。
- **`code.js`（UI 对话框/工具栏懒加载包）**：完全没有 socket、网络或服务器相关代码。`code.js` 是纯 UI 组件懒加载优化，与服务端通信无关。
- **`sdk-all-min.js`（渲染引擎核心）**：socket.io 协议实现在这里。同时也有 **202 个** `AscDesktopEditor` 引用，说明渲染引擎有完整的 Desktop 模式分支。

### Desktop 模式的执行路径（绕过 socket.io）

当 `window.AscDesktopEditor` 存在时，`sdk-all-min.js` 取完全不同的代码路径：

```
[index.html 检测到 window.AscDesktopEditor]
  → desktop.execCommand("webapps:entry", features)  ← 通知 C++ 侧准备文件
  → C++ 侧调用 docs_api.asc_nativeOpenFile(fileData)
  → nativeOpenFile() {
        this.jre();  ← 创建 AscCommonWord.e2 渲染引擎（存入 ta.Ga）
        this.T_f(N) 或 wKa.wt(N)  ← 加载文档数据
    }
  → 渲染管线启动（通过 ta.Ga，不经过 socket.io）
```

`nativeOpenFile` 的实现（从 `sdk-all-min.js` 提取）：
```javascript
asc_nativeOpenFile = function(N, ba) {
    this.ta.U3 = false;
    this.ta.Tm();
    this.jre();  // 创建渲染引擎，存入 this.ta.Ga（非 Ec.Ms）
    this.DocumentType = 2;
    (this.OOa = this.asc_isSupportFeature("ooxml") && AscCommon.cac(N))
        ? this.T_f(N)  // 加载 OOXML 格式
        : (new AscCommonWord.wKa(this.ta.Ga, {})).wt(N);  // 备用格式
}
```

### 对之前「Desktop Mode Mock 失败」的重新解释

[Desktop Mode Mock 文档](./2026-05-31-onlyoffice-desktop-mode-mock.md) 记录的失败原因是「`Ec.Ms` 未初始化，画布黑屏」。现在可以确认失败的真实原因：

1. **使用了错误的文件**：当时 mock 使用的是 Docker `documentserver` 的 sdkjs（服务端构建），该版本没有正确实现 Desktop 模式代码路径。
2. **从未调用 `nativeOpenFile`**：mock 只是注入了 `window.AscDesktopEditor`，但没有在初始化完成后调用 `docs_api.asc_nativeOpenFile(data)` 传入实际文档数据。
3. **`Ec.Ms` vs `ta.Ga`**：`Ec.Ms` 是 PDF viewer 路径（`qYg()` → `AscCommon.Xxh`），Word 编辑器路径是 `ta.Ga`（`jre()` → `AscCommonWord.e2`）。检查 `Ec.Ms` 是对 Word 文档的错误预期。

---

## build_tools 构建流程研究

### 仓库结构

```
ONLYOFFICE/build_tools
  configure.py          # 解析 CLI 参数，生成配置文件
  make.py               # 顶层构建编排
  tools/linux/
    automate.py         # Linux 构建入口
    deps.py             # 依赖下载（Node.js、Qt 等）
  scripts/
    build_js.py         # JS-only 构建逻辑
    deploy_desktop.py   # 桌面打包
  Dockerfile            # Docker 构建支持（Ubuntu 24.04）
```

### `--desktop` flag 在 9.x 的实际作用

经过验证，`--desktop` 在 9.x 的作用已与 7.x 时期**不同**：

**7.x 时期（产出离线单体包）：**
- `index.html.desktop` 替换 `index.html`，去掉 socket.io 运行时依赖
- requirejs optimizer 将所有模块合并为单体 `app.js`（~5MB）
- 无 `code.js`

**9.x 时期（Desktop App 内嵌服务器，但 sdkjs 有 Desktop 绕过路径）：**
- Desktop App 内嵌 Node.js，启动本地 Document Server
- `--desktop` 切换连接目标（localhost 而非远程服务器）
- sdkjs 同时包含两条路径：① socket.io 服务端路径（默认）② AscDesktopEditor 路径（202 个引用，绕过 socket.io）
- `code.js` 本身无网络代码（0 socket 引用）— 是纯 UI 懒加载包

### 完整构建命令（仅供参考，预期产出仍含 code.js）

```bash
# 全量构建（含 C++，需 2-4 小时）
git clone https://github.com/ONLYOFFICE/build_tools.git
cd build_tools/tools/linux
python3 ./automate.py desktop --branch v9.3.0.140

# JS-only 构建（无需 C++，仍预期产出 code.js）
git clone --branch v9.3.0.140 https://github.com/ONLYOFFICE/sdkjs.git
git clone --branch v9.3.0.140 https://github.com/ONLYOFFICE/web-apps.git

cd sdkjs/build && python3 build.py --desktop
cd web-apps/build && npm install && grunt --desktop default
```

构建产出路径：
- `web-apps/deploy/web-apps/`
- `sdkjs/deploy/sdkjs/`

> ⚠️ **注意**：基于 Linux tarball 的验证，预期编译产出与官方发布一致，仍含 `code.js`。
> 除非找到明确的 "standalone/offline" 构建 target，否则编译路径意义有限。

### 7.5 build:1 的真实来源

main 分支中 `app.js` 版本注释为 `7.4.1 (build:1)`，官方从未使用 `build:1` 这一编译号。
推测该文件由项目早期维护者**手动编译**，使用了彼时（7.x 时代）的 `--desktop` standalone 模式。
该模式在 8.x 时期随架构变迁被废弃。

---

## 架构变迁时间线

```
OnlyOffice ≤7.x（某版本，已知 7.4.1 build:1 可用）
  └── 纯前端单体包架构
        app.js ~5MB（单体，含完整渲染引擎），无 code.js
        socket.io：requirejs path 中有，但 Desktop 构建中 "empty:"（不加载）
        Desktop App = 浏览器内嵌 + 独立渲染引擎，纯离线

OnlyOffice 8.2.0+ 到 9.x
  └── 拆分包架构（2024-10-21 引入 code.js，commit c860ceec）
        app.js ~2MB（UI 外壳）+ code.js ~1MB（UI 对话框懒加载，非网络相关）
        sdk-all-min.js：含 socket.io 协议 AND AscDesktopEditor 分支（202 个引用）
        Desktop App = 内嵌 Node.js Document Server（服务端模式）
                      OR 用 AscDesktopEditor mock 绕过（需正确实现，理论可行）
```

**最后一个纯前端单体包版本：** 据 sdkjs GitHub commit 分析，`v8.1.1`（2024-07-17）是最后一个无 `code.js` 的版本。此后 `v8.2.0`（2024-10-21）引入拆分包架构。

---

## 当前可行路径

### 路径 A：维持 7.5.0（立即可行，推荐）

- 回滚 `public/sdkjs` 和 `public/web-apps` 到 main 的 7.5 版本
- 保留 x2t WASM 9.3.0 升级（独立可用）
- 保留 `src/lib/document-converter.ts` absolutePath 修复

### 路径 B：实现最小 socket.io 协议服务（技术攻坚）

在 Vite dev server 旁边运行一个 tiny Node.js 服务，使用 Docker 镜像的 sdkjs（服务端构建），实现够用的 OnlyOffice 协议子集：

```
目标协议流程（使用 Docker 服务端 sdkjs）：
  1. socket.io 握手（EIO4 handshake）
  2. 服务端发送 authChanges 响应
  3. code.js 被加载（纯 UI，无需服务器即可完成）
  4. 渲染引擎通过服务端协议路径初始化
  5. 文档渲染管线启动
```

参考：
- `ONLYOFFICE/server`（开源，MIT）— 协议实现参考

### 路径 C：升级到 v8.1.1（最后一个无 code.js 版本）

据 sdkjs commit 分析，`v8.1.1`（2024-07-17）是最后一个无 `code.js` 的版本（app.js 仍为单体包），理论上沿用 7.x 的离线架构。

**操作步骤：**
1. 从 GitHub Release 下载 Linux Desktop Editors v8.1.1 tarball
2. 确认 `app.js` 大小（预期 ~5MB）且无 `code.js`
3. 提取 `web-apps/` 和 `sdkjs/` 目录替换 `public/`

**风险：** 未经验证，需实际下载确认。

### 路径 D：Desktop tarball + 正确 AscDesktopEditor Mock（重新评估）

之前 Desktop Mode Mock 失败是因为：① 使用了 Docker 服务端 sdkjs（非 Desktop 版），② 从未实际传入文档数据。

**使用 Desktop tarball 的正确 mock 流程：**

```typescript
// 1. 注入 AscDesktopEditor mock
window.AscDesktopEditor = {
    execCommand: (cmd: string, param: string) => {
        if (cmd === "webapps:entry") {
            // webapps:entry = 编辑器就绪，等待文件
            initDocumentAfterReady();
        }
    },
    // ... 其他 Desktop API
};

// 2. 等待 docs_api 初始化完成后，用 x2t WASM 转换文件并传入
async function initDocumentAfterReady() {
    const fileData = await x2tConvert(userFile);  // ArrayBuffer
    const docsApi = window.DocsAPI.DocEditor.instances["editor"];
    docsApi.asc_nativeOpenFile(new Uint8Array(fileData));
}
```

**使用的文件来源：** Linux Desktop Editors 9.3.0 tarball（非 Docker 镜像），因为 Desktop tarball 的 sdkjs 才有完整的 AscDesktopEditor 代码路径（202 个引用）。

**预期渲染路径：** `nativeOpenFile` → `jre()` → `AscCommonWord.e2`（存入 `ta.Ga`）→ 画布渲染。

**尚未验证：** 此路径仅基于代码分析推断，需实际测试。

---

## 相关文档

- [升级探索总览](./2026-05-31-onlyoffice-9.3.0-upgrade.md)
- [Desktop Mode Mock 详细记录](./2026-05-31-onlyoffice-desktop-mode-mock.md)
- [离线能力架构对比](./2026-06-07-offline-architecture-comparison.md)
