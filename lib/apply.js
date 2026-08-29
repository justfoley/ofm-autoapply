import {
  canAutoApplyPosting,
  canClickApply,
  describeUnexpectedApplyState,
  interpretPostClickState,
  requiresScreeningQuestions,
} from './apply-eligibility.js';
import { applyToScreeningQuestionsPosting } from './screening-apply.js';

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

/**
 * Runs inside the target tab. Post-click backstop (see AGENTS.md/report.md):
 * a `[role="dialog"]` appearing after the click means Apply surfaced a form
 * instead of submitting - the DOM dump shows this site already uses
 * Radix-style dialogs elsewhere (its command palette carries
 * `data-slot="dialog-title"`/`dialog-description"`, whose content root is
 * `role="dialog"`), so this is a reasonable, low-cost general-purpose check
 * even without a live authenticated observation of the questions flow
 * itself.
 */
function hasOpenDialog() {
  return document.querySelector('[role="dialog"]') !== null;
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

const TAB_LOAD_TIMEOUT_MS = 30000;

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    }
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        cleanup();
        resolve();
      }
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('tab load timed out'));
    }, TAB_LOAD_TIMEOUT_MS);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs inside the target tab - see lib/feed.js's identical helper. */
function hasJobCards() {
  return document.querySelectorAll('[data-slot="job-card"]').length > 0;
}

// Same rationale/bound as lib/feed.js: "complete" is a network-load signal,
// not a render signal, for this client-rendered Next.js page.
const HYDRATION_TIMEOUT_MS = 8000;
const HYDRATION_POLL_INTERVAL_MS = 250;

async function waitForJobCardsToHydrate(tabId) {
  const deadline = Date.now() + HYDRATION_TIMEOUT_MS;
  for (;;) {
    const [{ result: found }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: hasJobCards,
    });
    if (found || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, HYDRATION_POLL_INTERVAL_MS));
  }
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
 * modal, no form - server-side qualification isn't visible to the client) -
 * but only for a posting that carries no "questions"/"tests" badge in the
 * feed (see canAutoApplyPosting()); those need more than one click and are
 * never auto-clicked at all, so this returns before ever opening a tab.
 *
 * Never invents a fake or partial submission: a posting whose card can't be
 * safely acted on (no Apply button, already applied/disabled, not found) is
 * resolved to 'needs-manual' without clicking anything, and a click whose
 * outcome can't be confirmed from the DOM is honestly reported as
 * 'applied-unconfirmed' rather than asserted as a success. Likewise, if a
 * dialog appears or the tab navigates away after a click the badge gate
 * didn't catch, that's reported as 'needs-questions' rather than guessed at
 * as 'applied' (see interpretPostClickState's backstop).
 *
 * A posting that needs application questions (not tests - see
 * requiresScreeningQuestions) is handed to the answer-bank-driven
 * lib/screening-apply.js flow instead, but only once the captain has
 * actually configured a Gemini key and stored at least one answer -
 * otherwise this is unchanged from before that flow existed: straight to
 * 'needs-questions', no tab ever opened.
 *
 * @param {import('./posting-parser.js').Posting} posting
 * @param {object} [config]
 * @param {import('./answer-bank.js').AnswerBankEntry[]} [config.answerBank]
 * @param {string} [config.geminiApiKey]
 * @returns {Promise<{status: 'applied'|'applied-unconfirmed'|'needs-manual'|'needs-questions', reason?: string, screeningMatches?: Array<object>}>}
 */
export async function applyToPosting(posting, { answerBank = [], geminiApiKey = '' } = {}) {
  const preflight = canAutoApplyPosting(posting);
  if (!preflight.eligible) {
    if (requiresScreeningQuestions(posting) && geminiApiKey.trim() && answerBank.length > 0) {
      return applyToScreeningQuestionsPosting(posting, { answerBank, geminiApiKey });
    }
    return { status: 'needs-questions', reason: preflight.reason };
  }

  const tab = await chrome.tabs.create({ url: FEED_URL, active: false });
  try {
    await waitForTabComplete(tab.id);
    await waitForJobCardsToHydrate(tab.id);

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

    const [{ result: dialogOpened }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: hasOpenDialog,
    });
    const currentTab = await chrome.tabs.get(tab.id);
    const navigatedAwayFromFeed = typeof currentTab.url === 'string' && !currentTab.url.startsWith(FEED_URL);

    const postClickState = await readCardState(tab.id, posting.id);
    const status = interpretPostClickState({ ...postClickState, dialogOpened, navigatedAwayFromFeed });
    if (status === 'needs-questions') {
      return { status, reason: describeUnexpectedApplyState({ dialogOpened, navigatedAwayFromFeed }) };
    }
    return { status };
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
