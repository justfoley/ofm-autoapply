// Lightweight, frequently-updated "what is the extension doing right now"
// record, stored under its own chrome.storage.local key - deliberately
// separate from STORAGE_KEY (lib/storage.js). Poll-cycle phase transitions
// (idle -> polling -> applying -> idle) write here on every transition, and
// must not go through STORAGE_KEY: background/service-worker.js's
// chrome.storage.onChanged listener only resyncs the alarm on a
// masterEnabled flip there, and bundling fast-changing activity into the
// same blob as the captain's settings/log would write-amplify through (and
// risk falsely retriggering) that listener.
//
// The live per-second countdown shown in the popup and the tab overlay is
// NOT achieved by writing storage every second - nextAlarmAt is a fixed
// target timestamp written once per idle transition, and each reader
// (popup/content script) recomputes secondsUntil() locally against
// Date.now() on its own 1s timer.
export const ACTIVITY_STORAGE_KEY = 'ofmAutoApplyActivity';

/**
 * @typedef {object} ActivityRecord
 * @property {boolean} masterEnabled
 * @property {'idle'|'polling'|'applying'} status - only meaningful while masterEnabled.
 * @property {string|null} postingTitle - set when status === 'applying'.
 * @property {number|null} nextAlarmAt - epoch ms of the next scheduled poll;
 *   set when status === 'idle' and masterEnabled, null otherwise.
 */

/** @returns {ActivityRecord} */
export function getDefaultActivity() {
  return { masterEnabled: false, status: 'idle', postingTitle: null, nextAlarmAt: null };
}

/**
 * @param {{get: Function, set: Function}} storageArea - defaults to
 *   chrome.storage.local; a test can inject an in-memory mock with the same
 *   get(key)/set(obj) promise-based shape (see lib/storage.js).
 * @returns {Promise<ActivityRecord>}
 */
export async function loadActivity(storageArea = chrome.storage.local) {
  const result = await storageArea.get(ACTIVITY_STORAGE_KEY);
  const stored = result[ACTIVITY_STORAGE_KEY];
  return stored ? { ...getDefaultActivity(), ...stored } : getDefaultActivity();
}

/**
 * @param {ActivityRecord} activity
 * @param {{get: Function, set: Function}} storageArea
 */
export async function saveActivity(activity, storageArea = chrome.storage.local) {
  await storageArea.set({ [ACTIVITY_STORAGE_KEY]: activity });
}

/**
 * Seconds remaining until targetMs, clamped to >= 0.
 * @param {number|null|undefined} targetMs
 * @param {number} [nowMs]
 * @returns {number|null} null when targetMs isn't a usable timestamp.
 */
export function secondsUntil(targetMs, nowMs = Date.now()) {
  if (typeof targetMs !== 'number' || Number.isNaN(targetMs)) return null;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

/**
 * Whether a poll cycle is actively running right now - the window in which
 * the tab overlay should show its full blurring lock (see AGENTS.md /
 * README): fetching the feed through finishing any applies. Mirrors
 * background/service-worker.js's pollInProgress guard window.
 * @param {ActivityRecord} activity
 */
export function isCycleActive(activity) {
  return Boolean(activity.masterEnabled) && (activity.status === 'polling' || activity.status === 'applying');
}

/**
 * Human-readable status line shared by the popup header and the tab
 * overlay/corner indicator, so they never describe the same activity record
 * differently.
 * @param {ActivityRecord} activity
 * @param {number} [nowMs]
 */
export function describeActivity(activity, nowMs = Date.now()) {
  if (!activity || !activity.masterEnabled) return 'Off';
  if (activity.status === 'polling') return 'Checking feed for new postings...';
  if (activity.status === 'applying') {
    return `Applying to "${activity.postingTitle || 'posting'}"...`;
  }
  const seconds = secondsUntil(activity.nextAlarmAt, nowMs);
  return seconds === null ? 'Idle' : `Idle - next check in ${seconds}s`;
}
