import { DEFAULT_CATEGORIES } from './categories.js';

// Single-key blob in chrome.storage.local holding all extension state. Using
// one key (rather than scattering top-level keys) makes state reads/writes
// atomic from the extension's point of view and keeps the storage.onChanged
// listener in background/service-worker.js simple.
export const STORAGE_KEY = 'ofmAutoApplyState';

/**
 * @typedef {object} OfmAutoApplyState
 * @property {boolean} masterEnabled - Master on/off switch. Defaults to false
 *   so a fresh install never polls or applies before the captain configures
 *   categories and opts in.
 * @property {string[]} selectedCategories - Categories checked in the popup.
 * @property {string[]} knownCategories - Every category string observed on a
 *   real posting so far, seeded from lib/categories.js's DEFAULT_CATEGORIES.
 *   Grows over time (background/service-worker.js) instead of staying frozen
 *   on a guessed list, since the live site's full category taxonomy was not
 *   confirmed exhaustively - see AGENTS.md.
 * @property {string[]} seenIds - Posting ids already applied to or skipped as
 *   needing manual application; never re-acted on.
 * @property {Array<object>} log - Human-readable activity log, newest first.
 */

/** @returns {OfmAutoApplyState} */
export function getDefaultState() {
  return {
    masterEnabled: false,
    selectedCategories: [],
    knownCategories: [...DEFAULT_CATEGORIES],
    seenIds: [],
    log: [],
  };
}

/**
 * Load extension state, merging in defaults for any missing fields (e.g. on
 * first run, or after adding a new field in a future version).
 *
 * @param {{get: Function, set: Function}} storageArea - defaults to
 *   chrome.storage.local; a test can inject an in-memory mock with the same
 *   get(key)/set(obj) promise-based shape.
 * @returns {Promise<OfmAutoApplyState>}
 */
export async function loadState(storageArea = chrome.storage.local) {
  const result = await storageArea.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  return stored ? { ...getDefaultState(), ...stored } : getDefaultState();
}

/**
 * Persist extension state.
 *
 * @param {OfmAutoApplyState} state
 * @param {{get: Function, set: Function}} storageArea
 */
export async function saveState(state, storageArea = chrome.storage.local) {
  await storageArea.set({ [STORAGE_KEY]: state });
}
