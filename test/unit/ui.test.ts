import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/document', () => ({
  onCreateNew: vi.fn(),
  onOpenDocument: vi.fn(),
}));

describe('ui editor mode', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = `
      <div id="control-panel-container"></div>
      <div id="fab-container" style="display: none"></div>
      <div id="landing-nav" style="display: flex"></div>
      <div id="editor-ad-strip" style="display: none"></div>
    `;
  });

  it('does not show the editor ad strip when entering editor mode', async () => {
    const { hideControlPanel } = await import('../../src/lib/ui');

    hideControlPanel();

    expect(document.body.classList.contains('editor-open')).toBe(true);
    expect(document.getElementById('editor-ad-strip')?.style.display).toBe('none');
  });
});
