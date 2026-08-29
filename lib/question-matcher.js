// Matches a live screening question against the captain's answer bank
// (lib/answer-bank.js) via Gemini - classification/selection only. The
// prompt built here explicitly forbids drafting new content: Gemini may only
// point at an existing answer bank id, or say none confidently match. See
// AGENTS.md's answer-bank section for the safety rationale this codifies -
// resolveMatch() below is the single place a low-confidence or missing match
// gets turned into "don't submit," and every caller must treat `answerText:
// null` as a hard stop, never a fallback to guessed text.

// Conservative on purpose: a wrong auto-filled answer is worse than an extra
// posting landing in needs-questions for the captain to handle by hand.
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

const MATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matchedAnswerId: {
      type: 'STRING',
      nullable: true,
      description: 'The id of the existing answer that confidently answers the question, or null if none do.',
    },
    confidence: {
      type: 'NUMBER',
      description: '0.0-1.0 confidence that matchedAnswerId directly and correctly answers the question. 0 when matchedAnswerId is null.',
    },
  },
  required: ['confidence'],
};

/** @param {import('./answer-bank.js').AnswerBankEntry[]} answerBank */
function formatAnswerBankForPrompt(answerBank) {
  if (answerBank.length === 0) return '(no stored answers yet)';
  return answerBank.map((entry) => `- id: ${entry.id}\n  question: "${entry.question}"\n  answer: "${entry.answer}"`).join('\n');
}

/**
 * Build the classification-only prompt sent to Gemini for one live question.
 * Never asks Gemini to write or paraphrase an answer - only to pick an
 * existing id or decline.
 *
 * @param {string} questionText
 * @param {import('./answer-bank.js').AnswerBankEntry[]} answerBank
 * @returns {string}
 */
export function buildMatchPrompt(questionText, answerBank) {
  return [
    'You are checking whether an EXISTING, human-written answer directly and confidently answers a NEW job application screening question.',
    'You must never write, paraphrase, or guess new answer text - only select the id of an existing answer below, or say none match.',
    '',
    'Existing answers:',
    formatAnswerBankForPrompt(answerBank),
    '',
    `New question: "${questionText}"`,
    '',
    'Pick the id of the existing answer that most directly answers this exact question. If no existing answer clearly and confidently answers this specific question - including any question that calls for judgment, opinion, a scenario-specific response, or anything not already covered by a stored fact - respond with matchedAnswerId null and confidence 0. Do not select a partial or approximate match.',
  ].join('\n');
}

/** @returns {object} the Gemini responseSchema used for match requests. */
export function getMatchResponseSchema() {
  return MATCH_RESPONSE_SCHEMA;
}

/**
 * Parse Gemini's raw JSON-mode text response for one match request.
 * Defensive against a malformed/missing field: anything not a clean
 * {matchedAnswerId, confidence} shape resolves to "no match" rather than
 * throwing, since a parse hiccup must never be treated as a confident match.
 *
 * @param {string} rawText
 * @returns {{matchedAnswerId: string|null, confidence: number}}
 */
export function parseMatchResponse(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { matchedAnswerId: null, confidence: 0 };
  }
  const confidence = typeof parsed?.confidence === 'number' && Number.isFinite(parsed.confidence) ? parsed.confidence : 0;
  const matchedAnswerId = typeof parsed?.matchedAnswerId === 'string' && parsed.matchedAnswerId ? parsed.matchedAnswerId : null;
  return { matchedAnswerId, confidence };
}

/**
 * Decide whether a parsed match result clears the confidence bar and
 * actually resolves to a real answer bank entry. The single gate between
 * "Gemini said something" and "safe to submit."
 *
 * @param {{matchedAnswerId: string|null, confidence: number}} parsed
 * @param {import('./answer-bank.js').AnswerBankEntry[]} answerBank
 * @param {number} [threshold]
 * @returns {import('./answer-bank.js').AnswerBankEntry|null}
 */
export function resolveMatch(parsed, answerBank, threshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  if (!parsed.matchedAnswerId || parsed.confidence < threshold) return null;
  return answerBank.find((entry) => entry.id === parsed.matchedAnswerId) || null;
}

/**
 * @typedef {object} QuestionMatchResult
 * @property {string} question - the live question text.
 * @property {boolean} required
 * @property {number} confidence
 * @property {string|null} matchedAnswerId
 * @property {string|null} matchedQuestion - the stored bank question text, for audit.
 * @property {string|null} answerText - the captain's stored answer text to submit, or null.
 */

/**
 * Match every required live question against the answer bank. Pure given an
 * injected `callGemini(prompt, responseSchema)` - no chrome/DOM/network
 * dependency, so this is the core orchestration unit-tested with a mock.
 *
 * @param {object} params
 * @param {Array<{text: string, required?: boolean}>} params.questions
 * @param {import('./answer-bank.js').AnswerBankEntry[]} params.answerBank
 * @param {(prompt: string, responseSchema: object) => Promise<string>} params.callGemini
 * @param {number} [params.threshold]
 * @returns {Promise<{results: QuestionMatchResult[], allRequiredMatched: boolean}>}
 */
export async function matchQuestionsAgainstBank({ questions, answerBank, callGemini, threshold = DEFAULT_CONFIDENCE_THRESHOLD }) {
  const results = [];
  for (const question of questions) {
    const required = question.required !== false;
    let matchedEntry = null;
    let confidence = 0;

    if (required) {
      const prompt = buildMatchPrompt(question.text, answerBank);
      const rawText = await callGemini(prompt, MATCH_RESPONSE_SCHEMA);
      const parsed = parseMatchResponse(rawText);
      confidence = parsed.confidence;
      matchedEntry = resolveMatch(parsed, answerBank, threshold);
    }

    results.push({
      question: question.text,
      required,
      confidence,
      matchedAnswerId: matchedEntry ? matchedEntry.id : null,
      matchedQuestion: matchedEntry ? matchedEntry.question : null,
      answerText: matchedEntry ? matchedEntry.answer : null,
    });
  }

  const allRequiredMatched = results.every((result) => !result.required || result.answerText !== null);
  return { results, allRequiredMatched };
}
