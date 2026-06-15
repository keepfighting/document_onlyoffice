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
