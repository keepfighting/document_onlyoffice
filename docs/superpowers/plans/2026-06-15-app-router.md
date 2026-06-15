# App Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small `app-router` module so app startup route behavior is initialized through one public call.

**Architecture:** `app-router` is a startup orchestration layer. It wires UI callbacks into `editor-session`, connects editor restoration to `document`, and handles `?file=` / `?src=` startup URL opening. It does not own OnlyOffice loading, conversion, SEO routes, or embed message handling.

**Tech Stack:** TypeScript, Vite, Vitest, existing browser APIs (`URLSearchParams`, `decodeURIComponent`, `window.location`).

---

## File Structure

- Create `src/lib/app-router.ts`: public `initAppRouter(callbacks)` API and startup query handling.
- Create `test/unit/app-router.test.ts`: module boundary tests using Vitest mocks for document and editor-session modules.
- Modify `src/index.ts`: remove direct query parsing and direct editor-session initialization; call `initAppRouter(...)`.
- Keep `src/lib/editor-session.ts` unchanged unless tests reveal an integration bug.
- Keep `src/lib/document.ts` unchanged for this refactor.

## Task 1: Add App Router Tests

**Files:**

- Create: `test/unit/app-router.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/app-router.test.ts` with these tests:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initEditorSession = vi.fn();
const openDocumentFromUrl = vi.fn();
const restoreCurrentDocumentSession = vi.fn();

vi.mock('../../src/lib/editor-session', () => ({
  initEditorSession,
}));

vi.mock('../../src/lib/document', () => ({
  openDocumentFromUrl,
  restoreCurrentDocumentSession,
}));

describe('app-router', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    history.replaceState(null, '', '/');
  });

  it('wires editor session callbacks through a single router call', async () => {
    const { initAppRouter } = await import('../../src/lib/app-router');
    const callbacks = {
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      showMenuGuide: vi.fn(),
    };

    initAppRouter(callbacks);

    expect(initEditorSession).toHaveBeenCalledWith({
      hideWorkbench: callbacks.hideWorkbench,
      showWorkbench: callbacks.showWorkbench,
      showMenuGuide: callbacks.showMenuGuide,
      restoreEditor: restoreCurrentDocumentSession,
    });
  });

  it('opens decoded file query parameter on startup', async () => {
    history.replaceState(null, '', '/?file=https%3A%2F%2Fexample.com%2Fdemo.docx');
    const { initAppRouter } = await import('../../src/lib/app-router');

    initAppRouter({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      showMenuGuide: vi.fn(),
    });

    expect(openDocumentFromUrl).toHaveBeenCalledWith('https://example.com/demo.docx');
  });

  it('prefers file query parameter over src', async () => {
    history.replaceState(
      null,
      '',
      '/?file=https%3A%2F%2Fexample.com%2Ffile.docx&src=https%3A%2F%2Fexample.com%2Fsrc.xlsx',
    );
    const { initAppRouter } = await import('../../src/lib/app-router');

    initAppRouter({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      showMenuGuide: vi.fn(),
    });

    expect(openDocumentFromUrl).toHaveBeenCalledWith('https://example.com/file.docx');
  });

  it('falls back to the original URL parameter when decoding fails', async () => {
    history.replaceState(null, '', '/?file=%E0%A4%A');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initAppRouter } = await import('../../src/lib/app-router');

    initAppRouter({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      showMenuGuide: vi.fn(),
    });

    expect(openDocumentFromUrl).toHaveBeenCalledWith('%E0%A4%A');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not open a document when no startup document parameter exists', async () => {
    const { initAppRouter } = await import('../../src/lib/app-router');

    initAppRouter({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      showMenuGuide: vi.fn(),
    });

    expect(openDocumentFromUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run test/unit/app-router.test.ts
```

Expected: fail because `src/lib/app-router.ts` does not exist.

## Task 2: Implement App Router

**Files:**

- Create: `src/lib/app-router.ts`

- [ ] **Step 1: Add minimal implementation**

Create `src/lib/app-router.ts`:

```ts
import { openDocumentFromUrl, restoreCurrentDocumentSession } from './document';
import { initEditorSession } from './editor-session';

export type AppRouterCallbacks = {
  hideWorkbench: () => void;
  showWorkbench: () => void;
  showMenuGuide: () => void;
};

const getStartupDocumentUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get('file') || params.get('src');
};

const decodeStartupDocumentUrl = (url: string): string => {
  try {
    return decodeURIComponent(url);
  } catch (error) {
    console.warn('Failed to decode URL, using original:', error);
    return url;
  }
};

export const initAppRouter = (callbacks: AppRouterCallbacks): void => {
  initEditorSession({
    hideWorkbench: callbacks.hideWorkbench,
    showWorkbench: callbacks.showWorkbench,
    showMenuGuide: callbacks.showMenuGuide,
    restoreEditor: restoreCurrentDocumentSession,
  });

  const documentUrl = getStartupDocumentUrl();
  if (documentUrl) {
    openDocumentFromUrl(decodeStartupDocumentUrl(documentUrl));
  }
};
```

- [ ] **Step 2: Run router tests**

Run:

```bash
pnpm vitest run test/unit/app-router.test.ts
```

Expected: all app-router tests pass.

## Task 3: Simplify App Entry

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Replace route wiring**

In `src/index.ts`:

- Remove `getAllQueryString` import.
- Remove `initEditorSession` import.
- Remove `openDocumentFromUrl` and `restoreCurrentDocumentSession` imports.
- Import `initAppRouter` from `./lib/app-router`.
- Replace direct `initEditorSession(...)` call with `initAppRouter(...)`.
- Delete the `?file=` / `?src=` query parsing block.

The top-level wiring should keep this shape:

```ts
initEvents();
initEmbedApi();
initAppRouter({
  hideWorkbench: hideControlPanel,
  showWorkbench: showControlPanel,
  showMenuGuide,
});
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm vitest run test/unit/app-router.test.ts test/unit/editor-session.test.ts test/unit/onlyoffice-editor.test.ts
```

Expected: all focused tests pass.

## Task 4: Verification

**Files:**

- No additional source files.

- [ ] **Step 1: Run build**

Run:

```bash
pnpm run build
```

Expected: build completes successfully.

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: changes include the new router module, router tests, index refactor, and documentation.
