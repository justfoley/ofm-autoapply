import { loadState, saveState } from '../lib/storage.js';
import { ACTIVITY_STORAGE_KEY, loadActivity, getDefaultActivity, describeActivity } from '../lib/activity.js';

const BADGE_LABELS = {
  applied: 'Applied',
  'applied-unconfirmed': 'Applied - please double-check',
  'needs-manual': "Couldn't apply automatically",
};

const masterToggle = document.getElementById('master-toggle');
const masterToggleLabel = document.getElementById('master-toggle-label');
const categoryList = document.getElementById('category-list');
const logList = document.getElementById('log-list');
const logEmpty = document.getElementById('log-empty');
const statusBanner = document.getElementById('status-banner');
const statusText = document.getElementById('status-text');

let activityTickTimer = null;

init();

async function init() {
  const state = await loadState();

  masterToggle.checked = state.masterEnabled;
  masterToggleLabel.textContent = state.masterEnabled ? 'On' : 'Off';
  masterToggle.addEventListener('change', onMasterToggleChange);

  renderCategories(state.knownCategories, state.selectedCategories);
  renderLog(state.log);

  renderActivity(await loadActivity());

  // The service worker publishes activity transitions (idle/polling/applying)
  // to their own storage key (lib/activity.js) as they happen, independent
  // of the captain's settings/log blob - react to that here so the popup
  // never shows stale state while it's open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[ACTIVITY_STORAGE_KEY]) return;
    renderActivity({ ...getDefaultActivity(), ...changes[ACTIVITY_STORAGE_KEY].newValue });
  });
}

function renderActivity(activity) {
  if (activityTickTimer) {
    clearInterval(activityTickTimer);
    activityTickTimer = null;
  }

  const statusClass = !activity.masterEnabled ? 'off' : activity.status;
  statusBanner.className = `status-banner status-${statusClass}`;
  statusText.textContent = describeActivity(activity);

  // Idle countdown ticks locally against the fixed nextAlarmAt timestamp
  // already in `activity`, once a second - no extra storage reads/writes.
  if (activity.masterEnabled && activity.status === 'idle') {
    activityTickTimer = setInterval(() => {
      statusText.textContent = describeActivity(activity);
    }, 1000);
  }
}

async function onMasterToggleChange(event) {
  const masterEnabled = event.target.checked;
  masterToggleLabel.textContent = masterEnabled ? 'On' : 'Off';
  const state = await loadState();
  await saveState({ ...state, masterEnabled });
}

function renderCategories(knownCategories, selectedCategories) {
  const selected = new Set(selectedCategories);
  categoryList.replaceChildren();

  for (const category of [...knownCategories].sort((a, b) => a.localeCompare(b))) {
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
  badge.textContent = BADGE_LABELS[entry.outcome] || entry.outcome;

  const meta = document.createElement('span');
  meta.className = 'meta';
  const categoryText = entry.categories && entry.categories.length ? entry.categories.join(', ') : 'Uncategorized';
  const reasonText = entry.reason ? ` (${entry.reason})` : '';
  meta.textContent = `${categoryText} • ${formatTimestamp(entry.timestamp)}${reasonText}`;

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
