import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobCard } from '../lib/posting-parser.js';

test('parses a card with multiple categories', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View Reddit Virtual Assistant',
    categoryTexts: ['Reddit Marketer', 'Virtual Assistant'],
  });

  assert.deepEqual(posting, {
    id: '01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    title: 'Reddit Virtual Assistant',
    categories: ['Reddit Marketer', 'Virtual Assistant'],
    url: 'https://ofmjobs.com/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    questionCount: 0,
    testCount: 0,
  });
});

test('defaults to no categories when none are given', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View OnlyFans Chatter',
  });

  assert.deepEqual(posting.categories, []);
});

test('parses questionCount/testCount from the card badge text', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View Reddit Manager',
    categoryTexts: ['Reddit Marketer'],
    questionBadgeText: '2 questions',
    testBadgeText: '1 test',
  });

  assert.equal(posting.questionCount, 2);
  assert.equal(posting.testCount, 1);
});

test('defaults questionCount/testCount to 0 when the card has no such badge', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View OnlyFans Chatter',
  });

  assert.equal(posting.questionCount, 0);
  assert.equal(posting.testCount, 0);
});

test('parses a singular "1 question" badge the same as a plural one', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View OnlyFans Chatter',
    questionBadgeText: '1 question',
  });

  assert.equal(posting.questionCount, 1);
});

test('returns null for a link whose href is not a posting detail URL (e.g. the "saved jobs" nav link)', () => {
  const result = parseJobCard({ href: '/dashboard/jobs/saved', ariaLabel: 'View saved jobs' });
  assert.equal(result, null);
});

test('returns null when there is no link at all', () => {
  const result = parseJobCard({ href: null, ariaLabel: null });
  assert.equal(result, null);
});

test('strips the "View " prefix from the title', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View Instagram & X Social Media Virtual Assistant',
    categoryTexts: [],
  });
  assert.equal(posting.title, 'Instagram & X Social Media Virtual Assistant');
});
