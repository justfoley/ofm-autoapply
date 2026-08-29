# ofm-autoapply

Chrome (Manifest V3) extension that watches the ofmjobs.com job feed and
auto-applies to new postings in categories the captain selects, while they
stay logged into ofmjobs.com in their normal browser profile.

## Status: feed/apply implemented from a DOM dump + captain-confirmed click behavior

`chrome-devtools-axi` never had a working Chrome install in this build
environment, so the real feed and apply flow could not be inspected live.
Instead:

1. The captain supplied an authenticated, static DOM dump of the dashboard
   "find jobs" page (real evidence, but static - no interaction).
2. The captain then clicked Apply on a real posting and confirmed (relayed
   via firstmate) what happens: **it submits immediately, in place - no
   confirmation modal, no form.** Whether the captain is qualified for that
   posting is decided server-side and isn't visible to the client.

Everything below is built from that evidence; anything not directly
confirmed is called out explicitly rather than guessed at.

- Background service worker (`background/service-worker.js`) using
  `chrome.alarms` (not a page-resident timer) for 60-second polling that
  survives MV3 service-worker suspension.
- `chrome.storage.local`-backed state: master on/off switch (defaults to
  `false` on install), selected categories, a self-growing known-category
  list, deduped seen-posting ids, and the human-readable activity log
  (`lib/storage.js`).
- Feed fetch (`lib/feed.js`): opens a hidden background tab to the dashboard
  jobs page and scrapes it via `chrome.scripting`, since it's a
  client-rendered page with no confirmed public JSON API. Parsing the raw
  scrape into postings is pure and unit-tested (`lib/posting-parser.js`).
- Apply (`lib/apply.js`): a posting whose feed card shows no "questions"/
  "tests" badge gets its job card's inline Apply button clicked - that's the
  complete action; one that does show a badge is never clicked at all. The
  feed-badge preflight gate, pre-click eligibility check, and post-click
  outcome interpretation (including a defense-in-depth check for a dialog or
  navigation appearing where a plain immediate-submit was expected) are pure,
  unit-tested logic (`lib/apply-eligibility.js`).
- Popup UI (`popup/`) with the master toggle, a live status banner, category
  checkboxes (populated from `state.knownCategories`, not a fixed list), and
  the activity log, showing four possible outcomes per posting (see below).
- Live status: `lib/activity.js` tracks what the extension is doing right now
  (idle with a countdown to the next check, checking the feed, or applying to
  a named posting), shared by the popup's status banner and a tab overlay
  injected into every open `ofmjobs.com` tab (`content/overlay.js`) - a
  full-tab blurred lock while a poll cycle is running, a small corner
  countdown while idle, nothing while the master switch is off. See AGENTS.md
  for the storage-key/messaging shape.
- Answer bank & Gemini-assisted screening questions (`options/`,
  `lib/answer-bank.js`, `lib/gemini-client.js`, `lib/question-matcher.js`,
  `lib/screening-apply.js`) - postings that need application questions can
  now be auto-filled and submitted from the captain's own saved answers
  instead of always landing in "Needs your answers". See "Answer bank &
  screening questions" below.

## What was confirmed

Reference dump: `data/ofm-autoapply-1/reference/find-jobs-page.html` relative
to the firstmate repo root (outside this repo - read-only, not committed).

- Each posting is a `<div data-slot="job-card">` containing:
  - `<a aria-label="View {title}" href="/dashboard/jobs/{uuid}">` - the
    posting's id and title.
  - **One or more** `<span aria-label="Category">{value}</span>` - a posting
    can carry multiple categories at once (observed e.g. "Reddit Marketer" +
    "Virtual Assistant" on the same card). `lib/category-filter.js` matches
    if *any* of a posting's categories is checked.
  - An inline `<button>` whose text starts with "Apply" (also true once
    relabeled "Applied") - clicking it does not require navigating away
    first, and submits the application immediately with no modal or form.
- **Category taxonomy correction**: the brief's list (Chatters, Chatting
  Managers, Marketing VAs, ...) came from the public marketing homepage and
  does **not** match the real per-posting values. The 9 values actually
  observed across ~18 sampled postings are the new seed list in
  `lib/categories.js`: Account Manager, Content Editor, Marketing Manager,
  OnlyFans Chatter, OnlyFans Manager, Reddit Marketer, Social Media Manager,
  Team Lead, Virtual Assistant. This sample is not proven exhaustive (the
  "All filters" panel that likely holds the full list was closed when the
  dump was captured), so the popup's checkbox list is the union of this seed
  plus `state.knownCategories`, which grows automatically as real postings
  are observed - see `background/service-worker.js`.
- **Apply outcome, four states** (`lib/log.js`, `lib/apply-eligibility.js`):
  - `applied` - clicked, and the DOM confirmed it: the card left the feed, or
    its Apply button became disabled or was relabeled (e.g. "Applied").
  - `applied-unconfirmed` - clicked, but no DOM confirmation was observed.
    Reported honestly rather than assumed successful - the captain's own
    account activity is the real source of truth for these.
  - `needs-manual` - never clicked, because the extension couldn't safely act
    from the DOM alone: no Apply button on the card, the button already
    looked applied/disabled, or the posting wasn't found on the page at all.
  - `needs-questions` - never safely completed because the posting needs more
    than one click: either its feed card already carried a "N questions"/"N
    tests" badge (see below - never clicked at all in this case), or a click
    that looked eligible unexpectedly surfaced a dialog or navigated away
    from the feed instead of submitting (`lib/apply-eligibility.js`'s
    post-click backstop). Distinct from `needs-manual` so the captain can go
    straight to postings that need *their own answers*, not just a DOM the
    extension couldn't parse.

  What this still deliberately does **not** gate on: whether a posting looks
  "hard" to qualify for in a way that's invisible from the DOM (years of
  experience implied by the role, etc.) - that judgment is server-side. What
  it now *does* gate on, since it stopped being invisible: whether the
  posting requires answering application questions or completing tests
  before/instead of a plain immediate-submit click. The original build
  believed "submits immediately, no modal, no form" held for every posting,
  based on one captain-confirmed click on one posting; it does not - see
  "Application questions and tests" below.

## Application questions and tests

Some postings require answering application questions and/or completing
tests before (or instead of) the plain immediate-submit Apply click - this
was not known when the apply flow was first built (see "What was confirmed"
above) and caused those postings to be silently mishandled rather than
cleanly skipped. Confirmed:

- Every job card in the feed listing carries a row of small badges alongside
  its category tags (part-time/full-time, tests, questions, languages,
  tools), each a `<span>` containing a `tabler-icon-*` svg and plain text
  (e.g. "2 questions", "1 test") - no `aria-label`, so they're matched by the
  icon's class name (`tabler-icon-message-question` / `tabler-icon-list-check`
  - see `lib/feed.js`). A posting's Apply button looks completely identical
  whether or not it carries these badges, so this is the only pre-click
  signal available.
- Confirmed live, logged out, against a public `https://ofmjobs.com/find-jobs/{uuid}`
  preview page (distinct route from the authenticated `/dashboard/jobs/{uuid}`
  detail view, same underlying posting): the "questions" badge maps to a
  real, numbered "Application Questions" list with free-text and
  multiple-choice-in-prose questions, some flagged "Required". That public
  preview is read-only (no `<form>`/`<input>`), so it does not show what the
  real *answer-entry* form looks like once a captain is logged in and
  actually clicks Apply on one of these.
- `lib/apply-eligibility.js`'s `canAutoApplyPosting()` gates on the feed
  badge (`Posting.questionCount`/`testCount`, from `lib/posting-parser.js`)
  before `lib/apply.js` ever opens a tab for that posting, resolving straight
  to `needs-questions` with no click attempted. `interpretPostClickState()`
  also carries a post-click backstop (a `[role="dialog"]` appearing, or the
  tab navigating away from the feed) for any posting that turns out to need
  more than one click despite carrying no badge - without it, a click that
  merely opened a form/navigated to one could be misread as `applied`
  instead of a false positive.
- **Now confirmed** (captain-supplied screenshots, see "Answer bank &
  screening questions" below): the real, authenticated answer-entry form is a
  separate navigated-to page (`/dashboard/jobs/{id}/apply`), not an inline
  expansion or modal, and its fields are plain `<textarea>`s (free text), not
  `<select>`/radio controls.
- **Still unconfirmed**: what a "tests" (`list-check` badge) requirement
  actually involves - no live example was found even on the public preview
  pages sampled, so it's still routed into the plain `needs-questions`
  bucket as a conservative fallback rather than assumed to work like a text
  question (`requiresScreeningQuestions()` in `lib/apply-eligibility.js`
  excludes any posting with a tests badge from the auto-fill flow below,
  regardless of configuration).

## Answer bank & screening questions

Postings that need application questions no longer have to end at
`needs-questions` - if the captain has saved true answers and a Gemini API
key on the options page (open it from the popup's "Manage answer bank &
Gemini key" button, or `chrome://extensions` -> ofm-autoapply -> Details ->
Extension options), the extension will auto-fill and submit them too.

**The one rule that governs all of this**: the extension only ever submits
answer text the captain personally wrote and saved in the answer bank.
Gemini is only ever asked to *classify* - "which saved answer, if any,
confidently answers this new question" - never to draft, paraphrase, or
guess new content. If any required question doesn't get a confident match,
nothing is filled or submitted and the posting falls through to the exact
same `needs-questions` outcome as before this feature existed.

How it works, end to end:

1. `lib/apply.js` only hands a questions-badge posting (not a tests-badge
   one - see above) to `lib/screening-apply.js` once a Gemini key and a
   non-empty answer bank are both configured; otherwise behavior is
   unchanged from before this feature existed.
2. `lib/screening-apply.js` navigates to the posting's `/apply` page and
   scrapes its required questions. Confirmed live (screenshot,
   `data/ofm-autoapply-5/reference/apply-page-screening-questions.png`,
   outside this repo): one `<textarea placeholder="Your answer...">` per
   numbered, `*`-marked required question, plus a separate optional "Cover
   letter" textarea with a different placeholder - deliberately never
   read/filled by this extension. The extraction selectors themselves are
   inferred from that screenshot, not a live DOM dump (no ofmjobs.com login
   was ever available to inspect the authenticated page directly) - see
   AGENTS.md's answer-bank section for the two safety gates (question-count
   sanity check, per-field fill verification) that compensate for that
   uncertainty.
3. Each required question is sent to Gemini (`gemini-3.6-flash`, confirmed
   live during this build - see AGENTS.md) alongside the full answer bank,
   asking it to pick a matching answer id or say none match, with a
   confidence score. `lib/question-matcher.js`'s `resolveMatch()` only
   accepts a match at or above a conservative threshold (0.85 by default).
4. Only if **every** required question got a confident match are the
   textareas filled (and read back to verify) and "Submit application"
   clicked. A single unmatched question, a failed fill, or a missing submit
   button aborts the whole posting without submitting anything.
5. Every match attempt - matched or not, including why - is recorded on the
   activity log entry as `screeningMatches` (question text, matched stored
   question/id, confidence) for the captain to audit later; the popup's log
   list renders it under the posting.

### What was and wasn't verified live for this feature

- **Verified live**: the Gemini API's exact request/response shapes
  (`generateContent` with `responseSchema`, the `GET /models` key-validation
  call, the 400 `API_KEY_INVALID` error shape) were confirmed with real
  curl calls against the real API during this build. The options page's
  answer-bank add/edit/delete flow was also verified against a real,
  extension-loaded `chrome.storage.local` (via `chrome-devtools-axi` with
  `--load-extension`, once that tool had a working Chrome install - see
  AGENTS.md's historical note) - adding an answer persisted and rendered
  correctly with working Edit/Delete controls.
- **Not verified live**: the actual `/apply` page's DOM (no ofmjobs.com
  login exists in this build environment - same limitation as the original
  build), so the question-extraction selectors, the fill/submit mechanics,
  and the post-submit confirmation heuristic in `lib/screening-apply.js` are
  all unconfirmed beyond the screenshot and the safety gates described
  above. The options page's "Test connection" button (live Gemini call from
  inside the real extension context) and the popup's new "Manage answer
  bank" button were not click-tested live either - `--load-extension`
  browser sessions proved unreliable mid-task (the loaded extension/tab
  disappeared between calls), and per the captain's standing instruction
  this was not worked around with any other Chrome launch path. Every piece
  of pure logic (prompt construction, response parsing, the
  confident-match-or-abandon decision, answer bank storage helpers, the
  apply-path branching decision) is unit-tested - see `npm test`.

## Still open (documented assumptions, not blocking)

- **The feed page's own URL.** Only the *rendered content* of the dashboard
  jobs page was captured, not its address bar. `lib/feed.js`'s `FEED_URL`
  (`https://ofmjobs.com/dashboard/jobs`) is inferred from the posting detail
  URL convention (`/dashboard/jobs/{uuid}`) under a standard
  collection-root-lists pattern - not directly observed. If wrong, polling
  will safely find zero job cards and warn, not crash or misbehave.
- **The full category taxonomy** - see the correction above; the popup's list
  self-corrects over time rather than staying frozen on the 9-value sample.

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository's root directory (the
   one containing `manifest.json`).
4. The extension icon appears in the toolbar. Click it to open the popup.
5. On first install the master toggle defaults to **Off** and no categories
   are selected - polling and auto-apply will not run until the captain
   turns the toggle on and checks at least one category.
6. To use the answer-bank auto-fill for postings with application questions,
   open the options page (popup's "Manage answer bank & Gemini key" button,
   or the extension's Details page -> Extension options), add a Gemini API
   key, and save at least one true question/answer pair. Until both are set,
   those postings behave exactly as before (`needs-questions`).

To inspect the service worker's logs: `chrome://extensions` → the extension's
card → **service worker** (under "Inspect views").

## Development

```sh
npm test
```

Runs the unit test suite (Node's built-in test runner, `node
--experimental-test-module-mocks --test`) over `lib/dedupe.js`,
`lib/category-filter.js`, `lib/log.js`, `lib/storage.js`,
`lib/posting-parser.js`, `lib/apply-eligibility.js`, `lib/activity.js`,
`lib/answer-bank.js`, `lib/gemini-client.js`, `lib/question-matcher.js`, and
`background/service-worker.js`'s polling orchestration (in-flight guard,
alarm resync, activity-state transitions) - using an in-memory mock of the
`chrome.storage.local` and `chrome.alarms` promise APIs, plus `node:test`'s
module mocking for `lib/feed.js`/`lib/apply.js`/`lib/screening-apply.js`
(hence the `--experimental-test-module-mocks` flag) and an injectable
`fetch`/Gemini-call parameter everywhere network calls happen. No live DOM
or network needed since DOM-walking is isolated to thin, untested shims in
`lib/feed.js`, `lib/apply.js`, `lib/screening-apply.js`, and
`content/overlay.js` that run inside a real tab via `chrome.scripting`/the
browser's content-script injection.

Full live-site DOM interaction (the real feed URL, exact card markup at
click time) is not something these automated tests can safely cover - see
"Still open" above.
