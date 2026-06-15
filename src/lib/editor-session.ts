type EditorSessionCallbacks = {
  hideWorkbench: () => void;
  showWorkbench: () => void;
  showMenuGuide?: () => void;
  restoreEditor?: () => void | Promise<void>;
};

type EditorSessionState = 'idle' | 'opening' | 'editing' | 'closing';

const EDITOR_HASH = '#editor';
const POPSTATE_HANDLER_KEY = '__documentEditorSessionPopStateHandler';

let callbacks: EditorSessionCallbacks | null = null;
let state: EditorSessionState = 'idle';
let popStateBound = false;
let restoringFromHistory = false;

const getWorkbenchUrl = (): string => `${window.location.pathname}${window.location.search}`;

const hasEditorHash = (): boolean => window.location.hash === EDITOR_HASH;

const isEmbedMode = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const embed = params.get('embed');

  if (embed === '' || embed === '1' || embed === 'true') return true;

  try {
    return window.parent !== window;
  } catch {
    return true;
  }
};

const normalizeWorkbenchUrl = (): void => {
  if (!hasEditorHash()) return;

  window.history.replaceState({ editorOpen: false }, '', getWorkbenchUrl());
};

const clearEditor = (): void => {
  try {
    window.editor?.destroyEditor?.();
  } catch (error) {
    console.warn('Failed to destroy editor session:', error);
  }

  window.editor = undefined;
  document.getElementById('iframe')?.replaceChildren();
};

const finishClose = (normalizeUrl: boolean): void => {
  state = 'closing';
  clearEditor();
  if (normalizeUrl) {
    normalizeWorkbenchUrl();
  }
  callbacks?.showWorkbench();
  state = 'idle';
};

const restoreFromHistory = (): void => {
  if (restoringFromHistory) {
    return;
  }

  if (!callbacks?.restoreEditor) {
    normalizeWorkbenchUrl();
    return;
  }

  restoringFromHistory = true;
  Promise.resolve(callbacks.restoreEditor())
    .catch((error) => {
      console.error('Failed to restore editor session from history:', error);
      failEditorOpen(error);
    })
    .finally(() => {
      restoringFromHistory = false;
    });
};

const handlePopState = (): void => {
  if (state === 'editing' || window.editor) {
    finishClose(false);
    return;
  }

  if (hasEditorHash()) {
    restoreFromHistory();
  }
};

export const initEditorSession = (nextCallbacks: EditorSessionCallbacks): void => {
  callbacks = nextCallbacks;

  if (!popStateBound) {
    const previousHandler = (window as unknown as Record<string, EventListener | undefined>)[POPSTATE_HANDLER_KEY];
    if (previousHandler && previousHandler !== handlePopState) {
      window.removeEventListener('popstate', previousHandler);
    }

    window.addEventListener('popstate', handlePopState);
    (window as unknown as Record<string, EventListener>)[POPSTATE_HANDLER_KEY] = handlePopState;
    popStateBound = true;
  }

  if (hasEditorHash() && !window.editor) {
    restoreFromHistory();
  }
};

export const beginEditorOpening = (): void => {
  state = 'opening';
  callbacks?.hideWorkbench();
};

export const commitEditorOpen = (): void => {
  if (!isEmbedMode() && !hasEditorHash()) {
    window.history.pushState({ editorOpen: true }, '', `${getWorkbenchUrl()}${EDITOR_HASH}`);
  }

  state = 'editing';
};

export const failEditorOpen = (_error?: unknown): void => {
  finishClose(true);
};

export const closeEditorSession = (): void => {
  if (state === 'idle' && !window.editor && !hasEditorHash()) {
    callbacks?.showWorkbench();
    return;
  }

  const shouldUseBack = hasEditorHash() && window.history.state?.editorOpen === true;
  finishClose(!shouldUseBack);

  if (shouldUseBack) {
    window.history.back();
  }
};

export const isEditorSessionOpen = (): boolean => state === 'editing';
