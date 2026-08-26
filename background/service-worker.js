import { loadState, saveState } from '../lib/storage.js';
import { partitionBySeen } from '../lib/dedupe.js';
import { filterByCategory } from '../lib/category-filter.js';
import { createLogEntry, appendLogEntry } from '../lib/log.js';
import { getFeedPostings } from '../lib/feed.js';
import { applyToPosting } from '../lib/apply.js';

// chrome.alarms rather than setInterval/setTimeout: a page-resident timer
// dies whenever MV3 suspends this service worker, but an alarm survives
// suspension and fires again on schedule when Chrome wakes the worker.
const ALARM_NAME = 'ofm-autoapply-poll';
// chrome.alarms' minimum period is one minute, which is exactly the 60s
// polling interval the brief specifies - do not shorten this.
const POLL_PERIOD_MINUTES = 1;

chrome.runtime.onInstalled.addListener(async () => {
  // Persist defaults on first install so masterEnabled is explicitly false in
  // storage (not just implicitly absent) - a fresh install must never poll or
  // auto-apply before the captain opts in.
  const state = await loadState();
  await saveState(state);
  await syncAlarm();
});

chrome.runtime.onStartup.addListener(syncAlarm);

// The popup flips masterEnabled/selectedCategories directly in storage; react
// here so the alarm is (de)registered immediately rather than waiting for the
// next browser restart.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[Object.keys(changes)[0]] !== undefined) {
    syncAlarm();
  }
});

async function syncAlarm() {
  const state = await loadState();
  if (state.masterEnabled) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollFeed().catch((err) => console.warn('[ofm-autoapply] poll cycle failed', err));
  }
});

/**
 * One polling cycle: fetch the feed, dedupe against previously-seen postings,
 * filter to checked categories, and attempt to apply. Every matching posting
 * (applied, applied-unconfirmed, or needs-manual - see lib/log.js) is added
 * to seenIds so it is never re-evaluated, even across browser restarts
 * (seenIds lives in chrome.storage.local).
 */
export async function pollFeed() {
  const state = await loadState();
  if (!state.masterEnabled) return;

  let postings;
  try {
    postings = await getFeedPostings();
  } catch (err) {
    // Feed fetch opens/scrapes/closes a hidden tab (see lib/feed.js) - can
    // genuinely fail (e.g. navigation error, session expired). Warn, don't
    // throw, so a bad cycle never surfaces as a console error and just
    // retries next alarm.
    console.warn('[ofm-autoapply] feed unavailable this cycle:', err.message);
    return;
  }

  // Grow the known-category list from every posting seen this cycle
  // (matched or not), not just acted-on ones - see lib/storage.js.
  const knownCategories = new Set(state.knownCategories);
  for (const posting of postings) {
    for (const category of posting.categories) knownCategories.add(category);
  }

  const { unseen } = partitionBySeen(postings, state.seenIds);
  if (unseen.length === 0) {
    await saveState({ ...state, knownCategories: [...knownCategories] });
    return;
  }

  const matchingIds = new Set(filterByCategory(unseen, state.selectedCategories).map((p) => p.id));

  const seenIds = [...state.seenIds];
  let log = state.log;

  for (const posting of unseen) {
    if (!matchingIds.has(posting.id)) {
      // Not in a checked category - never acted on, but still marked seen so
      // it doesn't get re-evaluated every cycle. If the captain later checks
      // that category, postings already in the feed at that point won't
      // retroactively trigger; only postings that are new *after* the change
      // will.
      seenIds.push(posting.id);
      continue;
    }

    let outcome;
    let reason;
    try {
      const result = await applyToPosting(posting);
      outcome = result.status;
      reason = result.reason;
    } catch (err) {
      console.warn('[ofm-autoapply] apply attempt failed, logging as needs-manual:', err);
      outcome = 'needs-manual';
      reason = 'unexpected-error';
    }

    log = appendLogEntry(log, createLogEntry({ posting, outcome, reason }));
    seenIds.push(posting.id);
  }

  await saveState({ ...state, seenIds, log, knownCategories: [...knownCategories] });
}
