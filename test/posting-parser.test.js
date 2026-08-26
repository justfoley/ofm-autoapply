import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobCard } from '../lib/posting-parser.js';

test('parses a card with multiple categories and tests+questions requirements', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View Reddit Virtual Assistant',
    categoryTexts: ['Reddit Marketer', 'Virtual Assistant'],
    requirementTexts: ['What this job requires', '2 tests', '2 questions', '1 language', '1 tool'],
  });

  assert.deepEqual(posting, {
    id: '01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    title: 'Reddit Virtual Assistant',
    categories: ['Reddit Marketer', 'Virtual Assistant'],
    url: 'https://ofmjobs.com/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    requirements: { tests: 2, questions: 2 },
  });
});

test('parses singular requirement badges ("1 test", "1 question")', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View Reddit Manager',
    categoryTexts: ['Reddit Marketer'],
    requirementTexts: ['1 test', '2 questions', '1 language', '3 tools'],
  });

  assert.deepEqual(posting.requirements, { tests: 1, questions: 2 });
});

test('defaults requirements to zero when there are no test/question badges', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View OnlyFans Chatter',
    categoryTexts: ['OnlyFans Chatter'],
    requirementTexts: ['1 language', '4 tools'],
  });

  assert.deepEqual(posting.requirements, { tests: 0, questions: 0 });
});

test('defaults requirements to zero when no accordion was present at all', () => {
  const posting = parseJobCard({
    href: '/dashboard/jobs/01a03fe7-bc67-713b-a9f8-d6d11c025a1e',
    ariaLabel: 'View OnlyFans Chatter',
    categoryTexts: ['OnlyFans Chatter'],
  });

  assert.deepEqual(posting.requirements, { tests: 0, questions: 0 });
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
