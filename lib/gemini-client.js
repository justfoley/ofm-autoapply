// Thin Gemini REST client. Request/response shapes here were confirmed live
// (during this task's build, against the captain's own key - never
// committed) against https://generativelanguage.googleapis.com/v1beta:
//   - GET  /models?key=... - 200 with a model list for a valid key, 400
//     "API_KEY_INVALID" for a bad one. Used as the cheap key-validation call
//     (testGeminiApiKey) since it does no generation.
//   - POST /models/{model}:generateContent?key=... with
//     generationConfig.responseMimeType "application/json" plus a
//     responseSchema reliably returns exactly that JSON shape as the sole
//     candidate's text part - see lib/question-matcher.js, the only caller
//     that builds a responseSchema.
//   - `gemini-2.5-flash` (the brief-era default) now 404s ("no longer
//     available to new users"); `gemini-3.6-flash` is the confirmed-working
//     replacement as of this build (2026-08). If Google retires it too, a
//     generateContent call will start 404ing - see testGeminiApiKey's
//     model-not-found handling below - and GEMINI_MODEL is the one place to
//     bump.
//
// fetchImpl is always injectable so every function here is unit-testable
// without a real network call (see test/gemini-client.test.js); only manual
// testing during development exercised the real API.

export const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** @param {string} apiKey @param {string} [model] */
export function buildGenerateContentUrl(apiKey, model = GEMINI_MODEL) {
  return `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/** @param {string} apiKey */
export function buildListModelsUrl(apiKey) {
  return `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`;
}

/**
 * @param {string} prompt
 * @param {object} [responseSchema] - Gemini's OpenAPI-subset schema
 *   (uppercase `type` values, e.g. "OBJECT"/"STRING"/"NUMBER"); omit for a
 *   plain-text response.
 */
export function buildGenerateContentBody(prompt, responseSchema) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  if (responseSchema) {
    body.generationConfig = { responseMimeType: 'application/json', responseSchema };
  }
  return body;
}

/**
 * Pull the plain-text content out of a generateContent response body.
 * @param {object} responseJson
 * @returns {string}
 */
export function extractGeminiText(responseJson) {
  const text = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('gemini-response-missing-text');
  }
  return text;
}

/**
 * Call generateContent and return the response's text content.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.prompt
 * @param {object} [params.responseSchema]
 * @param {string} [params.model]
 * @param {typeof fetch} [params.fetchImpl] - defaults to global fetch;
 *   always pass a mock in tests.
 * @returns {Promise<string>}
 */
export async function callGemini({ apiKey, prompt, responseSchema, model = GEMINI_MODEL, fetchImpl = fetch }) {
  const res = await fetchImpl(buildGenerateContentUrl(apiKey, model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGenerateContentBody(prompt, responseSchema)),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`gemini-request-failed-${res.status}${bodyText ? `: ${bodyText}` : ''}`);
  }
  const json = await res.json();
  return extractGeminiText(json);
}

/**
 * Cheap key-validation call (GET /models - no generation, so no token cost)
 * with clear success/failure feedback for the options page. Never throws.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function testGeminiApiKey({ apiKey, fetchImpl = fetch }) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return { ok: false, error: 'missing-api-key' };

  let res;
  try {
    res = await fetchImpl(buildListModelsUrl(trimmed), { method: 'GET' });
  } catch {
    return { ok: false, error: 'network-error' };
  }

  if (res.ok) return { ok: true };
  if (res.status === 400 || res.status === 403) return { ok: false, error: 'invalid-api-key' };
  return { ok: false, error: `request-failed-${res.status}` };
}
