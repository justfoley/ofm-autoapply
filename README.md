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
- **Still unconfirmed**: what the real, authenticated answer-entry form
  looks like (inline expansion, modal, or a separate navigated-to page) and
  whether its fields are plain text inputs or real `<select>`/radio controls
  for the multiple-choice-style questions - needs one authenticated look
  before building anything beyond the detect-and-skip behavior above (e.g.
  reusing the captain's own stored answers to auto-fill and submit).
  Likewise unconfirmed: what a "tests" (`list-check` badge) requirement
  actually involves - no live example was found even on the public preview
  pages sampled, so it's routed into the same `needs-questions` bucket as a
  conservative fallback rather than assumed to work like a text question.

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

To inspect the service worker's logs: `chrome://extensions` → the extension's
card → **service worker** (under "Inspect views").

## Development

```sh
npm test
```

Runs the unit test suite (Node's built-in test runner, `node
--experimental-test-module-mocks --test`) over `lib/dedupe.js`,
`lib/category-filter.js`, `lib/log.js`, `lib/storage.js`,
`lib/posting-parser.js`, `lib/apply-eligibility.js`, `lib/activity.js`, and
`background/service-worker.js`'s polling orchestration (in-flight guard,
alarm resync, activity-state transitions) - using an in-memory mock of the
`chrome.storage.local` and `chrome.alarms` promise APIs, plus `node:test`'s
module mocking for `lib/feed.js`/`lib/apply.js` (hence the
`--experimental-test-module-mocks` flag). No live DOM needed since
DOM-walking is isolated to thin, untested shims in `lib/feed.js`,
`lib/apply.js`, and `content/overlay.js` that run inside a real tab via
`chrome.scripting`/the browser's content-script injection.

Full live-site DOM interaction (the real feed URL, exact card markup at
click time) is not something these automated tests can safely cover - see
"Still open" above.
