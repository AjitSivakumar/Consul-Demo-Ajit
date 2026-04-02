/**
 * popup.js — Extension popup logic
 */

const meetDot = document.getElementById('meetDot');
const meetStatus = document.getElementById('meetStatus');
const captureDot = document.getElementById('captureDot');
const captureStatus = document.getElementById('captureStatus');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const countLabel = document.getElementById('countLabel');

let isCapturing = false;

/* ── Check state on open ── */

chrome.storage.local.get(['ambiCapturing', 'ambiCaptionCount'], (result) => {
  isCapturing = result.ambiCapturing || false;
  updateUI(isCapturing);

  if (result.ambiCaptionCount) {
    countLabel.textContent = `${result.ambiCaptionCount} captions sent this session`;
  }
});

// Check if a Meet tab exists
chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
  if (tabs.length > 0) {
    meetDot.classList.add('active');
    meetDot.classList.remove('inactive');
    meetStatus.innerHTML = '<strong>Google Meet</strong> detected';
  } else {
    meetDot.classList.add('inactive');
    meetDot.classList.remove('active');
    meetStatus.textContent = 'No Google Meet tab found';
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
  }
});

/* ── Buttons ── */

startBtn.addEventListener('click', () => {
  isCapturing = true;
  chrome.runtime.sendMessage({ type: 'AMBI_START_CAPTURE' });
  chrome.storage.local.set({ ambiCapturing: true, ambiCaptionCount: 0 });
  updateUI(true);
});

stopBtn.addEventListener('click', () => {
  isCapturing = false;
  chrome.runtime.sendMessage({ type: 'AMBI_STOP_CAPTURE' });
  chrome.storage.local.set({ ambiCapturing: false });
  updateUI(false);
});

function updateUI(capturing) {
  if (capturing) {
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    captureDot.classList.add('active');
    captureDot.classList.remove('inactive');
    captureStatus.innerHTML = '<strong>Capturing</strong> captions → Ambi';
  } else {
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    captureDot.classList.add('inactive');
    captureDot.classList.remove('active');
    captureStatus.textContent = 'Not capturing';
  }
}
