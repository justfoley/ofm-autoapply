// Orchestrates the answer-bank-driven screening-questions apply flow for a
// posting that carries a feed "N questions" badge (never "tests" - see
// lib/apply-eligibility.js's requiresScreeningQuestions). Like lib/feed.js
// and lib/apply.js, the DOM-walking functions below run inside a real tab
// via chrome.scripting.executeScript and must stay self-contained (no
// closures/imports survive that serialization boundary) - see AGENTS.md.
//
// Unlike the rest of this file, THIS PAGE'S DOM WAS NEVER DIRECTLY INSPECTED
// - only a captain-supplied screenshot exists (see AGENTS.md's answer-bank
// section and data/ofm-autoapply-5/reference/apply-page-screening-questions.png,
// outside this repo). The selectors below are a best-effort inference from
// that screenshot, not a confirmed DOM dump like lib/feed.js's. Two defenses
// compensate for that uncertainty, both load-bearing - do not remove either
// without a real DOM dump to replace them:
//   1. Extracted question count must exactly match the feed badge's
//      questionCount before anything is matched/filled/submitted - any
//      mismatch (wrong selectors, cover-letter textarea miscounted, page
//      shape different than expected) aborts to 'needs-questions' rather
//      than risk mis-mapping an answer to the wrong question.
//   2. Every fill is read back and verified equal to the intended answer
//      before any submit is attempted; a single failed fill aborts the
//      whole posting rather than submitting a partial application.
//
// The Gemini matching call itself (lib/question-matcher.js) is the actual
// safety boundary on WHAT gets submitted - this file only decides WHERE on
// the page it lands.

import { requiresScreeningQuestions, interpretScreeningSubmitState } from './apply-eligibility.js';
import { matchQuestionsAgainstBank, DEFAULT_CONFIDENCE_THRESHOLD } from './question-matcher.js';
import { callGemini } from './gemini-client.js';

function applyUrlFor(postingId) {
  return `https://ofmjobs.com/dashboard/jobs/${postingId}/apply`;
}

const POST_SUBMIT_SETTLE_MS = 800;
const TAB_LOAD_TIMEOUT_MS = 30000;
const HYDRATION_TIMEOUT_MS = 8000;
const HYDRATION_POLL_INTERVAL_MS = 250;

// Screening-question textareas were observed (screenshot) sharing this exact
// placeholder, distinct from the optional cover-letter textarea's own
// placeholder - this is the primary signal that excludes the cover letter
// from extraction (see AGENTS.md: never touch/fill it).
const SCREENING_PLACEHOLDER = 'Your answer...';

/** Runs inside the target tab. Same pattern as lib/feed.js's waitForTabComplete. */
function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    }
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        cleanup();
        resolve();
      }
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('tab load timed out'));
    }, TAB_LOAD_TIMEOUT_MS);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs inside the target tab - used only to detect hydration (see below). */
function hasScreeningTextareas() {
  return Array.from(document.querySelectorAll('textarea')).some(
    (textarea) => (textarea.getAttribute('placeholder') || '').trim() === 'Your answer...',
  );
}

async function waitForScreeningQuestionsToHydrate(tabId) {
  const deadline = Date.now() + HYDRATION_TIMEOUT_MS;
  for (;;) {
    const [{ result: found }] = await chrome.scripting.executeScript({ target: { tabId }, func: hasScreeningTextareas });
    if (found || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, HYDRATION_POLL_INTERVAL_MS));
  }
}

/**
 * Runs inside the target tab. Extracts each required screening question's
 * text and tags its textarea with a stable data attribute so later
 * fill/read calls can target it without re-deriving the label walk. Never
 * touches the cover-letter textarea (excluded by placeholder, see
 * SCREENING_PLACEHOLDER above).
 *
 * Label extraction is a bounded upward walk from each textarea looking for
 * the nearest ancestor/sibling text matching "N. question text *" -
 * inferred from the screenshot's visual layout (a numbered badge + bold
 * question text directly above each textarea), not a confirmed DOM
 * structure. This is exactly why callers must verify the extracted count
 * against the feed badge before trusting any of it (see module comment).
 */
function extractScreeningQuestionsFromApplyPage() {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const questions = [];
  let index = 0;

  for (const textarea of textareas) {
    if ((textarea.getAttribute('placeholder') || '').trim() !== 'Your answer...') continue;

    let labelText = '';
    let node = textarea;
    for (let hops = 0; hops < 8 && node; hops++) {
      node = node.previousElementSibling || node.parentElement;
      if (!node) break;
      const candidate = (node.textContent || '').trim();
      if (/^\d+\.\s*\S/.test(candidate) && candidate.length < 400) {
        labelText = candidate;
        break;
      }
    }

    const match = labelText.match(/^(\d+)\.\s*(.+?)\s*\*?\s*$/);
    const text = (match ? match[2] : labelText).replace(/\*\s*$/, '').trim();

    textarea.setAttribute('data-ofm-autoapply-question-index', String(index));
    questions.push({ index, text, required: true });
    index += 1;
  }

  return questions;
}

/** Runs inside the target tab. Fills one textarea and reads its value back. */
function fillScreeningAnswer(index, value) {
  const textarea = document.querySelector(`textarea[data-ofm-autoapply-question-index="${index}"]`);
  if (!textarea) return { filled: false };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  return { filled: textarea.value === value };
}

/**
 * Runs inside the target tab. Tags the "Submit application" button by a
 * stable attribute *before* clicking, so post-click state can be read back
 * even if the button's own label changes (e.g. to "Submitted") - matching
 * it by label again post-click would fail to find a relabeled button and
 * misread a real success as "not found" in the wrong way.
 */
function tagSubmitButton() {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    /submit application/i.test((candidate.textContent || '').trim()),
  );
  if (!button) return false;
  button.setAttribute('data-ofm-autoapply-submit-button', 'true');
  return true;
}

/** Runs inside the target tab. See tagSubmitButton. */
function clickTaggedSubmitButton() {
  const button = document.querySelector('[data-ofm-autoapply-submit-button="true"]');
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
  button.click();
  return true;
}

/** Runs inside the target tab. See tagSubmitButton. */
function readTaggedSubmitButtonState() {
  const button = document.querySelector('[data-ofm-autoapply-submit-button="true"]');
  return {
    buttonFound: Boolean(button),
    buttonDisabled: button ? Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true') : null,
    buttonLabel: button ? (button.textContent || '').trim() : null,
    url: window.location.href,
  };
}

/**
 * Attempt the full screening-questions apply flow for one posting: navigate
 * to its /apply page, scrape required questions, match every one against
 * the captain's answer bank via Gemini (classification only - see
 * lib/question-matcher.js), and only if EVERY required question got a
 * confident match, fill and submit. Any failure at any step - extraction
 * mismatch, an unmatched question, a failed fill, a missing submit button -
 * aborts without submitting anything and reports 'needs-questions', exactly
 * today's behavior for these postings.
 *
 * @param {import('./posting-parser.js').Posting} posting
 * @param {object} config
 * @param {import('./answer-bank.js').AnswerBankEntry[]} config.answerBank
 * @param {string} config.geminiApiKey
 * @param {number} [config.threshold]
 * @returns {Promise<{status: 'applied'|'applied-unconfirmed'|'needs-questions', reason?: string, screeningMatches?: Array<object>}>}
 */
export async function applyToScreeningQuestionsPosting(
  posting,
  { answerBank, geminiApiKey, threshold = DEFAULT_CONFIDENCE_THRESHOLD },
) {
  if (!requiresScreeningQuestions(posting)) {
    return { status: 'needs-questions', reason: 'requires-application-questions' };
  }

  const applyUrl = applyUrlFor(posting.id);
  const tab = await chrome.tabs.create({ url: applyUrl, active: false });
  try {
    await waitForTabComplete(tab.id);
    await waitForScreeningQuestionsToHydrate(tab.id);

    const [{ result: questions }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractScreeningQuestionsFromApplyPage,
    });

    const expectedCount = posting.questionCount || 0;
    if (!Array.isArray(questions) || questions.length === 0 || questions.length !== expectedCount) {
      return { status: 'needs-questions', reason: 'apply-page-questions-not-found' };
    }

    const { results, allRequiredMatched } = await matchQuestionsAgainstBank({
      questions,
      answerBank,
      callGemini: (prompt, responseSchema) => callGemini({ apiKey: geminiApiKey, prompt, responseSchema }),
      threshold,
    });

    if (!allRequiredMatched) {
      return { status: 'needs-questions', reason: 'no-confident-answer-match', screeningMatches: results };
    }

    const [{ result: tagged }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: tagSubmitButton,
    });
    if (!tagged) {
      return { status: 'needs-questions', reason: 'submit-button-not-found', screeningMatches: results };
    }

    for (let i = 0; i < questions.length; i++) {
      const [{ result: fillResult }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillScreeningAnswer,
        args: [questions[i].index, results[i].answerText],
      });
      if (!fillResult || !fillResult.filled) {
        return { status: 'needs-questions', reason: 'answer-fill-failed', screeningMatches: results };
      }
    }

    const [{ result: clicked }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickTaggedSubmitButton,
    });
    if (!clicked) {
      return { status: 'needs-questions', reason: 'submit-click-failed', screeningMatches: results };
    }

    await delay(POST_SUBMIT_SETTLE_MS);

    const [{ result: postSubmitState }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readTaggedSubmitButtonState,
    });
    const status = interpretScreeningSubmitState({ applyUrl, postSubmitState });
    return { status, screeningMatches: results };
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
