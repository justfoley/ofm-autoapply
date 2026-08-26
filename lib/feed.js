import { parseJobCard } from './posting-parser.js';

// TODO(unconfirmed): the dashboard "find jobs" listing page's own URL was
// never directly observed - the captain-supplied DOM dump (see AGENTS.md)
// only captured its rendered content, not its address bar. This is inferred
// from the posting detail URL convention seen on every card's link
// (/dashboard/jobs/{uuid}) under the standard listing-at-collection-root
// pattern. Documented assumption, not blocking further work on: if wrong,
// this will 404 and getFeedPostings() will safely find zero job cards and
// warn, not crash (see the empty-result handling below).
const FEED_URL = 'https://ofmjobs.com/dashboard/jobs';

/**
 * Runs inside the target tab via chrome.scripting.executeScript, so it must
 * be fully self-contained - no references to anything outside this function
 * body (module imports, closures) survive serialization across that
 * boundary.
 *
 * Confirmed against the captain-supplied authenticated DOM dump: each job
 * card is a `[data-slot="job-card"]` containing one posting link and
 * one-or-more `[aria-label="Category"]` spans.
 */
function extractRawCardsFromPage() {
  const cards = Array.from(document.querySelectorAll('[data-slot="job-card"]'));
  return cards.map((card) => {
    const link = card.querySelector('a[aria-label^="View "]');
    const categoryTexts = Array.from(card.querySelectorAll('[aria-label="Category"]')).map(
      (el) => el.textContent || '',
    );

    return {
      href: link ? link.getAttribute('href') : null,
      ariaLabel: link ? link.getAttribute('aria-label') : null,
      categoryTexts,
    };
  });
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

/**
 * Runs inside the target tab. `chrome.tabs.onUpdated`'s "complete" status
 * only means the network-level page load finished, not that a client-rendered
 * Next.js page has fetched and mounted its job cards yet - this reports
 * whether any have shown up.
 */
function hasJobCards() {
  return document.querySelectorAll('[data-slot="job-card"]').length > 0;
}

// Bound on how long to keep polling for job cards to hydrate after tab load
// before giving up and scraping whatever is there (a genuinely empty feed
// must still resolve, not hang forever).
const HYDRATION_TIMEOUT_MS = 8000;
const HYDRATION_POLL_INTERVAL_MS = 250;

/**
 * Poll the tab for job cards to appear after load, rather than assuming the
 * "complete" tab-load event means the SPA has finished rendering them - see
 * hasJobCards(). Resolves as soon as cards are found, or after
 * HYDRATION_TIMEOUT_MS elapses (a genuinely empty feed looks the same as one
 * that never hydrated, so this can't distinguish them and must not hang).
 */
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

/**
 * Fetch postings currently visible in the ofmjobs.com dashboard feed.
 *
 * Implementation note: the feed is a client-rendered, authenticated Next.js
 * page with no confirmed public JSON endpoint, so this opens a hidden
 * background tab in the captain's own logged-in profile (carrying their
 * session normally) and scrapes the rendered DOM via chrome.scripting,
 * rather than a same-origin fetch(). This is deliberately a visible,
 * unmasked automated tab per the brief - no anti-detection/evasion behavior.
 *
 * @returns {Promise<Array<{id: string, title: string, categories: string[], url: string}>>}
 */
export async function getFeedPostings() {
  const tab = await chrome.tabs.create({ url: FEED_URL, active: false });
  try {
    await waitForTabComplete(tab.id);
    await waitForJobCardsToHydrate(tab.id);
    const [{ result: rawCards }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRawCardsFromPage,
    });
    return rawCards.map(parseJobCard).filter(Boolean);
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
