// Pure data-shaping for one job card's raw, already-DOM-decoded strings into
// the posting shape the rest of the extension uses. Deliberately has no DOM
// dependency so it can be unit-tested without a browser - the actual DOM
// walking lives in lib/feed.js's extractRawCardsFromPage(), which runs inside
// a real tab via chrome.scripting and must stay a thin, untested shim.
//
// Confirmed against a captain-supplied authenticated DOM dump of the
// dashboard "find jobs" feed (see AGENTS.md): each job card is a
// `[data-slot="job-card"]` containing an `<a aria-label="View {title}"
// href="/dashboard/jobs/{uuid}">` and one-or-more
// `[aria-label="Category"]` spans (a posting can carry multiple categories).
//
// The same card also carries a row of small badges (part-time/full-time,
// tests, application questions, languages, tools), each an icon + plain text
// span with no aria-label - see lib/feed.js's badge-text extraction. A
// posting whose card shows a "N questions" and/or "N tests" badge requires
// more than the plain immediate-submit Apply click (confirmed live, logged
// out, against a public https://ofmjobs.com/find-jobs/{uuid} preview page:
// the badge maps to a real numbered "Application Questions" list). Those
// counts are threaded onto the Posting shape here so lib/apply-eligibility.js
// can gate on them before ever touching the DOM/tab.

const POSTING_HREF_RE = /^\/dashboard\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * @typedef {object} RawJobCard
 * @property {?string} href - the posting link's href, e.g. "/dashboard/jobs/{uuid}".
 * @property {?string} ariaLabel - the posting link's aria-label, e.g. "View Reddit Manager".
 * @property {string[]} [categoryTexts] - textContent of each [aria-label="Category"] span.
 * @property {string} [questionBadgeText] - textContent of the card's "N questions" badge span, if any.
 * @property {string} [testBadgeText] - textContent of the card's "N tests" badge span, if any.
 */

/**
 * @typedef {object} Posting
 * @property {string} id
 * @property {string} title
 * @property {string[]} categories
 * @property {string} url
 * @property {number} questionCount - 0 when the card shows no "questions" badge.
 * @property {number} testCount - 0 when the card shows no "tests" badge.
 */

/**
 * @param {string} badgeText e.g. "2 questions", "1 test", or "" when absent.
 * @returns {number}
 */
function parseBadgeCount(badgeText) {
  const match = typeof badgeText === 'string' && badgeText.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * @param {RawJobCard} raw
 * @returns {Posting|null} null if `href` isn't a real posting detail URL
 *   (e.g. the "/dashboard/jobs/saved" nav link, which is not a job card but
 *   can share ancestry with them in some layouts).
 */
export function parseJobCard({ href, ariaLabel, categoryTexts = [], questionBadgeText = '', testBadgeText = '' }) {
  const idMatch = typeof href === 'string' && href.match(POSTING_HREF_RE);
  if (!idMatch) return null;

  const id = idMatch[1];
  const title = (ariaLabel || '').replace(/^View\s+/, '').trim();
  const categories = categoryTexts.map((text) => text.trim()).filter(Boolean);

  return {
    id,
    title,
    categories,
    url: `https://ofmjobs.com/dashboard/jobs/${id}`,
    questionCount: parseBadgeCount(questionBadgeText),
    testCount: parseBadgeCount(testBadgeText),
  };
}
