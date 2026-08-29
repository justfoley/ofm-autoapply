// Pure CRUD helpers over the captain's true-answer bank (an array of
// {id, question, answer} stored at state.answerBank - see lib/storage.js).
//
// Every `answer` value here must be text the captain personally wrote and
// approved on the options page - lib/question-matcher.js only ever selects
// among these entries (classification), never generates new answer text.
// Keep it that way: nothing in this file or its callers should synthesize
// or edit an `answer` string on the captain's behalf.

/**
 * @typedef {object} AnswerBankEntry
 * @property {string} id
 * @property {string} question - the question text the captain was asked.
 * @property {string} answer - the captain's own true answer, verbatim.
 */

/**
 * Build a new answer bank entry from captain-entered text. Trims whitespace
 * and rejects empty question/answer text so the bank never accumulates
 * unusable entries a match could silently resolve to.
 *
 * @param {{question: string, answer: string}} params
 * @param {() => string} [idGenerator] - defaults to crypto.randomUUID(),
 *   overridable in tests for deterministic ids.
 * @returns {AnswerBankEntry}
 */
export function createAnswerBankEntry({ question, answer }, idGenerator = () => crypto.randomUUID()) {
  const trimmedQuestion = (question || '').trim();
  const trimmedAnswer = (answer || '').trim();
  if (!trimmedQuestion || !trimmedAnswer) {
    throw new Error('answer bank entries need both a question and an answer');
  }
  return { id: idGenerator(), question: trimmedQuestion, answer: trimmedAnswer };
}

/**
 * Insert a new entry or replace an existing one with the same id. Returns a
 * new array; does not mutate the input.
 *
 * @param {AnswerBankEntry[]} bank
 * @param {AnswerBankEntry} entry
 * @returns {AnswerBankEntry[]}
 */
export function upsertAnswerBankEntry(bank, entry) {
  const index = bank.findIndex((existing) => existing.id === entry.id);
  if (index === -1) return [...bank, entry];
  const next = [...bank];
  next[index] = entry;
  return next;
}

/**
 * Remove an entry by id. Returns a new array; does not mutate the input.
 *
 * @param {AnswerBankEntry[]} bank
 * @param {string} id
 * @returns {AnswerBankEntry[]}
 */
export function removeAnswerBankEntry(bank, id) {
  return bank.filter((entry) => entry.id !== id);
}
