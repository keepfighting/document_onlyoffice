# 9.3.0 Desktop Mock 调试记录

**日期：** 2026-06-14
**分支：** `explore/path-d-desktop-mock`（基于 `upgrade/onlyoffice-9.3.0`）
**状态：** 🔴 进行中 — 已定位根因，下一步明确

---

## 问题描述

点击 "New Word" → 编辑器 iframe 打开、灰色骨架屏可见，但弹出错误：

> **An error has occurred while opening the file.**
> **The file content does not match the file extension.**

对应 `Asc.c_oAscError.ID.ConvertationOpenFormat` → `errorInconsistentExt`。

---

## 已完成的修复（生效）

### 1. MOa patch ✅

**文件：** `vite.config.ts` → `CreateEditorApi`

```javascript
try {
  if (window.AscCommon && window.AscCommon.r3) {
    window.AscCommon.r3.prototype.MOa = function() { return true; };
    log('MOa patched → BRj path active');
  }
} catch(e) { log('MOa patch err', e.message || String(e)); }
```

**作用：** 强制 `Shc` 走 `BRj`（server-mode path），跳过 Desktop 模式的循环。
**验证：** Console 出现 `[DE] MOa patched → BRj path active` ✓

**背景：** 9.3.0 sdkjs 在 `sdk-all.js:19057` 有 Desktop 模式覆写：
```javascript
AscCommon.r3.prototype.BRj = AscCommon.r3.prototype.Shc;  // 保存原版
AscCommon.r3.prototype.Shc = function(d) {
    if (this.MOa() || !a.AscDesktopEditor) return this.BRj(d);
    // Desktop 模式：忽略 d，只调 LocalStartOpen() → 循环
    this.tma && this.Qk && this.Gig() && (
        this.b_("asc_onDocumentContentReady", ...),
        a.AscDesktopEditor.LocalStartOpen()
    );
};
```

### 2. DOCY string 解码 ✅

**文件：** `src/lib/onlyoffice-editor.ts` → `createEditorInstance`

```typescript
} else if (typeof binData === 'string' && binData.includes(';')) {
  // DOCY/XLSY string format: 'DOCY;v5;{byteLen};{base64data}'
  const base64 = binData.split(';').slice(3).join(';');
  const binaryStr = atob(base64);
  src = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    src[i] = binaryStr.charCodeAt(i);
  }
}
```

**验证：** `bin=7372` 出现在 console ✓（不再是 0）

---

## 当前错误根因分析

### `asc_openDocumentFromBytes` 内部流程（sdk-all-min.js:1611）

```javascript
d.prototype.r1i = function(r) {  // r1i = asc_openDocumentFromBytes
    var t = new AscCommon.WYc;
    t.data = r;
    t.PQb = AscCommon.a9c(t.data, AscCommon.SHa.xH);  // 关键
    this.Shc(t)
};
```

### `a9c` 函数（sdk-all-min.js:959 附近，runtime 验证）

```javascript
function a9c(pa, Za) {
    // pa = data (Uint8Array or string)
    // Za = "DOCY" (AscCommon.SHa.xH)
    if (pa.length > Za.length) {
        for (var fb = 0; fb < Za.length; ++fb)
            if (pa[fb] !== Za.charCodeAt(fb))  // 比较 pa[i] (number) vs charCode (number)
                return false;
        return true;
    }
    return false;
}
```

**判断逻辑：**
- 如果 `data` 是以 DOCY bytes `[68,79,67,89]` 开头的 Uint8Array → `PQb = true`
- 否则（包括 DOCY 字符串 / 其他格式的 bytes）→ `PQb = false`

**关键发现：字符串 vs Uint8Array 的区别：**
- `'DOCY;...'[0]` = `'D'`（字符），`'DOCY'.charCodeAt(0)` = `68`（数字）
- `'D' !== 68` → **返回 false**（字符串无法通过 a9c）
- `Uint8Array([68,79,67,89,...])[0]` = `68`（数字）
- `68 === 68` → **可能返回 true**（如果 bytes 以 DOCY magic 开头）

### `lHg()` 函数（runtime 验证）

- `AscCommon.lHg()` 返回**字符串**（type: "string"）
- 这是 server 模式的空文档模板，格式是 DOCY 字符串 `'DOCY;v5;...'`
- `mjg()` 调用 `Shc(wyc)` 其中 `wyc.data = lHg()` = DOCY 字符串，`wyc.PQb = false`
- → **BRj 知道如何处理 `PQb=false` 且 `data` 是 DOCY 字符串的情况**

### 当前失败原因

我们的 `pendingCopy`（7372 bytes）= `empty_bin.ts` 中 DOCY 字符串的 base64 解码结果。

问题：这 7372 bytes 是 **7.4.1 时代的 DOCY 二进制容器格式**，不是：
1. 以 DOCY magic bytes `[68,79,67,89]` 开头的 9.3.0 DOCY 二进制
2. 也不是原始 ZIP（docx 格式，`[0x50, 0x4B, ...]`）

9.3.0 sdkjs 的 `BRj` 无法识别 7.4.1 DOCY 二进制 → 触发 `ConvertationOpenFormat` 错误。

---

## 下一步修复方案

### 方案 A：直接传 DOCY 字符串给 `asc_openDocumentFromBytes` ⭐推荐

**思路：** `lHg()` 返回 DOCY 字符串 → `mjg()` 用字符串调 `Shc` → `BRj` 处理字符串。
所以 `BRj` 本来就支持 DOCY 字符串作为输入！

**实现：** 在 `onAppReady` 中通过 iframe.contentWindow 访问 `__desktopApi`，
直接调用 `api.asc_openDocumentFromBytes(docyString)`（传字符串，不是 bytes）：

```typescript
onAppReady: () => {
    const iframeEl = document.querySelector('iframe') as HTMLIFrameElement | null;
    const api = (iframeEl?.contentWindow as any)?.__desktopApi;
    if (api && typeof api.asc_openDocumentFromBytes === 'function') {
        if (typeof binData === 'string') {
            // 新文档：直接传 DOCY 字符串
            api.asc_openDocumentFromBytes(binData);
        } else if (pendingCopy.byteLength > 0) {
            // 已有文档（从 x2t 得到的 bytes）
            api.asc_openDocumentFromBytes(pendingCopy);
        }
    }
}
```

**前提：** `__desktopApi` 已通过 `CreateEditorApi` 赋值，且 `document.querySelector('iframe')` 可用。

**runtime 验证（已确认）：**
- `document.querySelector('iframe')` → 存在（在 `#app` 内，非 `#iframe`）
- `iframeEl.contentWindow.__desktopApi` → 存在，`hasAscOpen: true`
- `window.__pendingBinary.byteLength` = 0 → 说明 `onAppReady` 已调用 `openDocument(pendingCopy)` 导致 buffer 被 transfer（当前代码走的是 fallback 的 binary 路径）

**需要修复：** 当前代码用 `document.getElementById('iframe')` 找不到（返回 null），
导致走到 `editorAny.openDocument(pendingCopy)` fallback，传了 binary bytes 而非字符串。

**修复代码（onlyoffice-editor.ts 的 onAppReady）：**

```typescript
onAppReady: () => {
    if (mediaUrls) {
        window.editor?.sendCommand({ command: 'asc_setImageUrls', data: { urls: mediaUrls } });
    }
    const editorAny = window.editor as any;
    if (typeof editorAny?.openDocument === 'function') {
        // 9.3.0: 直接通过 iframe 访问 __desktopApi，传 DOCY 字符串（非 binary）
        // BRj 原生支持 DOCY 字符串（lHg() → mjg() → Shc() 就走这条路）
        const iframeEl = document.querySelector('iframe') as HTMLIFrameElement | null;
        const api = (iframeEl?.contentWindow as any)?.__desktopApi;
        if (api && typeof api.asc_openDocumentFromBytes === 'function') {
            if (typeof binData === 'string') {
                api.asc_openDocumentFromBytes(binData);  // DOCY string for new docs
            } else if (pendingCopy.byteLength > 0) {
                api.asc_openDocumentFromBytes(pendingCopy);  // bytes for existing docs
            }
        }
    } else {
        // 7.4.1 server 模式 fallback
        window.editor?.sendCommand({ command: 'asc_openDocument', data: { buf: binData } });
    }
},
```

### 方案 B：用 9.3.0 x2t 重新生成 empty_bin.ts

**思路：** 从 9.3.0 x2t WASM 生成空 .docx/.xlsx/.pptx 的 DOCY binary，更新 `empty_bin.ts`。

**复杂度：** 需要使用 x2t API 将一个最小空 docx 转换，捕获输出，base64 编码，构造新的 DOCY 字符串。
**用途：** 解决已有文档（BlobPart）路径中，bytes 格式不兼容 9.3.0 的问题。

---

## 已验证的调试信息

| 项目 | 状态 |
|------|------|
| `[DE] MOa patched → BRj path active` 出现 | ✅ |
| `[DE] CreateEditorApi` 出现 | ✅ |
| `[DE] SetDocumentName | New_Document.docx` 出现 | ✅ |
| `[DE] editor:onready` 出现 | ✅ |
| `pendingBinaryLen = 0`（buffer 被 transfer） | ✅ onAppReady 已触发 |
| `document.querySelector('iframe')` 返回非 null | ✅ |
| `__desktopApi.asc_openDocumentFromBytes` 是函数 | ✅ |
| `window.editor.openDocument` 存在 | ✅ 9.3.0 确认 |
| `document.getElementById('iframe')` 返回 **null** | ❌ 选择器错误！ |

---

## 关键 API 差异：7.4.1 vs 9.3.0

| 项目 | 7.4.1 | 9.3.0 |
|------|-------|-------|
| `window.editor` 方法 | `sendCommand` | `openDocument` |
| `sendCommand` 是否存在 | ✅ | ❌（silent no-op） |
| `openDocument` 是否存在 | ❌ | ✅（= `_openDocumentFromBinary`） |
| 文档传输格式（new doc） | DOCY 字符串 via sendCommand | 待确认：DOCY 字符串 via `asc_openDocumentFromBytes` 直调 |
| `BRj` 接受的数据 | WYc.data = DOCY 字符串 | WYc.data = DOCY 字符串（lHg()）/ DOCY bytes（以 D-O-C-Y 开头）|

---

## 文件修改记录

### `vite.config.ts`
- `execCommand` 简化为 no-op（移除 editor:onready fallback）
- `CreateEditorApi` 新增 `MOa` patch
- `LocalStartOpen` 改为 no-op（MOa=true 后不再被调用）

### `src/lib/onlyoffice-editor.ts`
- `createEditorInstance` 新增 DOCY string → Uint8Array 解码
- `onAppReady` 改为尝试 `getElementById('iframe') + querySelector('iframe')` 访问 `__desktopApi`
  - **BUG：** `getElementById('iframe')` 返回 null，导致走 fallback binary 路径
  - **NEXT：** 改为 `document.querySelector('iframe')` 直接访问

---

## 下一步操作

1. **立即修复：** 将 `onAppReady` 中的 `document.getElementById('iframe')?.querySelector('iframe')` 改为 `document.querySelector('iframe')`
2. **测试：** 重载页面，点击 New Word，观察是否出现错误
3. **如果通过：** 测试已有文档打开（x2t 路径）
4. **如果失败：** 检查 `BRj` 接受 DOCY 字符串的假设是否成立（通过 runtime evaluate）
