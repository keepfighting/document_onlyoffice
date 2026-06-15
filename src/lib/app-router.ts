import { openDocumentFromUrl, restoreCurrentDocumentSession } from './document';
import { initEditorSession } from './editor-session';

export type AppRouterCallbacks = {
  hideWorkbench: () => void;
  showWorkbench: () => void;
  showMenuGuide: () => void;
};

const getStartupDocumentUrl = (): string | null => {
  const search = window.location.search.replace(/^\?/, '');
  if (!search) return null;

  const pairs = search.split('&');
  const findParam = (name: string): string | null => {
    const prefix = `${name}=`;
    const pair = pairs.find((item) => item === name || item.startsWith(prefix));
    if (!pair) return null;
    if (pair === name) return '';
    return pair.slice(prefix.length);
  };

  return findParam('file') || findParam('src');
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
