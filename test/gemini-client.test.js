import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_MODEL,
  buildGenerateContentUrl,
  buildListModelsUrl,
  buildGenerateContentBody,
  extractGeminiText,
  callGemini,
  testGeminiApiKey,
} from '../lib/gemini-client.js';

test('buildGenerateContentUrl embeds the model and URL-encodes the key', () => {
  const url = buildGenerateContentUrl('a key/with+chars', 'gemini-3.6-flash');
  assert.equal(
    url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=a%20key%2Fwith%2Bchars',
  );
});

test('buildGenerateContentUrl defaults to GEMINI_MODEL', () => {
  assert.match(buildGenerateContentUrl('k'), new RegExp(`/models/${GEMINI_MODEL}:generateContent`));
});

test('buildListModelsUrl URL-encodes the key', () => {
  assert.equal(buildListModelsUrl('a/b'), 'https://generativelanguage.googleapis.com/v1beta/models?key=a%2Fb');
});

test('buildGenerateContentBody omits generationConfig when no schema is given', () => {
  assert.deepEqual(buildGenerateContentBody('hello'), {
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
  });
});

test('buildGenerateContentBody sets JSON response mode and the schema when given', () => {
  const schema = { type: 'OBJECT', properties: {} };
  assert.deepEqual(buildGenerateContentBody('hello', schema), {
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  });
});

test('extractGeminiText pulls the first candidate\'s text part', () => {
  const response = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] };
  assert.equal(extractGeminiText(response), '{"ok":true}');
});

test('extractGeminiText throws when the expected shape is missing', () => {
  assert.throws(() => extractGeminiText({}));
  assert.throws(() => extractGeminiText({ candidates: [] }));
});

test('callGemini posts to the generateContent URL and returns the extracted text', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'result-text' }] } }] }),
    };
  };

  const text = await callGemini({ apiKey: 'k', prompt: 'p', fetchImpl });

  assert.equal(text, 'result-text');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /models\/.*:generateContent\?key=k/);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), buildGenerateContentBody('p', undefined));
});

test('callGemini throws with the status code when the response is not ok', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'server exploded' });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'p', fetchImpl }), /gemini-request-failed-500/);
});

test('testGeminiApiKey: missing key fails fast without calling fetch', async () => {
  let called = false;
  const result = await testGeminiApiKey({ apiKey: '  ', fetchImpl: async () => { called = true; } });
  assert.deepEqual(result, { ok: false, error: 'missing-api-key' });
  assert.equal(called, false);
});

test('testGeminiApiKey: ok on a 200 response', async () => {
  const result = await testGeminiApiKey({ apiKey: 'good-key', fetchImpl: async () => ({ ok: true, status: 200 }) });
  assert.deepEqual(result, { ok: true });
});

test('testGeminiApiKey: reports invalid-api-key on 400 (confirmed live shape for a bad key)', async () => {
  const result = await testGeminiApiKey({ apiKey: 'bad-key', fetchImpl: async () => ({ ok: false, status: 400 }) });
  assert.deepEqual(result, { ok: false, error: 'invalid-api-key' });
});

test('testGeminiApiKey: reports invalid-api-key on 403', async () => {
  const result = await testGeminiApiKey({ apiKey: 'bad-key', fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.deepEqual(result, { ok: false, error: 'invalid-api-key' });
});

test('testGeminiApiKey: reports a generic request-failed error for other statuses', async () => {
  const result = await testGeminiApiKey({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.deepEqual(result, { ok: false, error: 'request-failed-503' });
});

test('testGeminiApiKey: reports network-error when fetch itself throws', async () => {
  const result = await testGeminiApiKey({
    apiKey: 'k',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.deepEqual(result, { ok: false, error: 'network-error' });
});
