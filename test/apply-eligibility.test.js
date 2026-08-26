import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAttemptAutoApply } from '../lib/apply-eligibility.js';

test('allows auto-apply when there are no tests or questions required', () => {
  assert.equal(canAttemptAutoApply({ requirements: { tests: 0, questions: 0 } }), true);
});

test('blocks auto-apply when tests are required', () => {
  assert.equal(canAttemptAutoApply({ requirements: { tests: 1, questions: 0 } }), false);
});

test('blocks auto-apply when questions are required', () => {
  assert.equal(canAttemptAutoApply({ requirements: { tests: 0, questions: 2 } }), false);
});

test('blocks auto-apply when both are required', () => {
  assert.equal(canAttemptAutoApply({ requirements: { tests: 2, questions: 2 } }), false);
});

test('treats a missing requirements object as zero (safe default)', () => {
  assert.equal(canAttemptAutoApply({}), true);
});
