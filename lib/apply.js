import { canAttemptAutoApply } from './apply-eligibility.js';

// Same inference/caveat as lib/feed.js's FEED_URL - the Apply button is
// confirmed to be inline on the job card in the listing page (not a
// navigate-away flow), so re-opening the listing is how we reach it.
const FEED_URL = 'https://ofmjobs.com/dashboard/jobs';

// After clicking Apply, give the app a moment to react (toast, dialog,
// redirect, etc.) before checking what happened. Arbitrary but generous;
// tighten once the real timing is confirmed.
const POST_CLICK_SETTLE_MS = 1500;

/**
 * Runs inside the target tab via chrome.scripting.executeScript - must stay
 * self-contained (args only, no closures/imports).
 *
 * Confirmed against the captain-supplied DOM dump: a posting's Apply button
 * is the `<button>` inside its `[data-slot="job-card"]` whose text includes
 * "Apply" (it also renders a lock icon, alongside the posting link
 * `a[href="/dashboard/jobs/{id}"]`).
 */
function clickApplyButtonForPosting(postingId) {
  const link = document.querySelector(`a[href="/dashboard/jobs/${postingId}"]`);
  const card = link ? link.closest('[data-slot="job-card"]') : null;
  if (!card) return { clicked: false, reason: 'posting-not-found-in-page' };

  const applyButton = Array.from(card.querySelectorAll('button')).find((button) =>
    (button.textContent || '').includes('Apply'),
  );
  if (!applyButton) return { clicked: false, reason: 'apply-button-not-found' };

  applyButton.click();
  return { clicked: true };
}

/**
 * Runs inside the target tab via chrome.scripting.executeScript.
 *
 * TODO(unconfirmed): the real post-click UI (silent success vs. confirmation
 * modal vs. multi-field form) has not been observed - firstmate is relaying
 * what the captain sees after a real click. This uses "a dialog opened" as a
 * proxy for "the flow needs input we can't safely provide", since the app is
 * confirmed to use Radix UI elsewhere (the sort dropdown renders
 * data-state="closed"/"open" the same way), so its modals are expected to
 * follow the same `[role="dialog"]` pattern. Tighten/replace once confirmed.
 */
function hasOpenDialogAfterApply() {
  return Boolean(document.querySelector('[role="dialog"]'));
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

/**
 * Attempt to complete the real apply action for one posting.
 *
 * Never invents a fake or partial submission: a posting whose card already
 * shows required tests/questions is resolved to 'needs-manual' before ever
 * clicking Apply (see lib/apply-eligibility.js), and one that turns out to
 * open a confirmation dialog/form after the click is also resolved to
 * 'needs-manual' rather than guessing at its fields.
 *
 * @param {import('./posting-parser.js').Posting} posting
 * @returns {Promise<{status: 'applied'|'needs-manual', reason?: string}>}
 */
export async function applyToPosting(posting) {
  if (!canAttemptAutoApply(posting)) {
    return { status: 'needs-manual', reason: 'requires-tests-or-questions' };
  }

  const tab = await chrome.tabs.create({ url: FEED_URL, active: false });
  try {
    await waitForTabComplete(tab.id);

    const [{ result: clickResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickApplyButtonForPosting,
      args: [posting.id],
    });

    if (!clickResult.clicked) {
      return { status: 'needs-manual', reason: clickResult.reason };
    }

    await delay(POST_CLICK_SETTLE_MS);

    const [{ result: dialogOpened }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: hasOpenDialogAfterApply,
    });

    return dialogOpened
      ? { status: 'needs-manual', reason: 'dialog-appeared-after-apply-click' }
      : { status: 'applied' };
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
