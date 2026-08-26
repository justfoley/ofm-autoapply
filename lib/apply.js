// INTEGRATION BOUNDARY - NOT YET IMPLEMENTED.
//
// Live inspection of the real "Apply" action (same-page button vs. modal vs.
// full application form) was blocked for the same reason as lib/feed.js - see
// that file's header and the README "Known gaps" section.
//
// Per the launch brief: never invent a fake or partial submission. If the
// real apply flow needs form fields (cover letter, screening questions, etc.)
// that can't be filled from information already available to the extension,
// this must resolve to status 'needs-manual' rather than guessing at content -
// that posting then gets logged as skipped-manual, not silently dropped.
//
// Once live inspection is available, implement the real click-through /
// content-script logic here and decide per-posting whether it qualifies for
// full auto-apply or must fall back to 'needs-manual'.

/**
 * Attempt to complete the real apply action for one posting.
 *
 * @param {{id: string, title: string, category: string, url: string}} posting
 * @returns {Promise<{status: 'applied'|'needs-manual', reason?: string}>}
 */
export async function applyToPosting(posting) {
  throw new Error('applyToPosting() not implemented - pending live ofmjobs.com apply-flow inspection');
}
