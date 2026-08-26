// Pure decision logic for the apply flow, kept separate from the DOM-walking
// shims in lib/apply.js so it can be unit-tested without a browser.
//
// Captain-confirmed (relayed by firstmate, see AGENTS.md): clicking Apply
// submits immediately in place - no confirmation modal, no form. Whether the
// captain is qualified for a posting is decided server-side, invisible to
// the client, so that is NOT something to gate the click on. "Needs manual
// application" is reserved for cases where the extension genuinely cannot
// determine what to do from the DOM alone: no Apply button on the card, the
// button already looks applied/disabled, or the posting wasn't found on the
// page at all.

/**
 * @typedef {object} CardApplyState
 * @property {boolean} found - whether the posting's job card was located on
 *   the page at all.
 * @property {boolean} [hasApplyButton] - only meaningful when found is true.
 * @property {boolean} [isDisabled]
 * @property {string} [label] - the button's current trimmed text, e.g. "Apply".
 */

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
 * @param {CardApplyState} postClickState
 * @returns {'applied'|'applied-unconfirmed'}
 */
export function interpretPostClickState(postClickState) {
  if (!postClickState.found) return 'applied'; // card disappeared from the feed
  if (!postClickState.hasApplyButton) return 'applied-unconfirmed'; // ambiguous: card stayed, button vanished
  if (postClickState.isDisabled) return 'applied';
  if (postClickState.label && postClickState.label !== 'Apply') return 'applied'; // e.g. relabeled "Applied"
  return 'applied-unconfirmed';
}
