import { loadState, saveState } from '../lib/storage.js';
import { DEFAULT_CATEGORIES } from '../lib/categories.js';

const masterToggle = document.getElementById('master-toggle');
const masterToggleLabel = document.getElementById('master-toggle-label');
const categoryList = document.getElementById('category-list');
const logList = document.getElementById('log-list');
const logEmpty = document.getElementById('log-empty');

init();

async function init() {
  const state = await loadState();

  masterToggle.checked = state.masterEnabled;
  masterToggleLabel.textContent = state.masterEnabled ? 'On' : 'Off';
  masterToggle.addEventListener('change', onMasterToggleChange);

  renderCategories(state.selectedCategories);
  renderLog(state.log);
}

async function onMasterToggleChange(event) {
  const masterEnabled = event.target.checked;
  masterToggleLabel.textContent = masterEnabled ? 'On' : 'Off';
  const state = await loadState();
  await saveState({ ...state, masterEnabled });
}

function renderCategories(selectedCategories) {
  const selected = new Set(selectedCategories);
  categoryList.replaceChildren();

  for (const category of DEFAULT_CATEGORIES) {
    const li = document.createElement('li');
    const label = document.createElement('label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(category);
    checkbox.addEventListener('change', () => onCategoryToggle(category, checkbox.checked));

    const text = document.createElement('span');
    text.textContent = category;

    label.append(checkbox, text);
    li.append(label);
    categoryList.append(li);
  }
}

async function onCategoryToggle(category, isChecked) {
  const state = await loadState();
  const selected = new Set(state.selectedCategories);
  if (isChecked) {
    selected.add(category);
  } else {
    selected.delete(category);
  }
  await saveState({ ...state, selectedCategories: [...selected] });
}

function renderLog(log) {
  logList.replaceChildren();
  logEmpty.hidden = log.length > 0;

  for (const entry of log) {
    logList.append(buildLogEntryElement(entry));
  }
}

function buildLogEntryElement(entry) {
  const li = document.createElement('li');
  li.className = 'log-entry';

  const title = document.createElement('a');
  title.className = 'title';
  title.href = entry.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = entry.title;

  const badge = document.createElement('span');
  badge.className = `badge ${entry.outcome}`;
  badge.textContent = entry.outcome === 'applied' ? 'Applied' : 'Needs manual';

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = `${entry.category} • ${formatTimestamp(entry.timestamp)}`;

  li.append(title, badge, meta);
  return li;
}

function formatTimestamp(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}
