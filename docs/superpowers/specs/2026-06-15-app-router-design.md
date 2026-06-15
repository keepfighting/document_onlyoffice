# App Router Module Design

## Background

The app currently has route-related logic split across several places:

- `src/index.ts` initializes `editor-session`.
- `src/index.ts` reads `?file=` / `?src=` and opens a URL document.
- `src/lib/editor-session.ts` owns `#editor`, browser Back, browser Forward, and editor cleanup.
- `src/lib/document.ts` owns document open/create/restore operations.

This works, but the app entry now knows too much about editor session wiring and URL open behavior. The next change should make route bootstrapping a single module call.

## Goal

Create a small app router module that centralizes route bootstrapping while keeping document operations and editor session state separate.

The app entry should call:

```ts
initAppRouter({
  hideWorkbench,
  showWorkbench,
  showMenuGuide,
});
```

The router module handles route startup details internally.

## Non-Goals

- Do not introduce a full client-side router.
- Do not add path-based document identity routes such as `/editor/:id`.
- Do not move document conversion or OnlyOffice loading into the router.
- Do not change SEO page generation or static route files.
- Do not change iframe embed API behavior.

## Module Boundaries

### `src/lib/app-router.ts`

Responsibility:

- Initialize editor-session with UI callbacks.
- Wire editor-session restore to `restoreCurrentDocumentSession`.
- Read startup URL parameters.
- Open `?file=` or `?src=` documents on boot.
- Keep file priority over src.
- Decode URL parameters before opening, with fallback to the original value if decoding fails.

Public API:

```ts
type AppRouterCallbacks = {
  hideWorkbench: () => void;
  showWorkbench: () => void;
  showMenuGuide: () => void;
};

export function initAppRouter(callbacks: AppRouterCallbacks): void;
```

### `src/lib/editor-session.ts`

Responsibility remains unchanged:

- Represent local editor session state.
- Own `#editor` history marker.
- Handle Back and Forward.
- Close, cleanup, and restore via callbacks.

It should not parse query parameters or know how documents are opened.

### `src/lib/document.ts`

Responsibility remains unchanged:

- Create new documents.
- Open local files.
- Open URL files.
- Restore the current in-memory document session.

It should not parse app startup routes.

### `src/index.ts`

Responsibility after refactor:

- Initialize non-router systems such as events and embed API.
- Register document UI callbacks.
- Create UI.
- Call `initAppRouter(...)`.
- Register service worker and PWA install component.

It should not contain direct query parsing or editor-session callback wiring.

## Startup Flow

```text
index.ts
  initEvents()
  initEmbedApi()
  setUICallbacks(...)
  setEventUICallbacks(...)
  create UI
  initAppRouter(callbacks)

app-router.ts
  initEditorSession({
    hideWorkbench,
    showWorkbench,
    showMenuGuide,
    restoreEditor: restoreCurrentDocumentSession,
  })
  read file/src query
  openDocumentFromUrl(selectedUrl)
```

## Route Rules

- `?file=` has priority over `?src=`.
- If neither exists, the router only initializes editor session history handling.
- If the selected URL can be decoded, open the decoded value.
- If decoding throws, log a warning and open the original value.
- `#editor` remains owned by `editor-session`, not `app-router`.
- `?embed=1` remains handled by `editor-session` when deciding whether to push `#editor`.

## Testing

Add `test/unit/app-router.test.ts` for:

- `initAppRouter()` wires `initEditorSession()` with UI callbacks and `restoreCurrentDocumentSession`.
- `?file=` opens the decoded file URL.
- `?file=` wins over `?src=`.
- Invalid encoded URL falls back to the original string.
- No file/src parameter does not open a document.

Keep existing `editor-session` tests for history behavior.

## Migration Notes

- Move query handling out of `src/index.ts` into `src/lib/app-router.ts`.
- Keep `setUICallbacks(...)` in `index.ts` for now because it is document UI behavior, not route behavior.
- Keep `initEmbedApi()` in `index.ts` because embed API is not a startup route and has its own message protocol.
- After this refactor, future route behavior should be added through `app-router.ts`, not directly in `index.ts`.
