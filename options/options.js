import { loadState, saveState } from '../lib/storage.js';
import { createAnswerBankEntry, upsertAnswerBankEntry, removeAnswerBankEntry } from '../lib/answer-bank.js';
import { testGeminiApiKey } from '../lib/gemini-client.js';

const KEY_STATUS_MESSAGES = {
  ok: 'Key works - Gemini responded successfully.',
  'missing-api-key': 'Enter a key first.',
  'invalid-api-key': "That key didn't work - double-check it and try again.",
  'network-error': "Couldn't reach Gemini - check your connection and try again.",
};

const geminiKeyInput = document.getElementById('gemini-key-input');
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
const saveKeyBtn = document.getElementById('save-key-btn');
const testKeyBtn = document.getElementById('test-key-btn');
const keyStatus = document.getElementById('key-status');
const addAnswerForm = document.getElementById('add-answer-form');
const newQuestionInput = document.getElementById('new-question');
const newAnswerInput = document.getElementById('new-answer');
const answerBankList = document.getElementById('answer-bank-list');
const answerBankEmpty = document.getElementById('answer-bank-empty');

init();

async function init() {
  const state = await loadState();
  geminiKeyInput.value = state.geminiApiKey || '';
  renderAnswerBank(state.answerBank || []);

  toggleKeyVisibilityBtn.addEventListener('click', onToggleKeyVisibility);
  saveKeyBtn.addEventListener('click', onSaveKey);
  testKeyBtn.addEventListener('click', onTestKey);
  addAnswerForm.addEventListener('submit', onAddAnswer);
}

function onToggleKeyVisibility() {
  const showing = geminiKeyInput.type === 'text';
  geminiKeyInput.type = showing ? 'password' : 'text';
  toggleKeyVisibilityBtn.textContent = showing ? 'Show' : 'Hide';
}

async function onSaveKey() {
  const state = await loadState();
  await saveState({ ...state, geminiApiKey: geminiKeyInput.value.trim() });
  showKeyStatus('pending', 'Saved.');
}

async function onTestKey() {
  const apiKey = geminiKeyInput.value.trim();
  testKeyBtn.disabled = true;
  showKeyStatus('pending', 'Testing...');
  try {
    const result = await testGeminiApiKey({ apiKey });
    if (result.ok) {
      showKeyStatus('ok', KEY_STATUS_MESSAGES.ok);
    } else {
      showKeyStatus('error', KEY_STATUS_MESSAGES[result.error] || `Test failed (${result.error}).`);
    }
  } finally {
    testKeyBtn.disabled = false;
  }
}

function showKeyStatus(kind, message) {
  keyStatus.hidden = false;
  keyStatus.className = `key-status ${kind}`;
  keyStatus.textContent = message;
}

async function onAddAnswer(event) {
  event.preventDefault();
  const question = newQuestionInput.value;
  const answer = newAnswerInput.value;

  let entry;
  try {
    entry = createAnswerBankEntry({ question, answer });
  } catch {
    return; // required-field validation already surfaced by the form itself
  }

  const state = await loadState();
  const answerBank = upsertAnswerBankEntry(state.answerBank || [], entry);
  await saveState({ ...state, answerBank });

  newQuestionInput.value = '';
  newAnswerInput.value = '';
  renderAnswerBank(answerBank);
}

function renderAnswerBank(answerBank) {
  answerBankList.replaceChildren();
  answerBankEmpty.hidden = answerBank.length > 0;

  for (const entry of answerBank) {
    answerBankList.append(buildAnswerEntryElement(entry));
  }
}

function buildAnswerEntryElement(entry) {
  const li = document.createElement('li');
  li.className = 'answer-entry';

  const q = document.createElement('p');
  q.className = 'q';
  q.textContent = entry.question;

  const a = document.createElement('p');
  a.className = 'a';
  a.textContent = entry.answer;

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-secondary';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => enterEditMode(li, entry));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => onDeleteAnswer(entry.id));

  actions.append(editBtn, deleteBtn);
  li.append(q, a, actions);
  return li;
}

function enterEditMode(li, entry) {
  li.replaceChildren();

  const questionField = document.createElement('textarea');
  questionField.rows = 2;
  questionField.value = entry.question;

  const answerField = document.createElement('textarea');
  answerField.rows = 3;
  answerField.value = entry.answer;

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => onSaveEdit(entry.id, questionField.value, answerField.value));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', async () => renderAnswerBank((await loadState()).answerBank || []));

  actions.append(saveBtn, cancelBtn);
  li.append(questionField, answerField, actions);
}

async function onSaveEdit(id, question, answer) {
  let updated;
  try {
    updated = { id, ...stripId(createAnswerBankEntry({ question, answer })) };
  } catch {
    return;
  }

  const state = await loadState();
  const answerBank = upsertAnswerBankEntry(state.answerBank || [], updated);
  await saveState({ ...state, answerBank });
  renderAnswerBank(answerBank);
}

function stripId({ question, answer }) {
  return { question, answer };
}

async function onDeleteAnswer(id) {
  if (!window.confirm('Delete this saved answer?')) return;
  const state = await loadState();
  const answerBank = removeAnswerBankEntry(state.answerBank || [], id);
  await saveState({ ...state, answerBank });
  renderAnswerBank(answerBank);
}
