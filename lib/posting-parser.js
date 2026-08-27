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

const POSTING_HREF_RE = /^\/dashboard\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * @typedef {object} RawJobCard
 * @property {?string} href - the posting link's href, e.g. "/dashboard/jobs/{uuid}".
 * @property {?string} ariaLabel - the posting link's aria-label, e.g. "View Reddit Manager".
 * @property {string[]} [categoryTexts] - textContent of each [aria-label="Category"] span.
 */

/**
 * @typedef {object} Posting
 * @property {string} id
 * @property {string} title
 * @property {string[]} categories
 * @property {string} url
 */

/**
 * @param {RawJobCard} raw
 * @returns {Posting|null} null if `href` isn't a real posting detail URL
 *   (e.g. the "/dashboard/jobs/saved" nav link, which is not a job card but
 *   can share ancestry with them in some layouts).
 */
export function parseJobCard({ href, ariaLabel, categoryTexts = [] }) {
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
  };
}
