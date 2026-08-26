import { canClickApply, interpretPostClickState } from './apply-eligibility.js';

// Same inference/caveat as lib/feed.js's FEED_URL - the Apply button is
// confirmed to be inline on the job card in the listing page (not a
// navigate-away flow), so re-opening the listing is how we reach it.
const FEED_URL = 'https://ofmjobs.com/dashboard/jobs';

// Captain-confirmed: clicking Apply submits immediately in place, no modal
// or form. This is just enough of a pause for the DOM to reflect that (a
// button becoming disabled/relabeled, or the card leaving the feed) before
// we read it back.
const POST_CLICK_SETTLE_MS = 800;

/**
 * Runs inside the target tab via chrome.scripting.executeScript - must stay
 * self-contained (args only, no closures/imports). Reused both before and
 * after the click so pre- and post-click state are read the same way.
 *
 * Confirmed against the captain-supplied DOM dump: a posting's Apply button
 * is the `<button>` inside its `[data-slot="job-card"]` whose text starts
 * with "Apply" (also true once relabeled "Applied"), alongside the posting
 * link `a[href="/dashboard/jobs/{id}"]`.
 */
function getCardApplyState(postingId) {
  const link = document.querySelector(`a[href="/dashboard/jobs/${postingId}"]`);
  const card = link ? link.closest('[data-slot="job-card"]') : null;
  if (!card) return { found: false };

  const applyButton = Array.from(card.querySelectorAll('button')).find((button) =>
    (button.textContent || '').trim().startsWith('Apply'),
  );
  if (!applyButton) return { found: true, hasApplyButton: false };

  return {
    found: true,
    hasApplyButton: true,
    isDisabled: applyButton.disabled || applyButton.getAttribute('aria-disabled') === 'true',
    label: (applyButton.textContent || '').trim(),
  };
}

/** Runs inside the target tab. See getCardApplyState for the button lookup. */
function clickApplyButtonForPosting(postingId) {
  const link = document.querySelector(`a[href="/dashboard/jobs/${postingId}"]`);
  const card = link ? link.closest('[data-slot="job-card"]') : null;
  const applyButton = card
    ? Array.from(card.querySelectorAll('button')).find((button) => (button.textContent || '').trim().startsWith('Apply'))
    : null;
  if (!applyButton) return false;
  applyButton.click();
  return true;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCardState(tabId, postingId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: getCardApplyState,
    args: [postingId],
  });
  return result;
}

/**
 * Attempt to complete the real apply action for one posting: click its
 * inline Apply button, which submits immediately (captain-confirmed: no
 * modal, no form - server-side qualification isn't visible to the client).
 *
 * Never invents a fake or partial submission: a posting whose card can't be
 * safely acted on (no Apply button, already applied/disabled, not found) is
 * resolved to 'needs-manual' without clicking anything, and a click whose
 * outcome can't be confirmed from the DOM is honestly reported as
 * 'applied-unconfirmed' rather than asserted as a success.
 *
 * @param {import('./posting-parser.js').Posting} posting
 * @returns {Promise<{status: 'applied'|'applied-unconfirmed'|'needs-manual', reason?: string}>}
 */
export async function applyToPosting(posting) {
  const tab = await chrome.tabs.create({ url: FEED_URL, active: false });
  try {
    await waitForTabComplete(tab.id);

    const preClickState = await readCardState(tab.id, posting.id);
    const eligibility = canClickApply(preClickState);
    if (!eligibility.eligible) {
      return { status: 'needs-manual', reason: eligibility.reason };
    }

    const [{ result: clicked }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickApplyButtonForPosting,
      args: [posting.id],
    });
    if (!clicked) {
      // The pre-click check just passed, but the DOM could have changed
      // between that read and this click (e.g. the captain applied manually
      // in the meantime).
      return { status: 'needs-manual', reason: 'apply-button-not-found' };
    }

    await delay(POST_CLICK_SETTLE_MS);

    const postClickState = await readCardState(tab.id, posting.id);
    return { status: interpretPostClickState(postClickState) };
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
