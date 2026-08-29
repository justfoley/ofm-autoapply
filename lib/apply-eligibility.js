// Pure decision logic for the apply flow, kept separate from the DOM-walking
// shims in lib/apply.js so it can be unit-tested without a browser.
//
// Captain-confirmed (relayed by firstmate, see AGENTS.md): clicking Apply
// submits immediately in place - no confirmation modal, no form - but only
// for postings that require no application questions or tests. A posting
// whose feed card carries a "N questions" and/or "N tests" badge
// (lib/posting-parser.js's questionCount/testCount) needs more than that
// single click and must never be auto-clicked; canAutoApplyPosting() gates
// on that before lib/apply.js ever opens a tab. Whether the captain is
// qualified for a posting is decided server-side, invisible to the client,
// so that is NOT something to gate the click on. "Needs manual application"
// is reserved for cases where the extension genuinely cannot determine what
// to do from the DOM alone: no Apply button on the card, the button already
// looks applied/disabled, or the posting wasn't found on the page at all.
// "Needs questions" (lib/log.js) covers both the feed-badge gate above and
// the post-click backstop below, for postings that turn out to need more
// than one click despite carrying no badge.

/**
 * @typedef {object} CardApplyState
 * @property {boolean} found - whether the posting's job card was located on
 *   the page at all.
 * @property {boolean} [hasApplyButton] - only meaningful when found is true.
 * @property {boolean} [isDisabled]
 * @property {string} [label] - the button's current trimmed text, e.g. "Apply".
 * @property {boolean} [dialogOpened] - post-click only: a `[role="dialog"]`
 *   element was present on the page after the click (see lib/apply.js).
 * @property {boolean} [navigatedAwayFromFeed] - post-click only: the tab's
 *   URL changed away from the feed listing after the click.
 */

/**
 * Decide whether a posting can be auto-applied to at all, from feed-scraped
 * data alone - no tab/DOM needed. A posting that carries required
 * application questions or skills tests must never be auto-clicked: the
 * captain-confirmed "submits immediately, no form" behavior was only ever
 * observed for a posting with neither (see AGENTS.md and this project's
 * report.md for the investigation this codifies).
 *
 * @param {{questionCount?: number, testCount?: number}} posting
 * @returns {{eligible: boolean, reason?: string}}
 */
export function canAutoApplyPosting(posting) {
  if ((posting.questionCount || 0) > 0 || (posting.testCount || 0) > 0) {
    return { eligible: false, reason: 'requires-application-questions' };
  }
  return { eligible: true };
}

/**
 * Decide whether it's safe to click a posting's Apply button, given only
 * what's directly observable on its job card.
 *
 * @param {CardApplyState} cardState
 * @returns {{eligible: boolean, reason?: string}}
 */
export function canClickApply(cardState) {
  if (!cardState.found) {
    return { eligible: false, reason: 'posting-not-found-in-page' };
  }
  if (!cardState.hasApplyButton) {
    return { eligible: false, reason: 'apply-button-not-found' };
  }
  if (cardState.isDisabled || (cardState.label && cardState.label !== 'Apply')) {
    return { eligible: false, reason: 'already-applied-or-disabled' };
  }
  return { eligible: true };
}

/**
 * Interpret DOM feedback observed shortly after clicking Apply. Since the
 * real flow has no client-visible confirmation step, this only recognizes
 * the concrete signals the captain described: the card disappearing from
 * the feed, or its Apply button becoming disabled or relabeled (e.g.
 * "Applied"). Anything else is honestly reported as unconfirmed rather than
 * assumed successful.
 *
 * Checked first, ahead of all of that: a dialog appearing or the tab
 * navigating away from the feed. Both are backstops against the exact
 * misfire this project's investigation (report.md, "What does the current
 * code actually do") found - without them, a posting whose Apply click
 * navigates to a question form (rather than submitting) would otherwise
 * read as `found: false` on the next check and be misreported as `applied`,
 * a false positive rather than a safe skip. This applies regardless of
 * canAutoApplyPosting()'s feed-badge gate, as a catch-all for any posting
 * that turns out to need more than one click despite carrying no badge.
 *
 * @param {CardApplyState} postClickState
 * @returns {'applied'|'applied-unconfirmed'|'needs-questions'}
 */
export function interpretPostClickState(postClickState) {
  if (postClickState.dialogOpened || postClickState.navigatedAwayFromFeed) return 'needs-questions';
  if (!postClickState.found) return 'applied'; // card disappeared from the feed
  if (!postClickState.hasApplyButton) return 'applied-unconfirmed'; // ambiguous: card stayed, button vanished
  if (postClickState.isDisabled) return 'applied';
  if (postClickState.label && postClickState.label !== 'Apply') return 'applied'; // e.g. relabeled "Applied"
  return 'applied-unconfirmed';
}

/**
 * Companion to interpretPostClickState(): when it returns 'needs-questions'
 * via the dialog/navigation backstop (as opposed to the feed-badge gate in
 * canAutoApplyPosting), this names which specific signal triggered it, for
 * the log entry's `reason` field.
 *
 * @param {{dialogOpened?: boolean, navigatedAwayFromFeed?: boolean}} postClickState
 * @returns {string|undefined}
 */
export function describeUnexpectedApplyState(postClickState) {
  if (postClickState.dialogOpened) return 'apply-opened-a-dialog';
  if (postClickState.navigatedAwayFromFeed) return 'apply-navigated-away-from-feed';
  return undefined;
}
