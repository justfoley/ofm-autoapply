import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByCategory } from '../lib/category-filter.js';

test('keeps only postings whose category is checked', () => {
  const postings = [
    { id: 'a', category: 'Chatters' },
    { id: 'b', category: 'Video Editors' },
    { id: 'c', category: 'Finance & Admin' },
  ];

  const result = filterByCategory(postings, ['Chatters', 'Finance & Admin']);

  assert.deepEqual(result.map((p) => p.id), ['a', 'c']);
});

test('returns nothing when no categories are selected', () => {
  const postings = [{ id: 'a', category: 'Chatters' }];
  assert.deepEqual(filterByCategory(postings, []), []);
});

test('is case-sensitive and exact-match, not a substring match', () => {
  const postings = [
    { id: 'a', category: 'Chatters' },
    { id: 'b', category: 'chatters' },
    { id: 'c', category: 'Chatting Managers' },
  ];
  const result = filterByCategory(postings, ['Chatters']);
  assert.deepEqual(result.map((p) => p.id), ['a']);
});

test('matches by exact string, independent of any known category list', () => {
  const postings = [{ id: 'a', category: 'Some Future Category' }];
  assert.deepEqual(filterByCategory(postings, ['Some Future Category']).map((p) => p.id), ['a']);
  assert.deepEqual(filterByCategory(postings, ['Chatters']), []);
});
