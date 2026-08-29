import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, getDefaultState, STORAGE_KEY } from '../lib/storage.js';

// Mirrors the promise-based shape of chrome.storage.local.get(key)/.set(obj)
// closely enough for lib/storage.js's usage, without needing a real browser.
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

test('loadState returns defaults when nothing has been stored yet', async () => {
  const area = createMockStorageArea();
  const state = await loadState(area);
  assert.deepEqual(state, getDefaultState());
});

test('masterEnabled defaults to false so a fresh install never auto-applies', async () => {
  const area = createMockStorageArea();
  const state = await loadState(area);
  assert.equal(state.masterEnabled, false);
});

test('saveState then loadState round-trips the full state', async () => {
  const area = createMockStorageArea();
  const written = {
    masterEnabled: true,
    selectedCategories: ['OnlyFans Chatter'],
    knownCategories: ['OnlyFans Chatter', 'Reddit Marketer'],
    seenIds: ['a', 'b'],
    log: [
      {
        id: 'a',
        title: 'T',
        categories: ['OnlyFans Chatter'],
        url: 'https://x',
        outcome: 'applied',
        timestamp: 't',
      },
    ],
    answerBank: [{ id: 'q1', question: 'How many years?', answer: '3 years' }],
    geminiApiKey: 'test-key',
  };

  await saveState(written, area);
  const read = await loadState(area);

  assert.deepEqual(read, written);
});

test('loadState merges stored partial state over defaults (forward-compat with new fields)', async () => {
  const area = createMockStorageArea({ [STORAGE_KEY]: { masterEnabled: true } });
  const state = await loadState(area);
  assert.equal(state.masterEnabled, true);
  assert.deepEqual(state.selectedCategories, []);
  assert.deepEqual(state.knownCategories, getDefaultState().knownCategories);
  assert.deepEqual(state.seenIds, []);
  assert.deepEqual(state.log, []);
  assert.deepEqual(state.answerBank, []);
  assert.equal(state.geminiApiKey, '');
});

test('saveState only ever touches the single namespaced storage key', async () => {
  const area = createMockStorageArea();
  await saveState(getDefaultState(), area);
  assert.deepEqual(Object.keys(area._dump()), [STORAGE_KEY]);
});
