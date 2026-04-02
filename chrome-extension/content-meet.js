/**
 * content-meet.js
 * Scrapes Google Meet live captions using a frequency-based approach:
 * instead of guessing CSS selectors, we watch for DOM text nodes that
 * change rapidly (captions update every ~200ms as words are spoken).
 * This is resilient to Meet's frequent DOM structure changes.
 */

(function ambiMeetCaptureBoot() {
  'use strict';

  const DEBUG = true;
  function log(...args) { if (DEBUG) console.log('%c[Ambi Meet]', 'color:#63d2be;font-weight:bold', ...args); }
  function warn(...args) { console.warn('%c[Ambi Meet]', 'color:#f5a623;font-weight:bold', ...args); }

  /* ── State ── */
  let capturing = false;
  let observer = null;
  let lastCaption = { speaker: '', text: '', ts: 0 };
  const DEDUP_WINDOW_MS = 1200;
  let captionsSent = 0;

  /*
   * Frequency tracker: Maps parent elements to { count, firstSeen, lastText }.
   * Caption nodes change text rapidly; toolbar/UI elements are mostly static.
   * Once an element has changed text 2+ times in 4 seconds, we treat it as
   * a caption source and send its content.
   */
  const changeTracker = new Map();
  const FREQ_WINDOW_MS = 4000;
  const MIN_CHANGES = 2;

  /* ── UI noise filter (final safety net) ── */
  const UI_NOISE = [
    /turn (on|off) (microphone|camera|captions)/i,
    /share screen|raise hand|send a reaction|more options|leave call/i,
    /meeting (details|tools)|chat with everyone|host controls?/i,
    /audio settings|video settings|call ends soon/i,
    /developing an extension|add-on would work better/i,
    /extensions frequently cause|browser-extension/i,
    /developers\.google\.com/i,
    /this call is open to anyone/i,
    /keyboard_arrow|closed_caption|back_hand|more_vert|call_end/i,
    /videocam|computer_arrow|meeting_room|lock_person|chat_bubble/i,
    /⌘|ctrl\s*\+\s*[a-z]/i,
    /^\s*\w{3}-\w{4}-\w{3}\s*$/,
  ];

  function isNoise(text) {
    if (!text || text.length < 2) return true;
    if (text.length > 300) return true;
    for (const pat of UI_NOISE) {
      if (pat.test(text)) return true;
    }
    return false;
  }

  /* ── Dedup ── */
  function isDuplicate(speaker, text) {
    const now = Date.now();
    if (speaker === lastCaption.speaker &&
        text === lastCaption.text &&
        now - lastCaption.ts < DEDUP_WINDOW_MS) return true;
    // Skip if new text is a substring of the last sent caption (already covered)
    if (speaker === lastCaption.speaker &&
        lastCaption.text.includes(text) &&
        now - lastCaption.ts < DEDUP_WINDOW_MS) return true;
    return false;
  }

  /*
   * ── Stabilization buffer ──
   * Meet captions are streaming/interim: text updates word-by-word as speech
   * is recognized ("talking" → "talking about" → "talking about this loyalty").
   * We buffer the latest text and only emit once it stops changing for STABLE_MS.
   */
  const STABLE_MS = 1500; // wait 1.5s of silence before emitting
  let pendingCaption = null; // { speaker, text, timer }

  function queueCaption(speaker, text) {
    if (isNoise(text)) return;

    // If there's already a pending caption from the same speaker and the new
    // text is an extension of it (or vice versa), just update the pending text.
    if (pendingCaption) {
      clearTimeout(pendingCaption.timer);

      // If different speaker, flush the old one immediately
      if (pendingCaption.speaker !== speaker) {
        flushPending();
      }
    }

    pendingCaption = {
      speaker,
      text,
      timer: setTimeout(flushPending, STABLE_MS)
    };
  }

  function flushPending() {
    if (!pendingCaption) return;
    const { speaker, text } = pendingCaption;
    clearTimeout(pendingCaption.timer);
    pendingCaption = null;
    sendCaption(speaker, text);
  }

  /* ── Send caption to background ── */
  function sendCaption(speaker, text) {
    if (isDuplicate(speaker, text)) return;
    if (isNoise(text)) return;

    lastCaption = { speaker, text, ts: Date.now() };
    captionsSent++;
    log(`#${captionsSent}: ${speaker}: ${text.substring(0, 100)}`);

    try {
      chrome.runtime.sendMessage({
        type: 'AMBI_CAPTION',
        speaker,
        text,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      warn('sendMessage failed:', err.message);
    }

    chrome.storage.local.set({ ambiCaptionCount: captionsSent });
  }

  /* ── Extract speaker name near a caption element ── */
  function findSpeakerNear(node) {
    let el = node;
    for (let i = 0; i < 6 && el; i++) {
      // Speaker avatar image
      const img = el.querySelector && el.querySelector('img[alt]');
      if (img && img.alt && img.alt.length > 1 && img.alt.length < 50) return img.alt;

      // Bold/strong text (speaker name label)
      const bold = el.querySelector && el.querySelector('strong, b');
      if (bold && bold.textContent?.trim().length > 1 &&
          bold.textContent.trim().length < 40) return bold.textContent.trim();

      el = el.parentElement;
    }
    return 'Participant';
  }

  /* ── Core: MutationObserver callback ── */
  function onMutation(mutations) {
    if (!capturing) return;

    const now = Date.now();

    for (const m of mutations) {
      let parentEl = null;
      let text = '';

      if (m.type === 'characterData') {
        // Text node changed
        parentEl = m.target.parentElement;
        text = m.target.textContent?.trim() || '';
      } else if (m.type === 'childList' && m.addedNodes.length > 0) {
        // New nodes added — check for text content
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE && added.textContent?.trim()) {
            parentEl = added.parentElement;
            text = added.textContent.trim();
            break;
          }
          if (added.nodeType === Node.ELEMENT_NODE) {
            const t = added.textContent?.trim();
            if (t && t.length > 2 && t.length < 300) {
              parentEl = added;
              text = t;
              break;
            }
          }
        }
      }

      if (!parentEl || !text || text.length < 2 || text.length > 300) continue;

      // Skip elements inside interactive/toolbar areas
      if (parentEl.closest &&
          parentEl.closest('button, [role="button"], [role="toolbar"], [role="menubar"], [role="menu"], nav, header, [role="navigation"]')) {
        continue;
      }

      // Skip elements in the top 60px (header bar)
      try {
        const rect = (parentEl.getBoundingClientRect ? parentEl : parentEl.parentElement)?.getBoundingClientRect();
        if (rect && (rect.top < 60 || rect.height > 250 || rect.width < 80)) continue;
      } catch { continue; }

      // Track change frequency for this parent element
      let tracker = changeTracker.get(parentEl);
      if (!tracker) {
        tracker = { count: 0, firstSeen: now, lastText: '' };
        changeTracker.set(parentEl, tracker);
      }

      // Reset tracker if it's stale (beyond the frequency window)
      if (now - tracker.firstSeen > FREQ_WINDOW_MS) {
        tracker.count = 0;
        tracker.firstSeen = now;
      }

      // Only count if text actually changed
      if (text !== tracker.lastText) {
        tracker.count++;
        tracker.lastText = text;
      }

      // Caption elements change at least MIN_CHANGES times within FREQ_WINDOW_MS
      if (tracker.count >= MIN_CHANGES) {
        const speaker = findSpeakerNear(parentEl);
        queueCaption(speaker, text);
      }
    }

    // Cleanup stale trackers periodically
    if (changeTracker.size > 100) {
      for (const [key, val] of changeTracker) {
        if (now - val.firstSeen > FREQ_WINDOW_MS * 2) changeTracker.delete(key);
      }
    }
  }

  /* ── Observer management ── */
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(onMutation);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    log('Observer started — tracking rapidly-changing text nodes');
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    changeTracker.clear();
    log('Observer stopped. Captions sent:', captionsSent);
  }

  /* ── Message handling ── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AMBI_START_CAPTURE') {
      if (!capturing) {
        capturing = true;
        startObserver();
        log('Capture STARTED');
      }
    }
    if (msg.type === 'AMBI_STOP_CAPTURE') {
      capturing = false;
      stopObserver();
      log('Capture STOPPED');
    }
    if (msg.type === 'AMBI_STATUS_REQUEST') {
      try {
        chrome.runtime.sendMessage({
          type: 'AMBI_STATUS_RESPONSE', capturing, captionsSent
        });
      } catch {}
    }
  });

  /* ── Auto-start if previously enabled ── */
  chrome.storage.local.get(['ambiCapturing'], (result) => {
    if (result.ambiCapturing) {
      capturing = true;
      startObserver();
      log('Auto-resumed from storage');
    }
  });

  /* ── Periodic diagnostics (every 5s when capturing) ── */
  setInterval(() => {
    if (!capturing) return;
    const active = [];
    for (const [el, val] of changeTracker) {
      if (val.count >= MIN_CHANGES) {
        active.push({
          tag: el.tagName || '?',
          cls: (el.className || '').substring(0, 30),
          changes: val.count,
          text: val.lastText?.substring(0, 60)
        });
      }
    }
    active.sort((a, b) => b.changes - a.changes);
    log(`Tracking ${changeTracker.size} elements, ${active.length} active caption sources, ${captionsSent} total sent`);
    if (active.length > 0) log('Top sources:', active.slice(0, 3));
    if (active.length === 0 && captionsSent === 0) {
      warn('No caption nodes detected yet. Make sure captions are enabled in Google Meet (press C).');
    }
  }, 5000);

  log('Content script loaded on', window.location.href);
})();
