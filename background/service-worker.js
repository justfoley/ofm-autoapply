import { loadState, saveState, STORAGE_KEY } from '../lib/storage.js';
import { partitionBySeen } from '../lib/dedupe.js';
import { filterByCategory } from '../lib/category-filter.js';
import { createLogEntry, appendLogEntry } from '../lib/log.js';
import { getFeedPostings } from '../lib/feed.js';
import { applyToPosting } from '../lib/apply.js';
import { getDefaultActivity, saveActivity } from '../lib/activity.js';

// Content script that renders the ofmjobs.com tab overlay/corner indicator
// (content/overlay.js) is declared in manifest.json so it auto-injects into
// tabs that load/reload after install. That declarative registration does
// NOT reach tabs already open at install/update time, so this also injects
// it into any such tabs directly. Best-effort: a tab that isn't ready yet or
// isn't injectable just misses the overlay until its next navigation, which
// is not worth failing over.
const OVERLAY_CONTENT_SCRIPT = 'content/overlay.js';

async function injectOverlayIntoOpenTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: 'https://ofmjobs.com/*' });
  } catch {
    return;
  }
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [OVERLAY_CONTENT_SCRIPT] }).catch(() => {}),
    ),
  );
}

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
  await injectOverlayIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncAlarm();
  await injectOverlayIntoOpenTabs();
});

// The popup flips masterEnabled directly in storage; react here so the alarm
// is (de)registered immediately rather than waiting for the next browser
// restart. Only re-sync on an actual masterEnabled flip, not on every state
// write - pollFeed() itself calls saveState() at the end of every cycle, and
// chrome.alarms.create() restarts the periodic timer from "now", so reacting
// to those saves too would drift the poll interval later with each cycle.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const change = changes[STORAGE_KEY];
  if (!change) return;
  const wasEnabled = Boolean(change.oldValue && change.oldValue.masterEnabled);
  const isEnabled = Boolean(change.newValue && change.newValue.masterEnabled);
  if (wasEnabled !== isEnabled) {
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
  await refreshIdleActivity();
}

/**
 * Publish the shared "current activity" record (lib/activity.js) for the
 * idle/off state - i.e. whenever no poll cycle is running. Always re-reads
 * masterEnabled fresh rather than trusting a caller-passed flag, since this
 * can run after an arbitrary delay (e.g. a pollFeed() cycle's finally).
 */
async function refreshIdleActivity() {
  const state = await loadState();
  if (!state.masterEnabled) {
    await saveActivity(getDefaultActivity());
    return;
  }
  const alarm = await chrome.alarms.get(ALARM_NAME);
  await saveActivity({
    masterEnabled: true,
    status: 'idle',
    postingTitle: null,
    nextAlarmAt: alarm ? alarm.scheduledTime : null,
  });
}

// Guards against a poll cycle still running (each apply opens a tab,
// navigates, and sleeps ~800ms, sequentially, per matching posting) when the
// next alarm fires. Without this, two overlapping pollFeed() calls would both
// read the same stale seenIds and could double-apply to the same posting,
// with whichever saveState() finishes last silently discarding the other's
// updates.
let pollInProgress = false;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME || pollInProgress) return;
  pollInProgress = true;
  pollFeed()
    .catch((err) => console.warn('[ofm-autoapply] poll cycle failed', err))
    .finally(() => {
      pollInProgress = false;
    });
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

  // Published for the popup and the ofmjobs.com tab overlay (lib/activity.js)
  // - this window (through the `finally` below) matches pollInProgress
  // above, which is what the tab overlay's full-tab lock keys off.
  await saveActivity({ masterEnabled: true, status: 'polling', postingTitle: null, nextAlarmAt: null });
  try {
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

      await saveActivity({ masterEnabled: true, status: 'applying', postingTitle: posting.title, nextAlarmAt: null });

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
  } finally {
    // Guarantees the overlay/popup fall back to idle even if something above
    // threw unexpectedly, regardless of which branch returned.
    await refreshIdleActivity();
  }
}
