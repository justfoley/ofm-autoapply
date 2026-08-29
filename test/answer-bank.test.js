import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerBankEntry, upsertAnswerBankEntry, removeAnswerBankEntry } from '../lib/answer-bank.js';

test('createAnswerBankEntry trims whitespace and generates an id', () => {
  const entry = createAnswerBankEntry({ question: '  How long?  ', answer: '  3 years  ' }, () => 'fixed-id');
  assert.deepEqual(entry, { id: 'fixed-id', question: 'How long?', answer: '3 years' });
});

test('createAnswerBankEntry rejects an empty question', () => {
  assert.throws(() => createAnswerBankEntry({ question: '   ', answer: 'yes' }));
});

test('createAnswerBankEntry rejects an empty answer', () => {
  assert.throws(() => createAnswerBankEntry({ question: 'CRMs used?', answer: '  ' }));
});

test('upsertAnswerBankEntry appends a new entry without mutating the input array', () => {
  const bank = [{ id: 'a', question: 'Q1', answer: 'A1' }];
  const next = upsertAnswerBankEntry(bank, { id: 'b', question: 'Q2', answer: 'A2' });
  assert.deepEqual(bank, [{ id: 'a', question: 'Q1', answer: 'A1' }]);
  assert.deepEqual(next, [
    { id: 'a', question: 'Q1', answer: 'A1' },
    { id: 'b', question: 'Q2', answer: 'A2' },
  ]);
});

test('upsertAnswerBankEntry replaces an existing entry with the same id in place', () => {
  const bank = [
    { id: 'a', question: 'Q1', answer: 'A1' },
    { id: 'b', question: 'Q2', answer: 'A2' },
  ];
  const next = upsertAnswerBankEntry(bank, { id: 'a', question: 'Q1 edited', answer: 'A1 edited' });
  assert.deepEqual(next, [
    { id: 'a', question: 'Q1 edited', answer: 'A1 edited' },
    { id: 'b', question: 'Q2', answer: 'A2' },
  ]);
});

test('removeAnswerBankEntry drops the matching entry without mutating the input array', () => {
  const bank = [
    { id: 'a', question: 'Q1', answer: 'A1' },
    { id: 'b', question: 'Q2', answer: 'A2' },
  ];
  const next = removeAnswerBankEntry(bank, 'a');
  assert.deepEqual(bank.length, 2);
  assert.deepEqual(next, [{ id: 'b', question: 'Q2', answer: 'A2' }]);
});

test('removeAnswerBankEntry is a no-op when the id is not present', () => {
  const bank = [{ id: 'a', question: 'Q1', answer: 'A1' }];
  assert.deepEqual(removeAnswerBankEntry(bank, 'missing'), bank);
});
