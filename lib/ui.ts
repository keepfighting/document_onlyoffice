import { localStorageGetItem, localStorageSetItem } from 'ranuts/utils';
import { t } from './i18n';
import { showLoading } from './loading';
import { onCreateNew, onOpenDocument } from './document';

type LandingPage = {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
};

const landingPages: Record<string, LandingPage> = {
  '/': {
    eyebrow: 'Private Office editing, no document server',
    title: 'Local Document Editor in Your Browser',
    description:
      'Edit DOCX, XLSX, PPTX, and CSV files locally in your browser. Files stay on your device, with no upload, no account, and no document server runtime.',
    badge: 'Multi-format',
    sections: [
      {
        title: 'Private by default',
        body: 'The editor runs in the browser and keeps local files local, which makes it useful for sensitive documents, internal tools, and offline workflows.',
      },
      {
        title: 'Deploy anywhere',
        body: 'Ship the static build to GitHub Pages, Vercel, Netlify, Cloudflare Pages, Nginx, or Docker. No document server is required.',
      },
      {
        title: 'Built for products',
        body: 'Use the iframe postMessage API to embed editing into your own app while your parent system owns auth, storage, and upload flow.',
      },
    ],
  },
  '/private-document-editor/': {
    eyebrow: 'Private document editing in the browser',
    title: 'Private Document Editor With No Upload',
    description:
      'Open Office documents in a local-first browser editor. Edit Word, Excel, PowerPoint, and CSV files without sending private files to a hosted document service.',
    badge: 'No upload',
    sections: [
      {
        title: 'Local-first workflow',
        body: 'Documents are opened from the device or a CORS-enabled URL and handled in the browser, which keeps sensitive files out of third-party upload pipelines.',
      },
      {
        title: 'Office file coverage',
        body: 'Use one editor entry point for DOCX, XLSX, PPTX, and CSV workflows instead of separate single-format utilities.',
      },
      {
        title: 'Deployable by teams',
        body: 'Run it as a static site or Docker container for internal portals, privacy-sensitive reviews, and offline-friendly document tasks.',
      },
    ],
  },
  '/docx-editor/': {
    eyebrow: 'Edit Word documents without upload',
    title: 'DOCX editor with no server upload',
    description:
      'Open Word documents directly in the browser, edit locally, and save the file back to your device. A focused path for privacy-sensitive DOCX workflows.',
    badge: 'DOCX no upload',
    sections: [
      {
        title: 'No account gate',
        body: 'Users can start from a local file or create a new document without signing in or sending a file to a hosted conversion service.',
      },
      {
        title: 'Format-aware editing',
        body: 'The editor is powered by OnlyOffice web apps and WASM conversion assets, preserving Office workflows better than plain rich-text editors.',
      },
      {
        title: 'Offline-ready',
        body: 'Install the PWA over HTTPS and keep a document editor available even when the network is unreliable.',
      },
    ],
  },
  '/xlsx-editor/': {
    eyebrow: 'Edit spreadsheets without upload',
    title: 'XLSX Editor in Your Browser',
    description:
      'Open and edit Excel spreadsheets locally in the browser. Create or review XLSX files without an account, upload flow, or document server.',
    badge: 'XLSX local',
    sections: [
      {
        title: 'Spreadsheet editing',
        body: 'Work with Excel-style files through the OnlyOffice spreadsheet editor while keeping the file workflow local-first.',
      },
      {
        title: 'Useful for internal data',
        body: 'Review sheets, operational exports, and lightweight data files where a cloud upload is unnecessary or undesirable.',
      },
      {
        title: 'Static deployment',
        body: 'Host the same frontend build on GitHub Pages, Cloudflare Pages, Vercel, Nginx, or Docker.',
      },
    ],
  },
  '/pptx-editor/': {
    eyebrow: 'Edit presentations without upload',
    title: 'PPTX Editor in Your Browser',
    description:
      'Open and edit PowerPoint presentations locally in the browser. Create or update PPTX files with no account and no document server.',
    badge: 'PPTX local',
    sections: [
      {
        title: 'Presentation workflow',
        body: 'Use the OnlyOffice presentation editor for slide decks while keeping private files on the user device.',
      },
      {
        title: 'No hosted conversion step',
        body: 'The local-first architecture avoids sending presentation files to a third-party conversion endpoint for basic editing workflows.',
      },
      {
        title: 'Ready for portals',
        body: 'Embed it in internal products, LMS systems, or admin tools with the iframe API when document storage lives elsewhere.',
      },
    ],
  },
  '/csv-editor/': {
    eyebrow: 'Open tabular files locally',
    title: 'CSV Editor in Your Browser',
    description:
      'Open CSV files in a browser-based Office editor for local review and editing. Keep simple tabular documents off upload-based tools.',
    badge: 'CSV local',
    sections: [
      {
        title: 'Tabular file support',
        body: 'Use a spreadsheet-style interface for CSV files instead of editing structured data in a plain text box.',
      },
      {
        title: 'Private by default',
        body: 'A local-first flow is useful for exports, reports, and small datasets that should not be copied into random online tools.',
      },
      {
        title: 'One editor surface',
        body: 'Keep CSV, XLSX, DOCX, and PPTX workflows behind the same product interface and deployment pipeline.',
      },
    ],
  },
  '/onlyoffice-wasm/': {
    eyebrow: 'OnlyOffice in a static web app',
    title: 'OnlyOffice WASM document editor',
    description:
      'A pure frontend integration path for OnlyOffice web apps and x2t WebAssembly conversion. Explore local Office editing without operating Document Server.',
    badge: 'WASM architecture',
    sections: [
      {
        title: 'Serverless architecture',
        body: 'Static assets, WebAssembly conversion, and browser APIs replace a traditional document conversion backend for many local editing scenarios.',
      },
      {
        title: 'Developer friendly',
        body: 'The project includes Docker deployment, GitHub Pages deployment, iframe embedding, and documented postMessage events.',
      },
      {
        title: 'Open-source constraints',
        body: 'Fonts, AGPL obligations, and Office compatibility are documented so teams can evaluate the approach before adopting it.',
      },
    ],
  },
  '/embed-document-editor/': {
    eyebrow: 'Iframe API for product teams',
    title: 'Embed a private document editor',
    description:
      'Embed the editor with an iframe and control document open/save flows with postMessage. Keep auth, permissions, and file storage in the parent app.',
    badge: 'postMessage API',
    sections: [
      {
        title: 'Clean ownership boundary',
        body: 'The parent application handles users, permissions, upload, and persistence. The iframe focuses on editing and document events.',
      },
      {
        title: 'Works with URLs',
        body: 'Open documents with query parameters or postMessage, as long as remote sources provide CORS-compatible access.',
      },
      {
        title: 'Product integration',
        body: 'Use it for knowledge bases, LMS systems, internal portals, admin dashboards, or document review flows.',
      },
    ],
  },
  '/self-hosted-document-editor/': {
    eyebrow: 'Static hosting or Docker',
    title: 'Self-hosted document editor',
    description:
      'Run a browser-based Office editor on your own infrastructure. Deploy as static files or a Docker container, with optional HTTPS and basic auth.',
    badge: 'Self-hosted',
    sections: [
      {
        title: 'Own the deployment',
        body: 'Serve the static app from Nginx, Cloudflare Pages, Vercel, Netlify, GitHub Pages, or the provided Docker image.',
      },
      {
        title: 'Useful for private networks',
        body: 'A local-first editor is a practical fit for intranets, labs, regulated teams, and workflows where documents should not leave the device.',
      },
      {
        title: 'Simple operational model',
        body: 'Build once, host static assets, and avoid maintaining a collaborative document server for single-user editing flows.',
      },
    ],
  },
};

const pageSlugs = [
  'private-document-editor',
  'docx-editor',
  'xlsx-editor',
  'pptx-editor',
  'csv-editor',
  'onlyoffice-wasm',
  'embed-document-editor',
  'self-hosted-document-editor',
];

const normalizePathname = () => {
  const pathname = window.location.pathname;
  for (const slug of pageSlugs) {
    if (pathname.endsWith(`/${slug}`) || pathname.endsWith(`/${slug}/`)) return `/${slug}/`;
  }
  return '/';
};

const getLandingPage = () => landingPages[normalizePathname()] || landingPages['/'];

const getSiteRoot = () => {
  const pathname = window.location.pathname;
  for (const slug of pageSlugs) {
    const slugIndex = pathname.lastIndexOf(`/${slug}`);
    if (slugIndex !== -1) return `${pathname.slice(0, slugIndex)}/`;
  }
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
};

const updatePageMeta = (page: LandingPage) => {
  document.title = `${page.title} | OnlyOffice WASM`;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = page.description;
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = page.title;
  const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  if (ogDescription) ogDescription.content = page.description;
};

// Helper: push an ad slot once it is in the DOM
const pushAdSlot = (ins: HTMLElement) => {
  try {
    ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    ins.dataset.pushed = '1';
  } catch {
    // AdSense not loaded yet — slot will activate when script loads
  }
};

// Create a Google AdSense <ins> element (slot activates when AdSense script is present)
const createInsSlot = (id: string): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'ad-unit';

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  // Replace with your real publisher ID and slot IDs before going live
  ins.setAttribute('data-ad-client', 'ca-pub-XXXXXXXXXXXXXXXX');
  ins.setAttribute('data-ad-slot', '0000000000');
  ins.setAttribute('data-ad-format', 'auto');
  ins.setAttribute('data-full-width-responsive', 'true');
  wrap.appendChild(ins);
  return wrap;
};

// Hide control panel and show top floating bar
export const hideControlPanel = (): void => {
  const container = document.querySelector('#control-panel-container') as HTMLElement;
  const fabContainer = document.querySelector('#fab-container') as HTMLElement;

  // Always ensure FAB is visible when hiding control panel
  if (fabContainer) {
    fabContainer.style.display = 'block';
  }

  if (container) {
    // Immediately disable pointer events to prevent blocking
    container.style.pointerEvents = 'none';
    container.style.opacity = '0';
    // Hide after transition for smooth animation
    setTimeout(() => {
      container.style.display = 'none';
    }, 300);
  }

  // Mark editor as active (CSS uses this to show editor-ad-strip)
  document.body.classList.add('editor-open');
  const strip = document.getElementById('editor-ad-strip');
  if (strip) {
    strip.style.display = 'flex';
    const ins = strip.querySelector('ins.adsbygoogle') as HTMLElement | null;
    if (ins && !ins.dataset.pushed) pushAdSlot(ins);
  }
};

// Show control panel and hide FAB
export const showControlPanel = (): void => {
  const container = document.querySelector('#control-panel-container') as HTMLElement;
  const fabContainer = document.querySelector('#fab-container') as HTMLElement;
  if (container) {
    container.style.display = 'flex';
    setTimeout(() => {
      container.style.opacity = '1';
    }, 10);
  }
  // Only hide FAB if editor is not open
  // If editor is already open, keep FAB visible so user can access menu
  if (fabContainer && !window.editor) {
    fabContainer.style.display = 'none';
  }

  // Return to landing mode
  document.body.classList.remove('editor-open');
  const strip = document.getElementById('editor-ad-strip');
  if (strip) strip.style.display = 'none';
};

// Create fixed action button in bottom right corner
export const createFixedActionButton = (): HTMLElement => {
  const fabContainer = document.createElement('div');
  fabContainer.id = 'fab-container';
  fabContainer.className = 'fab-container';

  // Main FAB button
  const fabButton = document.createElement('button');
  fabButton.id = 'fab-button';
  fabButton.textContent = t('menu');
  fabButton.className = 'fab-button';

  // Menu panel - compact style
  const menuPanel = document.createElement('div');
  menuPanel.id = 'fab-menu';
  menuPanel.className = 'fab-menu';

  const createMenuButton = (text: string, onClick: () => void | Promise<void>, showLoadingImmediately = true) => {
    // Create wrapper for the entire menu item
    const menuItem = document.createElement('div');
    menuItem.className = 'fab-menu-item';

    const button = document.createElement('button');
    button.textContent = text;
    button.className = 'fab-menu-button';

    // Handle hover on the wrapper
    menuItem.addEventListener('mouseenter', () => {
      menuItem.style.background = '#f5f5f5';
    });
    menuItem.addEventListener('mouseleave', () => {
      menuItem.style.background = 'transparent';
    });

    button.addEventListener('click', async () => {
      hideMenu();
      // Only show loading immediately if specified (for operations that don't require user interaction)
      let removeLoading: (() => void) | null = null;
      if (showLoadingImmediately) {
        const loadingResult = showLoading();
        removeLoading = loadingResult.removeLoading;
      }
      try {
        // Small delay to ensure menu hide animation completes
        await new Promise((resolve) => setTimeout(resolve, 100));
        await onClick();
      } catch (error) {
        console.error('Error in menu button action:', error);
        // Show control panel on error
        showControlPanel();
      } finally {
        // Only remove loading if it was shown
        if (removeLoading) {
          removeLoading();
        }
      }
    });

    menuItem.appendChild(button);
    return menuItem;
  };

  menuPanel.appendChild(
    createMenuButton(
      t('uploadDocument'),
      () => {
        onOpenDocument();
        // If user cancelled, nothing happens (onchange won't fire)
        // If user selected file, document will be opened in handleChange
      },
      false, // Don't show loading immediately - wait for file selection
    ),
  );
  menuPanel.appendChild(
    createMenuButton(t('newWord'), async () => {
      await onCreateNew('.docx');
    }),
  );
  menuPanel.appendChild(
    createMenuButton(t('newExcel'), async () => {
      await onCreateNew('.xlsx');
    }),
  );
  menuPanel.appendChild(
    createMenuButton(t('newPowerPoint'), async () => {
      await onCreateNew('.pptx');
    }),
  );

  let isMenuOpen = false;
  let hideMenuTimeout: NodeJS.Timeout;

  const showMenu = () => {
    clearTimeout(hideMenuTimeout);
    isMenuOpen = true;
    menuPanel.style.display = 'flex';
    menuPanel.style.pointerEvents = 'auto';
    setTimeout(() => {
      menuPanel.style.opacity = '1';
      menuPanel.style.transform = 'translateY(0) scale(1)';
    }, 10);
  };

  const hideMenu = () => {
    isMenuOpen = false;
    menuPanel.style.opacity = '0';
    menuPanel.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => {
      menuPanel.style.display = 'none';
      menuPanel.style.pointerEvents = 'none';
    }, 200);
  };

  // Show menu on hover button
  fabButton.addEventListener('mouseenter', () => {
    showMenu();
  });

  // Hide menu when leaving button (if not moving to menu)
  fabButton.addEventListener('mouseleave', (e) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    // If moving to menu panel, don't hide
    if (relatedTarget && (relatedTarget === menuPanel || menuPanel.contains(relatedTarget))) {
      return;
    }
    hideMenuTimeout = setTimeout(() => {
      hideMenu();
    }, 200);
  });

  // Keep menu visible when hovering over it
  menuPanel.addEventListener('mouseenter', () => {
    clearTimeout(hideMenuTimeout);
    if (!isMenuOpen) {
      showMenu();
    }
  });

  // Hide menu when leaving menu panel
  menuPanel.addEventListener('mouseleave', () => {
    hideMenuTimeout = setTimeout(() => {
      hideMenu();
    }, 200);
  });

  fabContainer.appendChild(menuPanel);
  fabContainer.appendChild(fabButton);
  document.body.appendChild(fabContainer);
  return fabContainer;
};

// Show menu guide tooltip
let menuGuideElement: HTMLElement | null = null;
const MENU_GUIDE_DISMISSED_KEY = 'menu-guide-dismissed';

export const showMenuGuide = (): void => {
  // Check if guide was dismissed in localStorage
  if (localStorageGetItem(MENU_GUIDE_DISMISSED_KEY) === 'true') {
    return;
  }

  // Check if guide was already shown in this session
  if (menuGuideElement) {
    return;
  }

  const fabButton = document.querySelector('#fab-button') as HTMLElement;
  if (!fabButton) {
    return;
  }

  // Create guide container
  const guide = document.createElement('div');
  guide.id = 'menu-guide';
  guide.className = 'menu-guide';

  // Create arrow pointing down
  const arrow = document.createElement('div');
  arrow.className = 'menu-guide-arrow';

  // Create text content
  const text = document.createElement('div');
  text.textContent = t('menuGuide');
  text.className = 'menu-guide-text';

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.className = 'menu-guide-close';

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = '#333';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = '#999';
  });

  const hideGuide = (saveToStorage = false) => {
    if (saveToStorage) {
      localStorageSetItem(MENU_GUIDE_DISMISSED_KEY, 'true');
    }
    if (guide.parentNode) {
      guide.style.animation = 'guideFadeOut 0.3s ease';
      setTimeout(() => {
        if (guide.parentNode) {
          guide.parentNode.removeChild(guide);
        }
        menuGuideElement = null;
      }, 300);
    }
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideGuide(true);
  });

  guide.appendChild(arrow);
  guide.appendChild(text);
  guide.appendChild(closeBtn);
  document.body.appendChild(guide);
  menuGuideElement = guide;

  // Auto hide after 5 seconds (don't save to storage)
  setTimeout(() => {
    if (menuGuideElement === guide) {
      hideGuide(false);
    }
  }, 5000);

  // Hide when hovering over menu button (don't save to storage)
  fabButton.addEventListener(
    'mouseenter',
    () => {
      if (menuGuideElement === guide) {
        hideGuide(false);
      }
    },
    { once: true },
  );
};

// Create and append the control panel
export const createControlPanel = (): void => {
  document.querySelector('#seo-content')?.remove();

  const page = getLandingPage();
  updatePageMeta(page);

  // Create control panel container - centered in viewport
  const container = document.createElement('div');
  container.id = 'control-panel-container';
  container.className = 'control-panel-container';

  const landing = document.createElement('main');
  landing.className = 'landing-shell';

  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  const content = document.createElement('div');
  content.className = 'landing-copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'landing-eyebrow';
  eyebrow.textContent = page.eyebrow;

  const title = document.createElement('h1');
  title.className = 'landing-title';
  title.textContent = page.title;

  const description = document.createElement('p');
  description.className = 'landing-description';
  description.textContent = page.description;

  const trust = document.createElement('div');
  trust.className = 'landing-trust';
  ['No upload', 'No account', 'PWA offline', page.badge].forEach((item) => {
    const badge = document.createElement('span');
    badge.textContent = item;
    trust.appendChild(badge);
  });

  content.appendChild(eyebrow);
  content.appendChild(title);
  content.appendChild(description);
  content.appendChild(trust);

  const panel = document.createElement('div');
  panel.className = 'landing-action-panel';

  // Create button group - centered horizontally with wrap support
  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'control-panel-button-group';

  // Helper function to create text button
  const createTextButton = (id: string, text: string, onClick: () => void) => {
    const button = document.createElement('r-button');
    button.id = id;
    button.textContent = text;
    button.setAttribute('variant', 'text');
    button.setAttribute('type', 'text');
    button.className = 'control-panel-button';

    button.addEventListener('mouseenter', () => {
      button.style.color = '#667eea';
      button.style.transform = 'scale(1.05)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.color = '#333';
      button.style.transform = 'scale(1)';
    });
    button.addEventListener('click', onClick);

    return button;
  };

  // Create four buttons
  const uploadButton = createTextButton('upload-button', t('uploadDocument'), () => {
    onOpenDocument();
    // If user cancelled, nothing happens (onchange won't fire, control panel remains visible)
    // If user selected file, document will be opened and control panel will be hidden in handleChange
  });
  buttonGroup.appendChild(uploadButton);

  const newWordButton = createTextButton('new-word-button', t('newWord'), async () => {
    hideControlPanel();
    const { removeLoading } = showLoading();
    try {
      await onCreateNew('.docx');
    } catch (error) {
      console.error('Error creating new Word document:', error);
      showControlPanel();
    } finally {
      removeLoading();
    }
  });
  buttonGroup.appendChild(newWordButton);

  const newExcelButton = createTextButton('new-excel-button', t('newExcel'), async () => {
    hideControlPanel();
    const { removeLoading } = showLoading();
    try {
      await onCreateNew('.xlsx');
    } catch (error) {
      console.error('Error creating new Excel document:', error);
      showControlPanel();
    } finally {
      removeLoading();
    }
  });
  buttonGroup.appendChild(newExcelButton);

  const newPptxButton = createTextButton('new-pptx-button', t('newPowerPoint'), async () => {
    hideControlPanel();
    const { removeLoading } = showLoading();
    try {
      await onCreateNew('.pptx');
    } catch (error) {
      console.error('Error creating new PowerPoint document:', error);
      showControlPanel();
    } finally {
      removeLoading();
    }
  });
  buttonGroup.appendChild(newPptxButton);

  panel.appendChild(buttonGroup);

  const hint = document.createElement('p');
  hint.className = 'landing-hint';
  hint.textContent = 'Create a new Office file or open a local document. Remote URLs work with CORS-enabled sources.';
  panel.appendChild(hint);

  hero.appendChild(content);
  hero.appendChild(panel);

  const sections = document.createElement('section');
  sections.className = 'landing-sections';
  page.sections.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'landing-section';
    const h2 = document.createElement('h2');
    h2.textContent = item.title;
    const body = document.createElement('p');
    body.textContent = item.body;
    card.appendChild(h2);
    card.appendChild(body);
    sections.appendChild(card);
  });

  const links = document.createElement('nav');
  links.className = 'landing-links';
  [
    ['Private editor', `${getSiteRoot()}private-document-editor/`],
    ['DOCX editor', `${getSiteRoot()}docx-editor/`],
    ['XLSX editor', `${getSiteRoot()}xlsx-editor/`],
    ['PPTX editor', `${getSiteRoot()}pptx-editor/`],
    ['CSV editor', `${getSiteRoot()}csv-editor/`],
    ['OnlyOffice WASM', `${getSiteRoot()}onlyoffice-wasm/`],
    ['Embed API', `${getSiteRoot()}embed-document-editor/`],
    ['Self-hosted', `${getSiteRoot()}self-hosted-document-editor/`],
    ['GitHub', 'https://github.com/ranuts/document'],
  ].forEach(([label, href]) => {
    const link = document.createElement('a');
    link.textContent = label;
    link.href = href;
    links.appendChild(link);
  });

  // Ad slot between hero and feature cards (landing-page only, hidden when editor opens)
  const landingAd = createInsSlot('ad-landing');
  const landingAdIns = landingAd.querySelector('ins') as HTMLElement;

  landing.appendChild(hero);
  landing.appendChild(landingAd);
  landing.appendChild(sections);
  landing.appendChild(links);
  container.appendChild(landing);
  document.body.appendChild(container);

  // Activate landing ad after element is in DOM
  if (landingAdIns) pushAdSlot(landingAdIns);

  // Editor-mode ad strip: thin fixed bar at bottom, hidden until editor opens
  const editorStrip = document.createElement('div');
  editorStrip.id = 'editor-ad-strip';
  editorStrip.className = 'editor-ad-strip';
  editorStrip.style.display = 'none';
  const editorAdIns = createInsSlot('ad-editor-strip');
  editorStrip.appendChild(editorAdIns);
  document.body.appendChild(editorStrip);
};
