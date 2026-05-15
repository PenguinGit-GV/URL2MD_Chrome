const currentBtn = document.getElementById('downloadCurrent');
const allBtn = document.getElementById('downloadAll');
const status = document.getElementById('status');

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
applyToolbarIcon(darkModeQuery.matches);
darkModeQuery.addEventListener('change', (e) => applyToolbarIcon(e.matches));

function applyToolbarIcon(isDark) {
  const suffix = isDark ? '-light' : '';
  chrome.action.setIcon({
    path: {
      16: `icons/icon16${suffix}.png`,
      32: `icons/icon32${suffix}.png`,
      48: `icons/icon48${suffix}.png`,
      128: `icons/icon128${suffix}.png`
    }
  });
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function setBusy(btn, busyText) {
  btn.dataset.label = btn.textContent;
  btn.textContent = busyText;
  currentBtn.disabled = true;
  allBtn.disabled = true;
}

function clearBusy() {
  for (const btn of [currentBtn, allBtn]) {
    if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
      delete btn.dataset.label;
    }
  }
  currentBtn.disabled = false;
  allBtn.disabled = false;
}

currentBtn.addEventListener('click', async () => {
  setBusy(currentBtn, 'Saving...');
  setStatus('');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'download-current' });
    if (res && res.ok) {
      setStatus('Saved.');
      setTimeout(() => window.close(), 600);
    } else {
      setStatus((res && res.error) || 'Failed to save.', true);
    }
  } catch (e) {
    setStatus(String(e && e.message || e), true);
  } finally {
    clearBusy();
  }
});

allBtn.addEventListener('click', async () => {
  setBusy(allBtn, 'Saving all tabs...');
  setStatus('');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'download-all' });
    if (res && res.ok) {
      const parts = [`${res.success} saved`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      if (res.failed) parts.push(`${res.failed} failed`);
      setStatus(parts.join(', ') + '.');
    } else {
      setStatus((res && res.error) || 'Failed.', true);
    }
  } catch (e) {
    setStatus(String(e && e.message || e), true);
  } finally {
    clearBusy();
  }
});
