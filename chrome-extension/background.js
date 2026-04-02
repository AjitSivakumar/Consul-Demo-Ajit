/**
 * background.js — Service worker
 * Relays captions from the Google Meet content script to any open Ambi app tab.
 * Uses chrome.tabs.sendMessage with the Ambi content script as the receiver.
 */

const DEBUG = true;
function log(...args) { if (DEBUG) console.log('[Ambi BG]', ...args); }
function warn(...args) { console.warn('[Ambi BG]', ...args); }

/* ── State ── */
let ambiTabId = null;
let ambiTabInjected = false;
let captionBuffer = [];
const FLUSH_INTERVAL_MS = 800;
let totalRelayed = 0;

/* ── Find / track Ambi app tab ── */

async function findAmbiTab() {
  const tabs = await chrome.tabs.query({});
  const ambiTab = tabs.find((t) =>
    t.url && (
      t.url.includes('localhost:5173') ||
      t.url.includes('localhost:3000') ||
      t.url.includes('ambi') ||
      t.url.includes('vercel.app')
    )
  );
  if (ambiTab) {
    ambiTabId = ambiTab.id;
    log('Found Ambi tab:', ambiTabId, ambiTab.url);
    await ensureContentScript(ambiTabId);
  } else {
    warn('No Ambi tab found. Open tabs:', tabs.map(t => t.url?.substring(0, 60)).join(', '));
  }
  return ambiTabId;
}

/* ── Programmatically inject content script if not already present ── */

async function ensureContentScript(tabId) {
  if (ambiTabInjected) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-ambi.js']
    });
    ambiTabInjected = true;
    log('Injected content-ambi.js into tab', tabId);
  } catch (err) {
    warn('Failed to inject content script:', err.message || err);
  }
}

/* ── Flush buffered captions to Ambi ── */

async function flushBuffer() {
  if (captionBuffer.length === 0) return;

  if (!ambiTabId) {
    await findAmbiTab();
  }

  if (!ambiTabId) {
    // No Ambi tab found — keep buffer, it'll flush once a tab is found
    return;
  }

  const batch = [...captionBuffer];
  captionBuffer = [];

  log(`Flushing ${batch.length} caption(s) to Ambi tab ${ambiTabId}`);

  for (const caption of batch) {
    try {
      await chrome.tabs.sendMessage(ambiTabId, {
        type: 'AMBI_INJECT_CAPTION',
        speaker: caption.speaker,
        text: caption.text,
        timestamp: caption.timestamp
      });
      totalRelayed++;
    } catch (err) {
      // Content script likely not loaded — inject it and retry
      warn('sendMessage failed:', err.message || err, '— injecting content script');
      ambiTabInjected = false;
      try {
        await ensureContentScript(ambiTabId);
        // Retry sending this caption after injection
        await chrome.tabs.sendMessage(ambiTabId, {
          type: 'AMBI_INJECT_CAPTION',
          speaker: caption.speaker,
          text: caption.text,
          timestamp: caption.timestamp
        });
        totalRelayed++;
        log('Retry succeeded after injection');
      } catch (retryErr) {
        warn('Retry also failed:', retryErr.message || retryErr);
        ambiTabId = null;
        ambiTabInjected = false;
        captionBuffer.push(...batch.slice(batch.indexOf(caption)));
        break;
      }
    }
  }
}

/* ── Periodic flush ── */
setInterval(flushBuffer, FLUSH_INTERVAL_MS);

/* ── Listen for messages ── */

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'AMBI_CAPTION') {
    log(`Received caption from Meet: ${msg.speaker}: ${msg.text.substring(0, 60)}`);
    captionBuffer.push({
      speaker: msg.speaker,
      text: msg.text,
      timestamp: msg.timestamp
    });
    return;
  }

  // Popup asking to start/stop
  if (msg.type === 'AMBI_START_CAPTURE' || msg.type === 'AMBI_STOP_CAPTURE') {
    // Forward to all Meet tabs
    chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });

    chrome.storage.local.set({ ambiCapturing: msg.type === 'AMBI_START_CAPTURE' });
    return;
  }

  // Popup requesting status — forward to Meet tab
  if (msg.type === 'AMBI_STATUS_REQUEST') {
    chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
    return;
  }

  // Popup setting the Ambi tab URL manually
  if (msg.type === 'AMBI_SET_TAB') {
    ambiTabId = msg.tabId;
    return;
  }
});

/* ── Track tab changes ── */
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === ambiTabId) {
    ambiTabId = null;
    ambiTabInjected = false;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && (
    tab.url.includes('localhost:5173') ||
    tab.url.includes('localhost:3000') ||
    tab.url.includes('ambi') ||
    tab.url.includes('vercel.app')
  )) {
    ambiTabId = tabId;
    // Reset injection flag so content script gets re-injected after navigation/HMR
    if (changeInfo.status === 'loading') {
      ambiTabInjected = false;
    }
  }
});

console.log('[Ambi] Background service worker loaded');
