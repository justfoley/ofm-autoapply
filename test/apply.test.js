import { test } from 'node:test';
import assert from 'node:assert/strict';

// applyToPosting's plain-click path opens a real chrome.tabs, so it's left
// untested per the project's DOM-shim convention (see AGENTS.md). This file
// only covers the new pure branching decision added on top of it: whether a
// questions-badge posting is handed to the answer-bank screening flow
// (lib/screening-apply.js, mocked here) or still falls straight back to
// today's 'needs-questions', unchanged - both of those return before ever
// touching chrome.tabs, so no chrome mock is needed.

const QUESTIONS_POSTING = { id: 'p1', title: 'Chatter', categories: [], url: 'https://x/p1', questionCount: 2, testCount: 0 };
const TESTS_POSTING = { id: 'p2', title: 'Chatter', categories: [], url: 'https://x/p2', questionCount: 0, testCount: 1 };
const ANSWER_BANK = [{ id: 'a1', question: 'Q', answer: 'A' }];

test('applyToPosting delegates to the screening-questions flow when a questions posting has a configured Gemini key and a non-empty answer bank', async (t) => {
  let delegatedWith;
  t.mock.module('../lib/screening-apply.js', {
    namedExports: {
      applyToScreeningQuestionsPosting: async (posting, config) => {
        delegatedWith = { posting, config };
        return { status: 'applied', screeningMatches: [] };
      },
    },
  });

  const { applyToPosting } = await import('../lib/apply.js');
  const result = await applyToPosting(QUESTIONS_POSTING, { answerBank: ANSWER_BANK, geminiApiKey: 'k' });

  assert.deepEqual(result, { status: 'applied', screeningMatches: [] });
  assert.equal(delegatedWith.posting, QUESTIONS_POSTING);
  assert.deepEqual(delegatedWith.config, { answerBank: ANSWER_BANK, geminiApiKey: 'k' });
});

test('applyToPosting falls back to needs-questions without delegating when no Gemini key is configured', async (t) => {
  let called = false;
  t.mock.module('../lib/screening-apply.js', {
    namedExports: {
      applyToScreeningQuestionsPosting: async () => {
        called = true;
        return { status: 'applied' };
      },
    },
  });

  const { applyToPosting } = await import('../lib/apply.js');
  const result = await applyToPosting(QUESTIONS_POSTING, { answerBank: ANSWER_BANK, geminiApiKey: '' });

  assert.equal(called, false, 'must never open the /apply tab when there is nothing to match against');
  assert.deepEqual(result, { status: 'needs-questions', reason: 'requires-application-questions' });
});

test('applyToPosting falls back to needs-questions without delegating when the answer bank is empty', async (t) => {
  let called = false;
  t.mock.module('../lib/screening-apply.js', {
    namedExports: {
      applyToScreeningQuestionsPosting: async () => {
        called = true;
        return { status: 'applied' };
      },
    },
  });

  const { applyToPosting } = await import('../lib/apply.js');
  const result = await applyToPosting(QUESTIONS_POSTING, { answerBank: [], geminiApiKey: 'k' });

  assert.equal(called, false);
  assert.deepEqual(result, { status: 'needs-questions', reason: 'requires-application-questions' });
});

test('applyToPosting never delegates a tests-badge posting to the screening flow, even fully configured', async (t) => {
  let called = false;
  t.mock.module('../lib/screening-apply.js', {
    namedExports: {
      applyToScreeningQuestionsPosting: async () => {
        called = true;
        return { status: 'applied' };
      },
    },
  });

  const { applyToPosting } = await import('../lib/apply.js');
  const result = await applyToPosting(TESTS_POSTING, { answerBank: ANSWER_BANK, geminiApiKey: 'k' });

  assert.equal(called, false, 'tests requirement is still unconfirmed and must stay on the conservative fallback');
  assert.deepEqual(result, { status: 'needs-questions', reason: 'requires-application-questions' });
});

test('applyToPosting called with no config at all still falls back safely (default-safe for existing callers)', async (t) => {
  let called = false;
  t.mock.module('../lib/screening-apply.js', {
    namedExports: {
      applyToScreeningQuestionsPosting: async () => {
        called = true;
        return { status: 'applied' };
      },
    },
  });

  const { applyToPosting } = await import('../lib/apply.js');
  const result = await applyToPosting(QUESTIONS_POSTING);

  assert.equal(called, false);
  assert.deepEqual(result, { status: 'needs-questions', reason: 'requires-application-questions' });
});
