// Cap on stored log entries so chrome.storage.local (5MB quota for unpacked
// extensions using the default storage area) can't grow unbounded over a long
// install lifetime. Oldest entries fall off first.
export const LOG_MAX_ENTRIES = 500;

/**
 * Build one human-readable activity log entry for a posting the extension
 * either auto-applied to or skipped because it needed manual application.
 *
 * @param {object} params
 * @param {{id: string, title: string, categories: string[], url: string}} params.posting
 * @param {'applied'|'skipped-manual'} params.outcome
 * @param {string} [params.timestamp] ISO 8601; defaults to now.
 * @param {string} [params.reason] - why it was skipped-manual, if applicable.
 */
export function createLogEntry({ posting, outcome, timestamp = new Date().toISOString(), reason }) {
  if (outcome !== 'applied' && outcome !== 'skipped-manual') {
    throw new Error(`Invalid log outcome: ${outcome}`);
  }

  const entry = {
    id: posting.id,
    title: posting.title,
    categories: posting.categories,
    url: posting.url,
    outcome,
    timestamp,
  };
  if (reason) entry.reason = reason;
  return entry;
}

/**
 * Prepend a new entry to the log (newest first) and enforce LOG_MAX_ENTRIES.
 * Returns a new array; does not mutate the input.
 *
 * @param {Array<object>} log
 * @param {object} entry
 * @returns {Array<object>}
 */
export function appendLogEntry(log, entry) {
  const next = [entry, ...log];
  return next.length > LOG_MAX_ENTRIES ? next.slice(0, LOG_MAX_ENTRIES) : next;
}
