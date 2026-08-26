import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogEntry, appendLogEntry, LOG_MAX_ENTRIES } from '../lib/log.js';

const posting = {
  id: 'a',
  title: 'Chat Support Rep',
  categories: ['OnlyFans Chatter', 'Virtual Assistant'],
  url: 'https://ofmjobs.com/dashboard/jobs/a',
};

test('creates a log entry carrying title/categories/url/timestamp', () => {
  const entry = createLogEntry({ posting, outcome: 'applied', timestamp: '2026-08-26T00:00:00.000Z' });
  assert.deepEqual(entry, {
    id: 'a',
    title: 'Chat Support Rep',
    categories: ['OnlyFans Chatter', 'Virtual Assistant'],
    url: 'https://ofmjobs.com/dashboard/jobs/a',
    outcome: 'applied',
    timestamp: '2026-08-26T00:00:00.000Z',
  });
});

test('includes a reason field only when one is given', () => {
  const withReason = createLogEntry({
    posting,
    outcome: 'needs-manual',
    timestamp: 't',
    reason: 'apply-button-not-found',
  });
  assert.equal(withReason.reason, 'apply-button-not-found');

  const withoutReason = createLogEntry({ posting, outcome: 'applied', timestamp: 't' });
  assert.equal('reason' in withoutReason, false);
});

test('accepts applied-unconfirmed as a valid outcome', () => {
  const entry = createLogEntry({ posting, outcome: 'applied-unconfirmed', timestamp: 't' });
  assert.equal(entry.outcome, 'applied-unconfirmed');
});

test('rejects an outcome outside applied/applied-unconfirmed/needs-manual', () => {
  assert.throws(() => createLogEntry({ posting, outcome: 'bogus' }), /Invalid log outcome/);
});

test('appendLogEntry prepends newest-first without mutating the input array', () => {
  const first = createLogEntry({ posting, outcome: 'applied', timestamp: 't1' });
  const second = createLogEntry({ posting: { ...posting, id: 'b' }, outcome: 'needs-manual', timestamp: 't2' });

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
