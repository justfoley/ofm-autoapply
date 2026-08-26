# ofm-autoapply

Chrome (Manifest V3) extension that watches the ofmjobs.com job feed and
auto-applies to new postings in categories the captain selects, while they
stay logged into ofmjobs.com in their normal browser profile.

## Status: feed/apply implemented from a DOM dump, not live browser testing

`chrome-devtools-axi` never had a working Chrome install in this build
environment, so the real feed and apply flow could not be inspected live.
Instead, the captain supplied an authenticated, static DOM dump of the
dashboard "find jobs" page, which is real evidence but incomplete - it can't
show interaction (what happens after a click) or content behind a closed
dropdown. Everything below is built from that dump; anything not directly
observable in it is called out explicitly rather than guessed at.

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
- Apply (`lib/apply.js`): finds the posting's job card and clicks its inline
  Apply button, gated by a pre-click eligibility check
  (`lib/apply-eligibility.js`).
- Popup UI (`popup/`) with the master toggle, category checkboxes (populated
  from `state.knownCategories`, not a fixed list), and the activity log.

## What the DOM dump confirmed

Reference dump: `data/ofm-autoapply-1/reference/find-jobs-page.html` relative
to the firstmate repo root (outside this repo - read-only, not committed).

- Each posting is a `<div data-slot="job-card">` containing:
  - `<a aria-label="View {title}" href="/dashboard/jobs/{uuid}">` - the
    posting's id and title.
  - **One or more** `<span aria-label="Category">{value}</span>` - a posting
    can carry multiple categories at once (observed e.g. "Reddit Marketer" +
    "Virtual Assistant" on the same card). `lib/category-filter.js` matches
    if *any* of a posting's categories is checked.
  - An inline `<button>` containing the text "Apply" (plus a lock icon) -
    clicking it does not require navigating away first.
  - A "What this job requires" accordion listing counts of tests, questions,
    languages, and tools the application needs.
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
- **Apply-eligibility judgment call** (`lib/apply-eligibility.js`): every one
  of the ~18 sampled postings required at least 1 language and 1 tool, but
  only about half additionally required tests/questions. Gating on
  language/tool too would mean the extension never auto-applies to anything,
  so only tests/questions (most plausibly free-response/assessment content)
  are treated as blocking - a posting requiring either is logged
  `skipped-manual` with reason `requires-tests-or-questions` *before* Apply
  is ever clicked. Language/tool requirements are assumed, not confirmed, to
  be profile-matched rather than requiring new input at apply time. **This is
  a reversible judgment call, not a confirmed fact - revisit if wrong.**

## Still unconfirmed

- **The feed page's own URL.** Only the *rendered content* of the dashboard
  jobs page was captured, not its address bar. `lib/feed.js`'s `FEED_URL`
  (`https://ofmjobs.com/dashboard/jobs`) is inferred from the posting detail
  URL convention (`/dashboard/jobs/{uuid}`) under a standard
  collection-root-lists pattern - not directly observed. If wrong, polling
  will safely find zero job cards and warn, not crash or misbehave.
- **What happens after clicking Apply.** Firstmate is relaying what the
  captain sees after a real click; not yet received. `lib/apply.js`
  currently checks for a `[role="dialog"]` appearing within 1.5s of the click
  (the app is confirmed to use Radix UI elsewhere, whose dialogs follow that
  pattern) and treats that as `needs-manual`; no dialog is treated as
  `applied`. This is a placeholder heuristic, clearly marked `TODO` in code,
  pending the real answer.
- **Whether language/tool requirements truly need no extra input at apply
  time** - see the judgment call above.

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

Runs the unit test suite (Node's built-in test runner, `node --test`) over
`lib/dedupe.js`, `lib/category-filter.js`, `lib/log.js`, `lib/storage.js`,
`lib/posting-parser.js`, and `lib/apply-eligibility.js` (using an in-memory
mock of the `chrome.storage.local` promise API - no live DOM needed since
DOM-walking is isolated to thin, untested shims in `lib/feed.js` and
`lib/apply.js` that run inside a real tab via `chrome.scripting`).

Full live-site DOM interaction (the real feed URL, the real post-Apply
outcome) is not something these automated tests can safely cover - see
"Still unconfirmed" above.
