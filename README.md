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
- Apply (`lib/apply.js`): finds the posting's job card and clicks its inline
  Apply button - that's the complete action. The pre-click eligibility check
  and post-click outcome interpretation are pure, unit-tested logic
  (`lib/apply-eligibility.js`).
- Popup UI (`popup/`) with the master toggle, category checkboxes (populated
  from `state.knownCategories`, not a fixed list), and the activity log,
  showing three possible outcomes per posting (see below).

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
- **Apply outcome, three states** (`lib/log.js`, `lib/apply-eligibility.js`):
  - `applied` - clicked, and the DOM confirmed it: the card left the feed, or
    its Apply button became disabled or was relabeled (e.g. "Applied").
  - `applied-unconfirmed` - clicked, but no DOM confirmation was observed.
    Reported honestly rather than assumed successful - the captain's own
    account activity is the real source of truth for these.
  - `needs-manual` - never clicked, because the extension couldn't safely act
    from the DOM alone: no Apply button on the card, the button already
    looked applied/disabled, or the posting wasn't found on the page at all.
  Note what this deliberately does **not** gate on: whether a posting looks
  "hard" to qualify for (tests, screening questions, etc.) - that judgment is
  server-side and invisible to the client, so it happens after every click,
  not before it.

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
`lib/posting-parser.js`, `lib/apply-eligibility.js`, and
`background/service-worker.js`'s polling orchestration (in-flight guard,
alarm resync) - using an in-memory mock of the `chrome.storage.local` and
`chrome.alarms` promise APIs, plus `node:test`'s module mocking for
`lib/feed.js`/`lib/apply.js` (hence the `--experimental-test-module-mocks`
flag). No live DOM needed since DOM-walking is isolated to thin, untested
shims in `lib/feed.js` and `lib/apply.js` that run inside a real tab via
`chrome.scripting`.

Full live-site DOM interaction (the real feed URL, exact card markup at
click time) is not something these automated tests can safely cover - see
"Still open" above.
