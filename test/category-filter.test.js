import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByCategory } from '../lib/category-filter.js';

test('keeps only postings that carry a checked category', () => {
  const postings = [
    { id: 'a', categories: ['Chatters'] },
    { id: 'b', categories: ['Video Editors'] },
    { id: 'c', categories: ['Finance & Admin'] },
  ];

  const result = filterByCategory(postings, ['Chatters', 'Finance & Admin']);

  assert.deepEqual(result.map((p) => p.id), ['a', 'c']);
});

test('matches a posting if ANY of its multiple categories is checked', () => {
  const postings = [
    { id: 'a', categories: ['Reddit Marketer', 'Virtual Assistant'] },
    { id: 'b', categories: ['Content Editor'] },
  ];

  const result = filterByCategory(postings, ['Virtual Assistant']);

  assert.deepEqual(result.map((p) => p.id), ['a']);
});

test('returns nothing when no categories are selected', () => {
  const postings = [{ id: 'a', categories: ['Chatters'] }];
  assert.deepEqual(filterByCategory(postings, []), []);
});

test('is case-sensitive and exact-match, not a substring match', () => {
  const postings = [
    { id: 'a', categories: ['Chatters'] },
    { id: 'b', categories: ['chatters'] },
    { id: 'c', categories: ['Chatting Managers'] },
  ];
  const result = filterByCategory(postings, ['Chatters']);
  assert.deepEqual(result.map((p) => p.id), ['a']);
});

test('matches by exact string, independent of any known category list', () => {
  const postings = [{ id: 'a', categories: ['Some Future Category'] }];
  assert.deepEqual(filterByCategory(postings, ['Some Future Category']).map((p) => p.id), ['a']);
  assert.deepEqual(filterByCategory(postings, ['Chatters']), []);
});
