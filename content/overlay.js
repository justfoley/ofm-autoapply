// Renders the ofmjobs.com tab "lock" overlay / idle corner indicator. Runs
// both as a manifest-declared content script (manifest.json's
// content_scripts, for tabs that load/reload after install) and via
// chrome.scripting.executeScript's `files` fallback (background/service-worker.js's
// injectOverlayIntoOpenTabs, for tabs already open at install/update time) -
// so, like lib/feed.js's/lib/apply.js's DOM-walking functions (see
// AGENTS.md), it must stay fully self-contained: no imports, only chrome.*
// APIs and the DOM. The tiny display-text/countdown logic below is a
// deliberate, minimal duplicate of lib/activity.js's pure functions (which
// are the ones covered by unit tests) - keep the two in sync if the activity
// record's shape or wording changes.
(function () {
  const ACTIVITY_STORAGE_KEY = 'ofmAutoApplyActivity';
  const ROOT_ID = 'ofm-autoapply-overlay-root';

  // Guards against double-injection: the declarative content script and the
  // onInstalled/onStartup executeScript fallback can both fire for the same
  // tab (e.g. a tab that reloads right around an extension update).
  if (document.getElementById(ROOT_ID)) return;

  function secondsUntil(targetMs, nowMs) {
    if (typeof targetMs !== 'number' || Number.isNaN(targetMs)) return null;
    return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
  }

  function isCycleActive(activity) {
    return Boolean(activity.masterEnabled) && (activity.status === 'polling' || activity.status === 'applying');
  }

  function describeActivity(activity, nowMs) {
    if (!activity || !activity.masterEnabled) return '';
    if (activity.status === 'polling') return 'ofm-autoapply is checking for new postings...';
    if (activity.status === 'applying') {
      return `ofm-autoapply is applying to "${activity.postingTitle || 'posting'}"...`;
    }
    const seconds = secondsUntil(activity.nextAlarmAt, nowMs);
    return seconds === null ? 'ofm-autoapply is idle' : `ofm-autoapply: next check in ${seconds}s`;
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;
  // Shadow DOM keeps the overlay's styling fully isolated from (and immune
  // to) whatever CSS the ofmjobs.com page itself ships.
  const shadow = root.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      background: rgba(15, 15, 20, 0.45);
      color: #fff;
      font: 600 17px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: center;
      padding: 24px;
    }
    .overlay[hidden] { display: none; }
    .overlay-text {
      max-width: 420px;
      background: rgba(0, 0, 0, 0.35);
      border-radius: 10px;
      padding: 18px 22px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
    }
    .corner {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 2147483647;
      background: rgba(20, 20, 25, 0.85);
      color: #fff;
      font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif;
      padding: 6px 10px;
      border-radius: 6px;
      pointer-events: none;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    .corner[hidden] { display: none; }
  `;
  shadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;
  const overlayText = document.createElement('div');
  overlayText.className = 'overlay-text';
  overlay.appendChild(overlayText);
  shadow.appendChild(overlay);

  const corner = document.createElement('div');
  corner.className = 'corner';
  corner.hidden = true;
  shadow.appendChild(corner);

  function mountIfNeeded() {
    if (!root.isConnected && document.documentElement) {
      document.documentElement.appendChild(root);
    }
  }

  let tickTimer = null;

  function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  function render(activity) {
    if (!activity || !activity.masterEnabled) {
      overlay.hidden = true;
      corner.hidden = true;
      stopTick();
      return;
    }

    mountIfNeeded();

    if (isCycleActive(activity)) {
      corner.hidden = true;
      stopTick();
      overlay.hidden = false;
      overlayText.textContent = describeActivity(activity, Date.now());
    } else {
      overlay.hidden = true;
      corner.hidden = false;
      stopTick();
      corner.textContent = describeActivity(activity, Date.now());
      // The countdown ticks locally against the fixed nextAlarmAt timestamp
      // already in `activity` - no new storage reads/writes every second
      // (see lib/activity.js).
      tickTimer = setInterval(() => {
        corner.textContent = describeActivity(activity, Date.now());
      }, 1000);
    }
  }

  chrome.storage.local.get(ACTIVITY_STORAGE_KEY, (result) => {
    render(result[ACTIVITY_STORAGE_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[ACTIVITY_STORAGE_KEY]) return;
    render(changes[ACTIVITY_STORAGE_KEY].newValue);
  });
})();
