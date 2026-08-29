import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAutoApplyPosting,
  canClickApply,
  describeUnexpectedApplyState,
  interpretPostClickState,
} from '../lib/apply-eligibility.js';

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

test('canAutoApplyPosting: eligible for a posting with no question/test badge', () => {
  assert.deepEqual(canAutoApplyPosting({ questionCount: 0, testCount: 0 }), { eligible: true });
});

test('canAutoApplyPosting: eligible when questionCount/testCount are absent entirely', () => {
  assert.deepEqual(canAutoApplyPosting({}), { eligible: true });
});

test('canAutoApplyPosting: not eligible when the posting has application questions', () => {
  assert.deepEqual(canAutoApplyPosting({ questionCount: 2, testCount: 0 }), {
    eligible: false,
    reason: 'requires-application-questions',
  });
});

test('canAutoApplyPosting: not eligible when the posting has tests (no questions)', () => {
  assert.deepEqual(canAutoApplyPosting({ questionCount: 0, testCount: 1 }), {
    eligible: false,
    reason: 'requires-application-questions',
  });
});

test('interpretPostClickState: needs-questions when a dialog appeared after the click', () => {
  assert.equal(
    interpretPostClickState({ found: true, hasApplyButton: true, isDisabled: false, label: 'Apply', dialogOpened: true }),
    'needs-questions',
  );
});

test('interpretPostClickState: needs-questions when the tab navigated away from the feed', () => {
  assert.equal(
    interpretPostClickState({ found: false, navigatedAwayFromFeed: true }),
    'needs-questions',
  );
});

test('interpretPostClickState: the dialog/navigation backstop takes precedence over a card that otherwise looks applied', () => {
  assert.equal(
    interpretPostClickState({ found: false, dialogOpened: true }),
    'needs-questions',
  );
});

test('describeUnexpectedApplyState: names the dialog when one opened', () => {
  assert.equal(describeUnexpectedApplyState({ dialogOpened: true, navigatedAwayFromFeed: false }), 'apply-opened-a-dialog');
});

test('describeUnexpectedApplyState: names the navigation when the tab moved away from the feed', () => {
  assert.equal(
    describeUnexpectedApplyState({ dialogOpened: false, navigatedAwayFromFeed: true }),
    'apply-navigated-away-from-feed',
  );
});

test('describeUnexpectedApplyState: undefined when neither signal fired', () => {
  assert.equal(describeUnexpectedApplyState({}), undefined);
});
