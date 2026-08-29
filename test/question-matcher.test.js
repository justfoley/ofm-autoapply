import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  buildMatchPrompt,
  getMatchResponseSchema,
  parseMatchResponse,
  resolveMatch,
  matchQuestionsAgainstBank,
} from '../lib/question-matcher.js';

const ANSWER_BANK = [
  { id: 'a1', question: 'How long have you chatted?', answer: '3 years' },
  { id: 'a2', question: 'What CRMs have you used?', answer: 'Infloww, OnlyMonster' },
];

test('buildMatchPrompt includes the question, every bank entry, and a never-invent instruction', () => {
  const prompt = buildMatchPrompt('How many years of chatting experience do you have?', ANSWER_BANK);
  assert.match(prompt, /How many years of chatting experience do you have\?/);
  assert.match(prompt, /a1/);
  assert.match(prompt, /3 years/);
  assert.match(prompt, /a2/);
  assert.match(prompt, /never write, paraphrase, or guess/i);
});

test('buildMatchPrompt handles an empty answer bank without throwing', () => {
  const prompt = buildMatchPrompt('Any question', []);
  assert.match(prompt, /no stored answers yet/);
});

test('getMatchResponseSchema requires a numeric confidence and allows a nullable matchedAnswerId', () => {
  const schema = getMatchResponseSchema();
  assert.equal(schema.type, 'OBJECT');
  assert.equal(schema.properties.confidence.type, 'NUMBER');
  assert.equal(schema.properties.matchedAnswerId.nullable, true);
  assert.deepEqual(schema.required, ['confidence']);
});

test('parseMatchResponse parses a confident match', () => {
  assert.deepEqual(parseMatchResponse('{"matchedAnswerId":"a1","confidence":0.95}'), {
    matchedAnswerId: 'a1',
    confidence: 0.95,
  });
});

test('parseMatchResponse parses an explicit no-match', () => {
  assert.deepEqual(parseMatchResponse('{"matchedAnswerId":null,"confidence":0}'), {
    matchedAnswerId: null,
    confidence: 0,
  });
});

test('parseMatchResponse treats malformed JSON as no-match rather than throwing', () => {
  assert.deepEqual(parseMatchResponse('not json'), { matchedAnswerId: null, confidence: 0 });
});

test('parseMatchResponse treats a missing confidence field as 0 confidence (resolveMatch is what gates on it)', () => {
  assert.deepEqual(parseMatchResponse('{"matchedAnswerId":"a1"}'), { matchedAnswerId: 'a1', confidence: 0 });
});

test('parseMatchResponse ignores a non-numeric confidence field, defaulting it to 0', () => {
  assert.deepEqual(parseMatchResponse('{"matchedAnswerId":"a1","confidence":"high"}'), {
    matchedAnswerId: 'a1',
    confidence: 0,
  });
});

test('resolveMatch returns the answer bank entry when confidence clears the threshold', () => {
  const entry = resolveMatch({ matchedAnswerId: 'a1', confidence: 0.9 }, ANSWER_BANK);
  assert.equal(entry.id, 'a1');
});

test('resolveMatch returns null when confidence is below the threshold', () => {
  assert.equal(resolveMatch({ matchedAnswerId: 'a1', confidence: 0.5 }, ANSWER_BANK), null);
});

test('resolveMatch returns null exactly at the boundary just under the default threshold', () => {
  assert.equal(
    resolveMatch({ matchedAnswerId: 'a1', confidence: DEFAULT_CONFIDENCE_THRESHOLD - 0.01 }, ANSWER_BANK),
    null,
  );
});

test('resolveMatch returns the entry exactly at the default threshold', () => {
  const entry = resolveMatch({ matchedAnswerId: 'a1', confidence: DEFAULT_CONFIDENCE_THRESHOLD }, ANSWER_BANK);
  assert.equal(entry.id, 'a1');
});

test('resolveMatch returns null when matchedAnswerId is null regardless of confidence', () => {
  assert.equal(resolveMatch({ matchedAnswerId: null, confidence: 1 }, ANSWER_BANK), null);
});

test('resolveMatch defensively returns null when the id does not exist in the bank (e.g. a hallucinated id)', () => {
  assert.equal(resolveMatch({ matchedAnswerId: 'does-not-exist', confidence: 0.99 }, ANSWER_BANK), null);
});

test('matchQuestionsAgainstBank: every required question confidently matched -> allRequiredMatched true, answers attached', async () => {
  const questions = [
    { text: 'How many years of chatting experience?', required: true },
    { text: 'Which CRMs have you used?', required: true },
  ];
  const responses = ['{"matchedAnswerId":"a1","confidence":0.95}', '{"matchedAnswerId":"a2","confidence":0.9}'];
  let call = 0;
  const callGemini = async () => responses[call++];

  const { results, allRequiredMatched } = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini });

  assert.equal(allRequiredMatched, true);
  assert.equal(results[0].answerText, '3 years');
  assert.equal(results[0].matchedAnswerId, 'a1');
  assert.equal(results[1].answerText, 'Infloww, OnlyMonster');
});

test('matchQuestionsAgainstBank: one unmatched required question -> allRequiredMatched false, no answers invented', async () => {
  const questions = [
    { text: 'How many years of chatting experience?', required: true },
    { text: 'How would you handle a slow-to-buy subscriber?', required: true },
  ];
  const responses = ['{"matchedAnswerId":"a1","confidence":0.95}', '{"matchedAnswerId":null,"confidence":0}'];
  let call = 0;
  const callGemini = async () => responses[call++];

  const { results, allRequiredMatched } = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini });

  assert.equal(allRequiredMatched, false);
  assert.equal(results[0].answerText, '3 years');
  assert.equal(results[1].answerText, null);
  assert.equal(results[1].matchedAnswerId, null);
});

test('matchQuestionsAgainstBank: a low-confidence match is treated the same as no match', async () => {
  const questions = [{ text: 'Some question', required: true }];
  const callGemini = async () => '{"matchedAnswerId":"a1","confidence":0.4}';

  const { results, allRequiredMatched } = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini });

  assert.equal(allRequiredMatched, false);
  assert.equal(results[0].answerText, null);
  assert.equal(results[0].confidence, 0.4);
});

test('matchQuestionsAgainstBank: a non-required question is never sent to Gemini and never counted against allRequiredMatched', async () => {
  const questions = [{ text: 'Optional cover note', required: false }];
  let callCount = 0;
  const callGemini = async () => {
    callCount += 1;
    return '{"matchedAnswerId":null,"confidence":0}';
  };

  const { results, allRequiredMatched } = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini });

  assert.equal(callCount, 0);
  assert.equal(allRequiredMatched, true);
  assert.equal(results[0].answerText, null);
});

test('matchQuestionsAgainstBank: honors a custom threshold', async () => {
  const questions = [{ text: 'Some question', required: true }];
  const callGemini = async () => '{"matchedAnswerId":"a1","confidence":0.6}';

  const strict = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini, threshold: 0.9 });
  assert.equal(strict.allRequiredMatched, false);

  const lenient = await matchQuestionsAgainstBank({ questions, answerBank: ANSWER_BANK, callGemini, threshold: 0.5 });
  assert.equal(lenient.allRequiredMatched, true);
});
