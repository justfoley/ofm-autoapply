import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_STORAGE_KEY,
  getDefaultActivity,
  loadActivity,
  saveActivity,
  secondsUntil,
  isCycleActive,
  describeActivity,
} from '../lib/activity.js';

// Mirrors the promise-based shape of chrome.storage.local.get(key)/.set(obj),
// same pattern as test/storage.test.js.
function createMockStorageArea(initial = {}) {
  let store = { ...initial };
  return {
    async get(key) {
      return key in store ? { [key]: store[key] } : {};
    },
    async set(obj) {
      store = { ...store, ...obj };
    },
    _dump: () => store,
  };
}

test('loadActivity returns defaults when nothing has been stored yet', async () => {
  const area = createMockStorageArea();
  const activity = await loadActivity(area);
  assert.deepEqual(activity, getDefaultActivity());
});

test('saveActivity then loadActivity round-trips, and only touches its own key', async () => {
  const area = createMockStorageArea();
  const written = { masterEnabled: true, status: 'applying', postingTitle: 'Reddit Marketer', nextAlarmAt: null };
  await saveActivity(written, area);
  assert.deepEqual(await loadActivity(area), written);
  assert.deepEqual(Object.keys(area._dump()), [ACTIVITY_STORAGE_KEY]);
});

test('loadActivity merges a stored partial record over defaults', async () => {
  const area = createMockStorageArea({ [ACTIVITY_STORAGE_KEY]: { masterEnabled: true } });
  const activity = await loadActivity(area);
  assert.equal(activity.masterEnabled, true);
  assert.equal(activity.status, 'idle');
  assert.equal(activity.postingTitle, null);
  assert.equal(activity.nextAlarmAt, null);
});

test('secondsUntil clamps to 0 once the target has passed', () => {
  assert.equal(secondsUntil(1000, 5000), 0);
});

test('secondsUntil rounds up to the next whole second', () => {
  assert.equal(secondsUntil(1500, 1000), 1);
  assert.equal(secondsUntil(3000, 1000), 2);
});

test('secondsUntil returns null for a missing/invalid timestamp', () => {
  assert.equal(secondsUntil(null, 1000), null);
  assert.equal(secondsUntil(undefined, 1000), null);
  assert.equal(secondsUntil(NaN, 1000), null);
});

test('isCycleActive is true only while masterEnabled and status is polling or applying', () => {
  assert.equal(isCycleActive({ masterEnabled: true, status: 'polling' }), true);
  assert.equal(isCycleActive({ masterEnabled: true, status: 'applying' }), true);
  assert.equal(isCycleActive({ masterEnabled: true, status: 'idle' }), false);
  assert.equal(isCycleActive({ masterEnabled: false, status: 'polling' }), false);
});

test('describeActivity reports "Off" when the master switch is off, regardless of status', () => {
  assert.equal(describeActivity({ masterEnabled: false, status: 'polling' }), 'Off');
});

test('describeActivity reports the checking-feed message while polling', () => {
  assert.equal(
    describeActivity({ masterEnabled: true, status: 'polling' }),
    'Checking feed for new postings...',
  );
});

test('describeActivity reports the posting title while applying', () => {
  assert.equal(
    describeActivity({ masterEnabled: true, status: 'applying', postingTitle: 'Reddit Marketer' }),
    'Applying to "Reddit Marketer"...',
  );
});

test('describeActivity falls back to a generic label if applying with no posting title', () => {
  assert.equal(
    describeActivity({ masterEnabled: true, status: 'applying', postingTitle: null }),
    'Applying to "posting"...',
  );
});

test('describeActivity reports a live countdown while idle', () => {
  const activity = { masterEnabled: true, status: 'idle', nextAlarmAt: 4000 };
  assert.equal(describeActivity(activity, 1000), 'Idle - next check in 3s');
});

test('describeActivity reports plain "Idle" when idle with no known next-alarm time', () => {
  assert.equal(describeActivity({ masterEnabled: true, status: 'idle', nextAlarmAt: null }), 'Idle');
});
