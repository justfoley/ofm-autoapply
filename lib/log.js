// Cap on stored log entries so chrome.storage.local (5MB quota for unpacked
// extensions using the default storage area) can't grow unbounded over a long
// install lifetime. Oldest entries fall off first.
export const LOG_MAX_ENTRIES = 500;

const VALID_OUTCOMES = ['applied', 'applied-unconfirmed', 'needs-manual'];

/**
 * Build one human-readable activity log entry for a posting the extension
 * acted on. Three outcomes, matching lib/apply.js:
 *   - 'applied': clicked Apply and the DOM confirmed it (button
 *     disabled/relabeled, or the card left the feed).
 *   - 'applied-unconfirmed': clicked Apply but no DOM confirmation was
 *     observed - honestly reported, not asserted as a success.
 *   - 'needs-manual': never clicked - the extension couldn't safely
 *     determine what to do from the DOM alone (see lib/apply-eligibility.js).
 *
 * @param {object} params
 * @param {{id: string, title: string, categories: string[], url: string}} params.posting
 * @param {'applied'|'applied-unconfirmed'|'needs-manual'} params.outcome
 * @param {string} [params.timestamp] ISO 8601; defaults to now.
 * @param {string} [params.reason] - why it was needs-manual, if applicable.
 */
export function createLogEntry({ posting, outcome, timestamp = new Date().toISOString(), reason }) {
  if (!VALID_OUTCOMES.includes(outcome)) {
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
