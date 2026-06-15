import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('editor-session', () => {
  beforeEach(() => {
    vi.resetModules();
    history.replaceState(null, '', '/');
    document.body.innerHTML = '<div id="iframe"><span>old editor</span></div>';
    Reflect.deleteProperty(window, 'editor');
  });

  it('pushes an editor history marker when an editor session opens', async () => {
    const { beginEditorOpening, commitEditorOpen, initEditorSession, isEditorSessionOpen } =
      await import('../../src/lib/editor-session');
    const hideWorkbench = vi.fn();

    initEditorSession({
      hideWorkbench,
      showWorkbench: vi.fn(),
    });

    beginEditorOpening();
    commitEditorOpen();

    expect(window.location.hash).toBe('#editor');
    expect(isEditorSessionOpen()).toBe(true);
    expect(hideWorkbench).toHaveBeenCalledTimes(1);
  });

  it('closes the editor and restores the workbench on browser back', async () => {
    const { beginEditorOpening, commitEditorOpen, initEditorSession } = await import('../../src/lib/editor-session');
    const destroyEditor = vi.fn();
    const showWorkbench = vi.fn();

    window.editor = { destroyEditor };
    initEditorSession({
      hideWorkbench: vi.fn(),
      showWorkbench,
    });
    beginEditorOpening();
    commitEditorOpen();

    history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(destroyEditor).toHaveBeenCalledTimes(1);
    expect(window.editor).toBeUndefined();
    expect(document.getElementById('iframe')?.childElementCount).toBe(0);
    expect(showWorkbench).toHaveBeenCalledTimes(1);
  });

  it('clears a failed open and returns to the workbench URL', async () => {
    const { beginEditorOpening, commitEditorOpen, failEditorOpen, initEditorSession, isEditorSessionOpen } =
      await import('../../src/lib/editor-session');
    const showWorkbench = vi.fn();

    window.editor = { destroyEditor: vi.fn() };
    initEditorSession({
      hideWorkbench: vi.fn(),
      showWorkbench,
    });
    beginEditorOpening();
    commitEditorOpen();

    failEditorOpen(new Error('open failed'));

    expect(window.location.hash).toBe('');
    expect(window.editor).toBeUndefined();
    expect(document.getElementById('iframe')?.childElementCount).toBe(0);
    expect(showWorkbench).toHaveBeenCalledTimes(1);
    expect(isEditorSessionOpen()).toBe(false);
  });

  it('does not push editor history in embed mode', async () => {
    history.replaceState(null, '', '/?embed=1');
    const { beginEditorOpening, commitEditorOpen, initEditorSession } = await import('../../src/lib/editor-session');

    initEditorSession({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
    });
    beginEditorOpening();
    commitEditorOpen();

    expect(window.location.href).toBe('http://localhost:3000/?embed=1');
  });

  it('restores the editor session when history forward returns to the editor marker', async () => {
    const { initEditorSession } = await import('../../src/lib/editor-session');
    const restoreEditor = vi.fn();

    initEditorSession({
      hideWorkbench: vi.fn(),
      showWorkbench: vi.fn(),
      restoreEditor,
    });

    history.pushState({ editorOpen: true }, '', '/#editor');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(restoreEditor).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#editor');
  });
});
