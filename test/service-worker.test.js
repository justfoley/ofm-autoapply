import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, getDefaultState } from '../lib/storage.js';
import { loadActivity } from '../lib/activity.js';

// Each test needs a fresh evaluation of background/service-worker.js (its
// top-level code registers the chrome.alarms/storage listeners under test),
// but Node's ESM loader caches modules by resolved URL - a plain repeated
// `import('../background/service-worker.js')` would just hand back the
// instance from the first test. A unique query string forces a distinct URL,
// and therefore a fresh evaluation, each time.
let importCounter = 0;
function importServiceWorkerFresh() {
  importCounter += 1;
  return import(`../background/service-worker.js?case=${importCounter}`);
}

// background/service-worker.js talks to the real `chrome` global and to
// lib/feed.js / lib/apply.js (whose real implementations open actual browser
// tabs - see AGENTS.md). This mocks both boundaries with the same
// promise-based storage shape test/storage.test.js uses, plus minimal
// alarms/runtime/storage.onChanged stand-ins, so the two review-flagged
// orchestration bugs (overlapping poll cycles, alarm-interval drift) can be
// exercised without a browser.
function installChromeMock(initialState) {
  let store = { [STORAGE_KEY]: initialState };
  const alarmCalls = [];
  const clearCalls = [];
  let scheduledAlarm;
  let onAlarmListener;
  let onChangedListener;

  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    storage: {
      local: {
        async get(key) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(obj) {
          const oldValue = store[STORAGE_KEY];
          store = { ...store, ...obj };
          if (onChangedListener && STORAGE_KEY in obj) {
            onChangedListener(
              { [STORAGE_KEY]: { oldValue, newValue: obj[STORAGE_KEY] } },
              'local',
            );
          }
        },
      },
      onChanged: {
        addListener: (fn) => {
          onChangedListener = fn;
        },
      },
    },
    alarms: {
      create: (name, opts) => {
        alarmCalls.push({ name, opts });
        const periodMs = (opts && opts.periodInMinutes ? opts.periodInMinutes : 0) * 60000;
        scheduledAlarm = { name, scheduledTime: Date.now() + periodMs };
      },
      get: async (name) => (scheduledAlarm && scheduledAlarm.name === name ? scheduledAlarm : undefined),
      clear: async (name) => {
        clearCalls.push(name);
        scheduledAlarm = undefined;
        return true;
      },
      onAlarm: {
        addListener: (fn) => {
          onAlarmListener = fn;
        },
      },
    },
  };

  return {
    alarmCalls,
    clearCalls,
    fireAlarm: () => onAlarmListener({ name: 'ofm-autoapply-poll' }),
    getStore: () => store[STORAGE_KEY],
  };
}

test('a second alarm fire while a poll cycle is still in flight is a no-op (no double-apply)', async (t) => {
  const chromeMock = installChromeMock({ ...getDefaultState(), masterEnabled: true });

  let resolveFeed;
  const feedCallCount = { value: 0 };
  t.mock.module('../lib/feed.js', {
    namedExports: {
      getFeedPostings: async () => {
        feedCallCount.value += 1;
        return new Promise((resolve) => {
          resolveFeed = resolve;
        });
      },
    },
  });
  t.mock.module('../lib/apply.js', {
    namedExports: {
      applyToPosting: async () => ({ status: 'applied' }),
    },
  });

  await importServiceWorkerFresh();

  chromeMock.fireAlarm(); // starts a cycle; pollInProgress flips true synchronously
  // Let the first cycle actually reach (and hang inside) getFeedPostings()
  // before firing the second alarm, so this proves the guard - not timing luck.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  chromeMock.fireAlarm(); // must be dropped - a poll is already in flight
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(feedCallCount.value, 1, 'overlapping alarm fire must not start a second concurrent poll cycle');

  resolveFeed([]);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  chromeMock.fireAlarm(); // once the first cycle has finished, polling must resume
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(feedCallCount.value, 2, 'the in-flight guard must clear after the cycle completes so polling resumes');
});

test('storage writes that do not flip masterEnabled do not resync the alarm (would drift the 60s interval)', async (t) => {
  const chromeMock = installChromeMock({ ...getDefaultState(), masterEnabled: true });

  t.mock.module('../lib/feed.js', {
    namedExports: { getFeedPostings: async () => [] },
  });
  t.mock.module('../lib/apply.js', {
    namedExports: { applyToPosting: async () => ({ status: 'applied' }) },
  });

  const { pollFeed } = await importServiceWorkerFresh();

  // Simulate what every pollFeed() cycle does at the end: save state again
  // with masterEnabled unchanged (e.g. only seenIds/log/knownCategories grew).
  await pollFeed();

  assert.deepEqual(chromeMock.alarmCalls, [], 'a state save that keeps masterEnabled the same must not recreate the alarm');
  assert.deepEqual(chromeMock.clearCalls, []);
});

test('flipping masterEnabled in storage does resync the alarm', async (t) => {
  const chromeMock = installChromeMock({ ...getDefaultState(), masterEnabled: true });

  t.mock.module('../lib/feed.js', {
    namedExports: { getFeedPostings: async () => [] },
  });
  t.mock.module('../lib/apply.js', {
    namedExports: { applyToPosting: async () => ({ status: 'applied' }) },
  });

  await importServiceWorkerFresh();
  const { saveState } = await import('../lib/storage.js');

  await saveState({ ...chromeMock.getStore(), masterEnabled: false });

  assert.deepEqual(chromeMock.clearCalls, ['ofm-autoapply-poll'], 'turning the master switch off must clear the alarm immediately');
});

test('pollFeed publishes "applying" with the posting title while acting on a match, then falls back to idle with a next-alarm time', async (t) => {
  const chromeMock = installChromeMock({
    ...getDefaultState(),
    masterEnabled: false,
    selectedCategories: ['Reddit Marketer'],
  });

  const posting = { id: 'p1', title: 'Reddit Marketer for X', categories: ['Reddit Marketer'], url: 'https://x/p1' };
  const observedActivityDuringApply = [];
  t.mock.module('../lib/feed.js', {
    namedExports: { getFeedPostings: async () => [posting] },
  });
  t.mock.module('../lib/apply.js', {
    namedExports: {
      applyToPosting: async () => {
        observedActivityDuringApply.push(await loadActivity());
        return { status: 'applied' };
      },
    },
  });

  const { pollFeed } = await importServiceWorkerFresh();
  const { saveState } = await import('../lib/storage.js');
  // Flip masterEnabled on, same as a real captain toggling it - this is what
  // registers the chrome.alarms entry pollFeed() reads back below as
  // nextAlarmAt (in production pollFeed() only ever runs once an alarm
  // already exists, i.e. after this has happened).
  await saveState({ ...chromeMock.getStore(), masterEnabled: true });

  await pollFeed();

  assert.deepEqual(observedActivityDuringApply, [
    { masterEnabled: true, status: 'applying', postingTitle: 'Reddit Marketer for X', nextAlarmAt: null },
  ]);

  const finalActivity = await loadActivity();
  assert.equal(finalActivity.masterEnabled, true);
  assert.equal(finalActivity.status, 'idle');
  assert.equal(finalActivity.postingTitle, null);
  assert.equal(typeof finalActivity.nextAlarmAt, 'number');
});

test('pollFeed falls back to idle activity even when the feed fetch throws', async (t) => {
  installChromeMock({ ...getDefaultState(), masterEnabled: true });

  t.mock.module('../lib/feed.js', {
    namedExports: {
      getFeedPostings: async () => {
        throw new Error('boom');
      },
    },
  });
  t.mock.module('../lib/apply.js', {
    namedExports: { applyToPosting: async () => ({ status: 'applied' }) },
  });

  const { pollFeed } = await importServiceWorkerFresh();
  await pollFeed();

  const activity = await loadActivity();
  assert.equal(activity.status, 'idle');
});

test('turning the master switch off immediately clears the activity record (hides the tab overlay/indicator)', async (t) => {
  const chromeMock = installChromeMock({ ...getDefaultState(), masterEnabled: true });

  t.mock.module('../lib/feed.js', { namedExports: { getFeedPostings: async () => [] } });
  t.mock.module('../lib/apply.js', { namedExports: { applyToPosting: async () => ({ status: 'applied' }) } });

  const { pollFeed } = await importServiceWorkerFresh();
  const { saveState } = await import('../lib/storage.js');

  // In production the activity record is already populated by the time a
  // captain could toggle the switch off (onInstalled/onStartup always runs
  // first); simulate that here by running one cycle before flipping off.
  await pollFeed();
  const before = await loadActivity();
  assert.equal(before.masterEnabled, true);

  await saveState({ ...chromeMock.getStore(), masterEnabled: false });
  // The storage.onChanged listener kicks off syncAlarm() -> refreshIdleActivity()
  // without awaiting it (fire-and-forget, matching the existing alarm-resync
  // listener above) - flush the microtask queue so its writes land before we
  // read them back, same as the overlapping-poll test's use of setImmediate.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const after = await loadActivity();
  assert.deepEqual(after, { masterEnabled: false, status: 'idle', postingTitle: null, nextAlarmAt: null });
});
