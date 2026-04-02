/**
 * content-ambi.js
 * Injected into the Ambi app tab. Receives caption messages from the
 * background service worker and forwards them to the page via postMessage,
 * where the React app picks them up.
 */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AMBI_INJECT_CAPTION') {
    console.log('%c[Ambi Bridge]', 'color:#63d2be;font-weight:bold',
      `Relaying to React: ${msg.speaker}: ${msg.text?.substring(0, 60)}`);
    window.postMessage({
      type: 'AMBI_CAPTION_FROM_EXTENSION',
      speaker: msg.speaker,
      text: msg.text,
      timestamp: msg.timestamp
    }, '*');
  }
});

console.log('%c[Ambi Bridge]', 'color:#63d2be;font-weight:bold', 'Content script loaded on', window.location.href);
