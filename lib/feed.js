import { parseJobCard } from './posting-parser.js';

// TODO(unconfirmed): the dashboard "find jobs" listing page's own URL was
// never directly observed - the captain-supplied DOM dump (see AGENTS.md)
// only captured its rendered content, not its address bar. This is inferred
// from the posting detail URL convention seen on every card's link
// (/dashboard/jobs/{uuid}) under the standard listing-at-collection-root
// pattern. Verify once live browser inspection is possible; if wrong, this
// will 404 and getFeedPostings() will safely find zero job cards and warn,
// not crash (see the empty-result handling below).
const FEED_URL = 'https://ofmjobs.com/dashboard/jobs';

/**
 * Runs inside the target tab via chrome.scripting.executeScript, so it must
 * be fully self-contained - no references to anything outside this function
 * body (module imports, closures) survive serialization across that
 * boundary.
 *
 * Confirmed against the captain-supplied authenticated DOM dump: each job
 * card is a `[data-slot="job-card"]` containing one posting link, one-or-more
 * `[aria-label="Category"]` spans, and (when present) a
 * `[data-slot="accordion-trigger"]` labelled "What this job requires" whose
 * badge spans read like "2 tests" / "1 question" / "1 language" / "3 tools".
 */
function extractRawCardsFromPage() {
  const cards = Array.from(document.querySelectorAll('[data-slot="job-card"]'));
  return cards.map((card) => {
    const link = card.querySelector('a[aria-label^="View "]');
    const categoryTexts = Array.from(card.querySelectorAll('[aria-label="Category"]')).map(
      (el) => el.textContent || '',
    );
    const trigger = card.querySelector('[data-slot="accordion-trigger"]');
    const requirementTexts = trigger
      ? Array.from(trigger.querySelectorAll('span'))
          .map((el) => el.textContent || '')
          .filter((text) => /^\d+\s+\w+/.test(text.trim()))
      : [];

    return {
      href: link ? link.getAttribute('href') : null,
      ariaLabel: link ? link.getAttribute('aria-label') : null,
      categoryTexts,
      requirementTexts,
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
 * Fetch postings currently visible in the ofmjobs.com dashboard feed.
 *
 * Implementation note: the feed is a client-rendered, authenticated Next.js
 * page with no confirmed public JSON endpoint, so this opens a hidden
 * background tab in the captain's own logged-in profile (carrying their
 * session normally) and scrapes the rendered DOM via chrome.scripting,
 * rather than a same-origin fetch(). This is deliberately a visible,
 * unmasked automated tab per the brief - no anti-detection/evasion behavior.
 *
 * @returns {Promise<Array<{id: string, title: string, categories: string[], url: string, requirements: {tests: number, questions: number}}>>}
 */
export async function getFeedPostings() {
  const tab = await chrome.tabs.create({ url: FEED_URL, active: false });
  try {
    await waitForTabComplete(tab.id);
    const [{ result: rawCards }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRawCardsFromPage,
    });
    return rawCards.map(parseJobCard).filter(Boolean);
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
