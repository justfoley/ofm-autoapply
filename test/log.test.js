import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogEntry, appendLogEntry, LOG_MAX_ENTRIES } from '../lib/log.js';

const posting = { id: 'a', title: 'Chat Support Rep', category: 'Chatters', url: 'https://ofmjobs.com/jobs/a' };

test('creates a log entry carrying title/category/url/timestamp', () => {
  const entry = createLogEntry({ posting, outcome: 'applied', timestamp: '2026-08-26T00:00:00.000Z' });
  assert.deepEqual(entry, {
    id: 'a',
    title: 'Chat Support Rep',
    category: 'Chatters',
    url: 'https://ofmjobs.com/jobs/a',
    outcome: 'applied',
    timestamp: '2026-08-26T00:00:00.000Z',
  });
});

test('rejects an outcome other than applied/skipped-manual', () => {
  assert.throws(() => createLogEntry({ posting, outcome: 'bogus' }), /Invalid log outcome/);
});

test('appendLogEntry prepends newest-first without mutating the input array', () => {
  const first = createLogEntry({ posting, outcome: 'applied', timestamp: 't1' });
  const second = createLogEntry({ posting: { ...posting, id: 'b' }, outcome: 'skipped-manual', timestamp: 't2' });

  const afterFirst = appendLogEntry([], first);
  const afterSecond = appendLogEntry(afterFirst, second);

  assert.deepEqual(afterFirst, [first]);
  assert.deepEqual(afterSecond, [second, first]);
});

test('caps the log at LOG_MAX_ENTRIES, dropping the oldest', () => {
  let log = [];
  for (let i = 0; i < LOG_MAX_ENTRIES + 5; i++) {
    log = appendLogEntry(log, createLogEntry({ posting: { ...posting, id: `id-${i}` }, outcome: 'applied', timestamp: `t${i}` }));
  }

  assert.equal(log.length, LOG_MAX_ENTRIES);
  // Newest (last pushed) entry is first; oldest 5 were dropped.
  assert.equal(log[0].id, `id-${LOG_MAX_ENTRIES + 4}`);
  assert.equal(log.at(-1).id, 'id-5');
});
