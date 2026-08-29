// Cap on stored log entries so chrome.storage.local (5MB quota for unpacked
// extensions using the default storage area) can't grow unbounded over a long
// install lifetime. Oldest entries fall off first.
export const LOG_MAX_ENTRIES = 500;

const VALID_OUTCOMES = ['applied', 'applied-unconfirmed', 'needs-manual', 'needs-questions'];

/**
 * Build one human-readable activity log entry for a posting the extension
 * acted on. Four outcomes, matching lib/apply.js:
 *   - 'applied': clicked Apply and the DOM confirmed it (button
 *     disabled/relabeled, or the card left the feed).
 *   - 'applied-unconfirmed': clicked Apply but no DOM confirmation was
 *     observed - honestly reported, not asserted as a success.
 *   - 'needs-manual': never clicked - the extension couldn't safely
 *     determine what to do from the DOM alone (see lib/apply-eligibility.js).
 *   - 'needs-questions': never safely completed because the posting requires
 *     answering application questions/tests beyond a single click - either
 *     detected up front from the feed card's badge, or as a post-click
 *     backstop when a dialog/navigation appeared unexpectedly (see
 *     lib/apply-eligibility.js's canAutoApplyPosting/interpretPostClickState).
 *     Distinct from 'needs-manual' so the popup can point the captain
 *     straight at postings that need their own answers.
 *
 * @param {object} params
 * @param {{id: string, title: string, categories: string[], url: string}} params.posting
 * @param {'applied'|'applied-unconfirmed'|'needs-manual'|'needs-questions'} params.outcome
 * @param {string} [params.timestamp] ISO 8601; defaults to now.
 * @param {string} [params.reason] - why it was needs-manual/needs-questions, if applicable.
 * @param {Array<{question: string, matchedAnswerId: string|null, matchedQuestion: string|null, confidence: number}>} [params.screeningMatches] -
 *   audit trail from lib/question-matcher.js for a screening-questions
 *   posting (see lib/screening-apply.js): which stored answer, if any,
 *   matched each live question, for the captain to review later.
 */
export function createLogEntry({ posting, outcome, timestamp = new Date().toISOString(), reason, screeningMatches }) {
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
  if (screeningMatches && screeningMatches.length > 0) {
    entry.screeningMatches = screeningMatches.map(({ question, matchedAnswerId, matchedQuestion, confidence }) => ({
      question,
      matchedAnswerId,
      matchedQuestion,
      confidence,
    }));
  }
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
