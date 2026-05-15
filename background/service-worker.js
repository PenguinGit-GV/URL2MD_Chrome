const INJECTABLE_SCHEMES = /^(https?|file|ftp):/i;
const MENU_DOWNLOAD_TAB = 'url2md-download-tab';
const MENU_DOWNLOAD_ALL = 'url2md-download-all';

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_DOWNLOAD_TAB,
      title: 'Download this page as Markdown',
      contexts: ['page', 'selection', 'link']
    });
    chrome.contextMenus.create({
      id: MENU_DOWNLOAD_ALL,
      title: 'Download all open tabs as Markdown',
      contexts: ['page', 'selection', 'link']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_DOWNLOAD_TAB && tab) {
    downloadTab(tab).catch((e) => console.error('URL2MD: download tab failed', e));
  } else if (info.menuItemId === MENU_DOWNLOAD_ALL) {
    downloadAllTabs().catch((e) => console.error('URL2MD: download all failed', e));
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'download-current') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return sendResponse({ ok: false, error: 'No active tab' });
      try {
        await downloadTab(tab);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }
  if (msg.type === 'download-all') {
    (async () => {
      try {
        const result = await downloadAllTabs();
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }
});

async function downloadAllTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  let success = 0;
  let skipped = 0;
  let failed = 0;
  for (const tab of tabs) {
    if (!tab.url || !INJECTABLE_SCHEMES.test(tab.url)) {
      skipped++;
      continue;
    }
    try {
      await downloadTab(tab);
      success++;
    } catch (e) {
      console.error('URL2MD: failed for', tab.url, e);
      failed++;
    }
  }
  return { success, skipped, failed, total: tabs.length };
}

async function downloadTab(tab) {
  if (!tab.id || !tab.url || !INJECTABLE_SCHEMES.test(tab.url)) {
    throw new Error('Cannot save this page (browser-internal URL).');
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      'lib/Readability.js',
      'lib/turndown.js',
      'lib/turndown-plugin-gfm.js',
      'contentScript/converter.js'
    ]
  });

  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (typeof window.__url2md_convert === 'function' ? window.__url2md_convert() : null)
  });

  if (!result) throw new Error('Converter did not run');
  if (result.error) throw new Error(result.error);

  const filename = buildFilename(result.title || tab.title || 'Untitled');
  const dataUrl = 'data:text/markdown;charset=utf-8;base64,' + base64EncodeUnicode(result.markdown);
  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
}

function buildFilename(rawTitle) {
  const sanitized = sanitizeTitle(rawTitle) || 'Untitled';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear() % 100).padStart(2, '0')}`;
  return `${sanitized} ${stamp}.md`;
}

function sanitizeTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/[\/\\:\*\?"<>\|]/g, '')
    .replace(new RegExp('[\\u0000-\\u001f\\u007f]', 'g'), '')
    .replace(new RegExp('\\u00a0', 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

function base64EncodeUnicode(str) {
  const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return btoa(utf8);
}
