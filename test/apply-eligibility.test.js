import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canClickApply, interpretPostClickState } from '../lib/apply-eligibility.js';

test('canClickApply: eligible when the card has a plain "Apply" button', () => {
  assert.deepEqual(canClickApply({ found: true, hasApplyButton: true, isDisabled: false, label: 'Apply' }), {
    eligible: true,
  });
});

test('canClickApply: not eligible when the posting was not found on the page', () => {
  assert.deepEqual(canClickApply({ found: false }), {
    eligible: false,
    reason: 'posting-not-found-in-page',
  });
});

test('canClickApply: not eligible when the card has no Apply button', () => {
  assert.deepEqual(canClickApply({ found: true, hasApplyButton: false }), {
    eligible: false,
    reason: 'apply-button-not-found',
  });
});

test('canClickApply: not eligible when the button is already disabled', () => {
  assert.deepEqual(
    canClickApply({ found: true, hasApplyButton: true, isDisabled: true, label: 'Apply' }),
    { eligible: false, reason: 'already-applied-or-disabled' },
  );
});

test('canClickApply: not eligible when the button is already relabeled (e.g. "Applied")', () => {
  assert.deepEqual(
    canClickApply({ found: true, hasApplyButton: true, isDisabled: false, label: 'Applied' }),
    { eligible: false, reason: 'already-applied-or-disabled' },
  );
});

test('interpretPostClickState: applied when the card disappeared from the feed', () => {
  assert.equal(interpretPostClickState({ found: false }), 'applied');
});

test('interpretPostClickState: applied when the button became disabled', () => {
  assert.equal(
    interpretPostClickState({ found: true, hasApplyButton: true, isDisabled: true, label: 'Apply' }),
    'applied',
  );
});

test('interpretPostClickState: applied when the button was relabeled', () => {
  assert.equal(
    interpretPostClickState({ found: true, hasApplyButton: true, isDisabled: false, label: 'Applied' }),
    'applied',
  );
});

test('interpretPostClickState: unconfirmed when nothing observably changed', () => {
  assert.equal(
    interpretPostClickState({ found: true, hasApplyButton: true, isDisabled: false, label: 'Apply' }),
    'applied-unconfirmed',
  );
});

test('interpretPostClickState: unconfirmed when the card remains but the button itself vanished', () => {
  assert.equal(interpretPostClickState({ found: true, hasApplyButton: false }), 'applied-unconfirmed');
});
