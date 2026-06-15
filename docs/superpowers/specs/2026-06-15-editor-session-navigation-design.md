# Editor Session Navigation Design

**Date:** 2026-06-15  
**Scope:** Current 7.x-based branch with SEO pages and a unified local document workbench  
**Status:** Proposed design

## Problem

The current app uses `http://localhost:4173/` as a unified workbench. Users can create or open any supported document from that route. After a document opens, the workbench is hidden and the OnlyOffice iframe becomes the primary UI.

The browser URL does not represent this transition. The app is visually in an editor state, but the history stack still treats the page as the original workbench page. As a result:

- Browser Back does not first return from the editor to the workbench.
- Failed or empty opens can leave the page in a hidden-workbench state.
- Users need a clear way to close the current document and get back to the file picker/new-document entry.
- SEO landing pages and the local editor runtime are mixed in one page without a formal session boundary.

## Industry Pattern

The best-practice pattern for this class of app is a **stateful editor session inside the current workspace route**.

Examples in mature web apps:

- File managers and web IDEs keep the user in a workspace, then open files as stateful panels or tabs.
- Editors such as document tools treat browser Back as “leave the current editing surface” before leaving the product shell.
- Modal/detail routes often add a history entry when opened, then close on `popstate`.

For this project, the equivalent is:

- `/` remains the canonical workbench route.
- Opening a file or creating a document enters an editor session.
- The editor session gets a lightweight history entry such as `/#editor`.
- Browser Back closes the editor session and restores `/`.
- A visible “Back to workbench” command performs the same close action.

The URL should not contain local file names, file paths, object URLs, or document content. This preserves the app’s privacy model.

## Considered Options

### Option A: Hash-backed editor session on the current route

Use `history.pushState({ editorOpen: true }, '', '#editor')` when an editor opens. Listen for `popstate`; if the editor is open, close the editor and restore the workbench.

Pros:

- Smallest change to the current architecture.
- Works on `/`, preview ports, deployed root pages, and SEO landing pages.
- Browser Back matches user expectations.
- No server routing or Vite fallback changes.
- Does not expose file identity in the URL.

Cons:

- The URL does not deep-link to a specific document, by design.
- Requires careful guarding so `#editor` does not auto-open anything on reload.

### Option B: Dedicated `/editor/` route

Navigate to `/editor/` or `/editor/#session` when opening a document. Return to `/` on close.

Pros:

- Very explicit route model.
- Easier to add future editor-only layout and analytics.

Cons:

- Requires route fallback/deployment work.
- Requires return URL handling for `/docx-editor/`, `/zh-cn/`, embed mode, and `?src=`.
- For local files, `/editor/` cannot restore the document after reload anyway.
- Larger change than the current problem needs.

### Option C: No history state, only a close button

Add a “Back to workbench” button that destroys the editor and shows the workbench.

Pros:

- Fastest to implement.
- Useful as a fallback control.

Cons:

- Browser Back remains broken.
- Mobile users and keyboard/browser-navigation users still hit the same trap.

## Recommendation

Use **Option A: hash-backed editor session**, plus an explicit close command.

This is the best fit because the app is privacy-first and local-file based. Local files cannot be restored from URL state, so a full document route would create false expectations. A lightweight `#editor` session accurately models the UI state without implying persistence.

## User Experience

### Normal Open

1. User lands on `/`.
2. User clicks “View/Edit Document” or creates a new document.
3. App enters an `opening` state and shows loading.
4. When the OnlyOffice editor is created successfully, the app enters `editing`.
5. URL becomes `/#editor`.
6. Workbench is hidden; editor and editor controls are visible.

### Browser Back

1. User presses browser Back while editing.
2. App intercepts the `popstate` associated with the editor session.
3. App closes the editor session.
4. URL returns to `/`.
5. Workbench is shown.
6. A second browser Back leaves the app as normal.

### Explicit Close

The editor UI should expose a clear command:

- English: `Back to workbench`
- Chinese: `返回工作台`

This command runs the same close flow as browser Back. It should be available from the floating menu or a small editor top bar.

### Failed Open

If opening or conversion fails:

- Destroy any partially created editor.
- Clear `#iframe`.
- Show the workbench.
- Remove editor UI state and `#editor`.
- Show the existing error message.

The user must never be left on a blank editor surface with no way back.

## Editor Shell UX

After a file is opened or a new document is created, the product should not leave the user alone inside the OnlyOffice iframe. The app needs an outer editor shell that explains the session and provides product-level actions.

The shell should answer three questions at all times:

- Where am I?
- What document am I editing?
- How do I save or return?

### Required Shell Controls

Show a lightweight fixed control area while editing. It can be a compact top bar or an expanded section in the existing floating menu. It must include:

- `Back to workbench` / `返回工作台`
- Current file name, for example `New_Document.docx` or the uploaded file name
- Save action
- Optional save state, once reliable dirty-state tracking exists

The close/back command must call the same `closeEditorSession()` flow used by browser Back.

### New Document Flow

When the user creates a new Word, Excel, or PowerPoint document:

1. Enter `opening`.
2. Create the empty document through the existing OnlyOffice 7.x flow.
3. On success, enter `editing` and push the `#editor` history entry.
4. Display the generated file name, such as `New_Document.docx`.
5. The primary save action downloads the new file to the user’s device.

Recommended labels:

- English: `Save`
- Chinese: `保存到本地`

If the app later supports naming before first save, use a simple default such as `Untitled document.docx`, but do not block editing on a naming dialog.

### Open Local File Flow

When the user opens a local file:

1. Keep the original file name visible in the shell.
2. Treat browser save as “download an edited copy” unless File System Access API support is explicitly added.
3. Avoid implying that the browser silently overwrites the original local file.

Recommended labels:

- English: `Save copy`
- Chinese: `下载副本`

Future enhancement:

- On Chromium browsers, optionally use the File System Access API to save back to the original file handle.
- On unsupported browsers, keep the download-copy behavior.
- The UI must clearly distinguish `Save to original file` from `Download copy`.

### Save State

The first implementation should avoid a dirty-document warning unless modification tracking is reliable.

Once reliable dirty state exists:

- Show `Unsaved changes` / `有未保存更改` after edits.
- Clear the state after a successful save/download.
- If the user closes with unsaved changes, show a confirmation:
  - `Save`
  - `Discard`
  - `Cancel`

Until then, closing should be immediate and predictable. A false or noisy unsaved-warning prompt is worse than no prompt.

### Open Failure Flow

Opening failures must always return the user to the workbench.

Failure handling:

1. Destroy any partially initialized editor.
2. Clear `#iframe`.
3. Remove editor session state.
4. Normalize URL back from `#editor` if needed.
5. Show the workbench.
6. Show a human-readable error.

Recommended wrapper message:

```text
This file could not be opened. It may be empty, damaged, or have the wrong extension.
```

Chinese:

```text
该文件无法打开，可能为空、损坏，或扩展名与内容不一致。
```

OnlyOffice’s raw HTML error can be kept in developer logs, but the user-facing message should be concise and actionable.

### Reload While Editing

Reloading an editor session should not try to restore local files.

On `/#editor` reload:

- Return to the workbench.
- Remove `#editor`.
- Optionally show a non-blocking notice that local editing sessions cannot be restored after refresh.

This behavior is more honest than showing a broken editor with no access to the previous local file bytes.

## State Model

Use a small finite state model:

```text
idle -> opening -> editing -> closing -> idle
idle -> opening -> error -> idle
editing -> error -> idle
```

Definitions:

- `idle`: workbench visible, no active editor.
- `opening`: loading/conversion/editor initialization in progress.
- `editing`: editor iframe active and workbench hidden.
- `closing`: editor teardown in progress.
- `error`: transient state used to restore UI after failure.

Only `editing` should own a browser history entry.

## Proposed Module

Create a dedicated module:

```text
src/lib/editor-session.ts
```

Responsibilities:

- Track whether an editor session is open.
- Add the `#editor` history entry after successful open.
- Close editor on browser Back.
- Provide a shared close function for UI buttons.
- Avoid duplicate history entries if the user opens another document while already editing.
- Restore the workbench after open failures.

Suggested API:

```ts
type EditorSessionCallbacks = {
  showWorkbench: () => void;
  hideWorkbench: () => void;
  showMenuGuide?: () => void;
};

export function initEditorSession(callbacks: EditorSessionCallbacks): void;
export function beginEditorOpening(): void;
export function commitEditorOpen(): void;
export function failEditorOpen(error?: unknown): void;
export function closeEditorSession(options?: { fromPopState?: boolean }): void;
export function isEditorSessionOpen(): boolean;
```

## Integration Points

### `src/index.ts`

Initialize the session module after UI callbacks are available.

### `src/lib/document.ts`

Use session hooks around open flows:

- Before conversion/open starts: `beginEditorOpening()`
- After `handleDocumentOperation()` succeeds: `commitEditorOpen()`
- In catch blocks: `failEditorOpen(error)`

This applies to:

- `onCreateNew`
- `onOpenDocument`
- `openDocumentFromUrl`

### `src/lib/ui.ts`

Add a close command to the existing floating menu:

- Only show it while an editor is open.
- Invoke `closeEditorSession()`.

The existing `hideControlPanel()` and `showControlPanel()` remain the visual primitives. The session module coordinates when they are called.

### `src/lib/onlyoffice-editor.ts`

No opening-format changes are needed. The editor session design is independent from the 7.x document loading contract.

The close flow should call:

```ts
window.editor?.destroyEditor();
window.editor = undefined;
document.getElementById('iframe')?.replaceChildren();
```

## History Rules

1. Do not push history before the document is actually open.
2. Push one editor entry when entering `editing`:

   ```ts
   history.pushState({ editorOpen: true }, '', '#editor');
   ```

3. If URL already has `#editor`, do not push a duplicate.
4. When closing from a UI button, call `history.back()` if the current history state is the editor state; the `popstate` handler performs the close.
5. If history state is not the editor state, close directly and normalize with:

   ```ts
   history.replaceState({}, '', location.pathname + location.search);
   ```

6. On app startup, if the URL is `#editor` but no editor exists, normalize back to the workbench URL.

## Dirty Document Handling

The first implementation can close immediately because current local save state is not yet modeled as a dirty flag.

Future enhancement:

- Track document modification through OnlyOffice events.
- If dirty, show a native-style confirmation:
  - `Save`
  - `Discard`
  - `Cancel`

This should be added only when save state is reliable. A weak dirty prompt is worse than no prompt because it trains users to ignore warnings.

## Embed Mode

Embed mode should not own browser Back inside the iframe unless explicitly requested by the parent application.

For `?embed=1` or cross-window iframe mode:

- Do not push `#editor`.
- Let the parent application own navigation.
- Still expose internal cleanup for `document:close` or future parent-controlled APIs.

## Accessibility

- The close command must be keyboard reachable.
- The button label should be text, not only an icon.
- On close, focus should return to the primary workbench action, likely `View/Edit Document`.
- Browser Back should not trap the user in a loop.

## Error Handling

Every open path must use the same restoration behavior:

```text
try open
  commitEditorOpen()
catch
  failEditorOpen(error)
  show error
finally
  remove loading
```

`failEditorOpen()` must be idempotent. It should be safe to call even if the editor was never created.

## Testing Strategy

Unit tests:

- `commitEditorOpen()` pushes one `#editor` entry.
- `closeEditorSession()` destroys editor, clears iframe, and shows workbench.
- `popstate` while editing closes the editor.
- Failed open restores the workbench and does not leave `#editor`.
- Starting at `/#editor` without an editor normalizes to `/`.
- Embed mode does not push history.

Integration/manual checks:

- From `http://localhost:4173/`, create a new Word document, then browser Back returns to the workbench.
- Open a local DOCX, then browser Back returns to the workbench.
- Canceling the file picker does not change history.
- Opening a broken/empty file restores the workbench.
- Pressing Back again after returning to the workbench leaves the app normally.

## Migration Plan

1. Add `editor-session.ts` with state and history handling.
2. Wire session initialization from `src/index.ts`.
3. Wrap all document open paths in begin/commit/fail calls.
4. Add the explicit “Back to workbench” menu command.
5. Add focused unit tests.
6. Manually verify in local preview at `http://localhost:4173/`.

## Non-Goals

- Do not introduce a dedicated `/editor/` route yet.
- Do not encode local file names or object URLs in the URL.
- Do not attempt to restore local files after refresh.
- Do not change the OnlyOffice 7.x document loading contract.
- Do not mix this with the 9.3 upgrade exploration.

## Decision

The app should treat document editing as a local, temporary editor session inside the current workbench route. The browser history should represent the session boundary, not the document identity.

This solves the current “cannot return” problem while preserving SEO pages, local privacy, and the existing 7.x opening/rendering logic.

## Implementation Update

Implemented on 2026-06-15 for the current 7.x branch.

Files:

- `src/lib/editor-session.ts`
- `src/lib/document.ts`
- `src/index.ts`
- `src/lib/ui.ts`
- `src/lib/i18n.ts`
- `test/unit/editor-session.test.ts`

Behavior now in place:

- Opening or creating a document begins an editor session and hides the workbench.
- Successful open/create pushes `#editor` unless the app is running in embed mode.
- Browser Back closes the active editor, clears `#iframe`, resets `window.editor`, and shows the workbench.
- Browser Forward back to `#editor` restores the current in-memory document session.
- Open/create failure clears partial editor state and restores the workbench URL.
- The floating menu shows `Back to Workbench` / `返回工作台` while an editor session is active.
- `?embed=1` does not take ownership of browser history.

Forward behavior note:

- Back intentionally tears down the active editor to return memory and UI ownership to the workbench.
- Forward must not simply keep `#editor` as a dead marker. It should call the session restore callback and reopen the document from the current in-memory `docmentObj`.
- This works for the current tab lifetime. A hard refresh or a new tab still cannot restore local file handles unless a future persistence layer is added.

Verification:

- `pnpm vitest run test/unit/editor-session.test.ts test/unit/onlyoffice-editor.test.ts test/unit/i18n.test.ts`
- `pnpm run build`

Chrome MCP note:

- Chrome is installed and running.
- The Codex Chrome Extension is installed and enabled in the selected default profile.
- The native host manifest is present and valid.
- Browser-client communication still reported `Browser is not available: extension`; interactive Chrome verification was not completed in this pass.

## Router Encapsulation Update

Implemented after the initial editor-session work:

- Added `src/lib/app-router.ts` as the startup route orchestration module.
- `src/index.ts` no longer parses `?file=` / `?src=` directly.
- `src/index.ts` no longer wires `editor-session` directly.
- External startup code now calls `initAppRouter({ hideWorkbench, showWorkbench, showMenuGuide })`.
- `app-router` owns startup query handling and delegates:
  - history/session behavior to `editor-session`;
  - document open/restore behavior to `document`.

This keeps route bootstrapping centralized without turning the router into a document loading module.

## Editor Surface Overlay Update

The editor surface must not contain SEO or advertising overlays. `editor-ad-strip` was originally shown from `hideControlPanel()` when the app entered editor mode, but it is a fixed bottom element and can cover editable document content.

Current rule:

- Landing page ads may exist in landing content.
- Editor mode keeps `editor-ad-strip` hidden.
- The floating menu remains available in the editor.
- FAB positioning must not reserve space for a hidden ad strip.
