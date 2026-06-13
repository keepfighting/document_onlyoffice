# OnlyOffice 9.x 升级路径终极调查

**日期：** 2026-06-14  
**分支：** `upgrade/onlyoffice-9.3.0`  
**状态：** ❌ 无离线路径 — 9.x 全平台均为服务端架构，详见结论

---

## 调查背景

[上一篇文档](./2026-05-31-onlyoffice-9.3.0-upgrade.md)确认：
- Docker `documentserver:9.3.0` 无法离线（code.js 需服务器）
- Desktop Mode Mock 卡在 `Ec.Ms` 初始化，放弃
- 推测 Desktop Editors 安装包可能包含离线构建

本篇记录对以下来源的逐一验证，以及对 `build_tools` 构建流程的深度研究。

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

| 来源 | 版本 | app.js | code.js | 可用 |
|------|------|--------|---------|------|
| Docker `documentserver:9.3.0` | 9.3.0 | 2.1MB | ✅ | ❌ |
| macOS Desktop Editors DMG | 9.4.0 | 2.1MB | ✅ | ❌ |
| Linux Desktop Editors tarball | 9.3.0 | 2.1MB | ✅ | ❌ |
| **main 分支（build:1）** | **7.4.1** | **5.2MB** | **❌** | **✅** |

**结论：9.x 所有公开发行渠道均为服务端架构，无例外。**

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

**9.x 时期（产出连接本地服务器的前端）：**
- Desktop App 内嵌 Node.js，启动本地 Document Server
- `--desktop` 只是切换连接目标（localhost 而非远程服务器）
- 架构本质未变：仍需 `code.js`，仍依赖 socket.io 握手

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
OnlyOffice ≤7.x（某版本）
  └── 纯前端单体包架构
        app.js ~5MB，无 code.js，无 socket.io 依赖
        Desktop App = 浏览器内嵌 + 独立渲染引擎

OnlyOffice 8.x～9.x
  └── 本地服务器架构
        app.js ~2MB（UI 外壳）+ code.js ~1MB（引擎，动态加载）
        Desktop App = Electron + 内嵌 Node.js Document Server
        socket.io 握手是必须流程
```

变迁的精确版本节点尚未定位，需对 `v7.x` 到 `v8.0` 之间的 release 逐一检查。

---

## 当前可行路径

### 路径 A：维持 7.5.0（立即可行，推荐）

- 回滚 `public/sdkjs` 和 `public/web-apps` 到 main 的 7.5 版本
- 保留 x2t WASM 9.3.0 升级（独立可用）
- 保留 `src/lib/document-converter.ts` absolutePath 修复

### 路径 B：实现最小 socket.io 协议服务（技术攻坚）

在 Vite dev server 旁边运行一个 tiny Node.js 服务，实现够用的 OnlyOffice 协议子集：

```
目标协议流程：
  1. socket.io 握手（EIO4 handshake）
  2. 服务端发送 authChanges 响应
  3. code.js 被触发加载
  4. Ec.Ms（WordControl）正常初始化
  5. 文档渲染管线启动
```

参考：
- `ONLYOFFICE/server`（开源，MIT）— 协议实现参考
- Desktop Mode Mock 文档 — 已验证除 Ec.Ms 之外的所有环节

### 路径 C：定位架构变迁节点，找最后的离线版本

检查 `v7.5.x` → `v8.0.x` 之间各 tag 的 Linux tarball，找到最后一个 `code.js` 不存在的版本。
若存在 8.x 的离线版本，可尝试仅升级到该版本，搭配 9.3.0 x2t WASM。

---

## 相关文档

- [升级探索总览](./2026-05-31-onlyoffice-9.3.0-upgrade.md)
- [Desktop Mode Mock 详细记录](./2026-05-31-onlyoffice-desktop-mode-mock.md)
- [离线能力架构对比](./2026-06-07-offline-architecture-comparison.md)
