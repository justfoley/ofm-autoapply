/**
 * Decide, from information already visible on the job card (before ever
 * clicking Apply), whether a posting is safe to attempt full auto-apply on.
 *
 * JUDGMENT CALL - documented in the PR description, revisit if wrong: in the
 * captain-supplied reference DOM dump (see AGENTS.md), every one of the ~18
 * sampled postings required at least one "language" and one "tool", but only
 * about half additionally required "tests" and/or "questions". Gating on
 * language/tool too would mean the extension never auto-applies to anything,
 * so this only treats tests/questions as blocking - those most plausibly mean
 * free-response or assessment content the extension can't safely fill in,
 * per the brief's rule to never guess at form fields. Language/tool
 * requirements are assumed (not confirmed) to be matched against the
 * captain's existing account profile rather than requiring new free-text
 * input at apply time.
 *
 * This is a pre-click check, not the only safety net: lib/apply.js also
 * checks for a confirmation dialog/modal after clicking Apply and falls back
 * to 'needs-manual' if one appears, since the real post-click behavior for
 * even a "safe" posting is still unconfirmed.
 *
 * @param {{requirements?: {tests?: number, questions?: number}}} posting
 * @returns {boolean}
 */
export function canAttemptAutoApply(posting) {
  const { tests = 0, questions = 0 } = posting.requirements || {};
  return tests === 0 && questions === 0;
}
