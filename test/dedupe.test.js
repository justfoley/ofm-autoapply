import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionBySeen } from '../lib/dedupe.js';

test('separates unseen postings from previously-seen ones by id', () => {
  const postings = [
    { id: 'a', title: 'Post A' },
    { id: 'b', title: 'Post B' },
    { id: 'c', title: 'Post C' },
  ];

  const { unseen, alreadySeen } = partitionBySeen(postings, ['b']);

  assert.deepEqual(unseen.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(alreadySeen.map((p) => p.id), ['b']);
});

test('treats an empty seen list as everything unseen', () => {
  const postings = [{ id: 'a' }, { id: 'b' }];
  const { unseen, alreadySeen } = partitionBySeen(postings, []);
  assert.equal(unseen.length, 2);
  assert.equal(alreadySeen.length, 0);
});

test('treats every posting as seen once all ids are recorded (no re-triggering across restarts)', () => {
  const postings = [{ id: 'a' }, { id: 'b' }];
  const { unseen, alreadySeen } = partitionBySeen(postings, ['a', 'b']);
  assert.equal(unseen.length, 0);
  assert.equal(alreadySeen.length, 2);
});

test('does not mutate the input postings array', () => {
  const postings = [{ id: 'a' }, { id: 'b' }];
  const snapshot = [...postings];
  partitionBySeen(postings, ['a']);
  assert.deepEqual(postings, snapshot);
});
