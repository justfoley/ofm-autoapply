# ofm-autoapply

Chrome (Manifest V3) extension that watches the ofmjobs.com job feed and
auto-applies to new postings in categories the captain selects, while they
stay logged into ofmjobs.com in their normal browser profile.

## Status: skeleton, feed/apply integration pending live-site inspection

This build covers everything that does **not** require inspecting the real,
authenticated ofmjobs.com DOM:

- Background service worker (`background/service-worker.js`) using
  `chrome.alarms` (not a page-resident timer) for 60-second polling that
  survives MV3 service-worker suspension.
- `chrome.storage.local`-backed state: master on/off switch (defaults to
  `false` on install), selected categories, deduped seen-posting ids, and the
  human-readable activity log (`lib/storage.js`).
- Dedupe logic (`lib/dedupe.js`) and category-filter logic
  (`lib/category-filter.js`), each with unit tests.
- Popup UI (`popup/`) with the master toggle, category checkboxes, and the
  activity log.

What is **stubbed**, and why: `lib/feed.js` (fetching the feed) and
`lib/apply.js` (performing the real Apply action) both throw
`not implemented` errors with a comment explaining the two candidate
implementation strategies. They were left as a clearly-marked interface
boundary instead of guessed at, because `chrome-devtools-axi` had no working
Chrome install in the environment this skeleton was built in - see "Known
gaps" below. `background/service-worker.js` already calls through these
stubs and handles their rejection gracefully (`console.warn`, not a thrown
error), so turning the master toggle on today is safe - it just won't apply
to anything yet.

The category checkbox list in `lib/categories.js` is the placeholder
taxonomy from the launch brief (Chatters, Chatting Managers, Marketing VAs,
Video Editors, Thumbnail Designers, Analytics & Reporting, Talent Managers,
Customer Support, Finance & Admin) and has **not** been verified against the
live site for the same reason.

## Known gaps (live-site inspection blocked)

The launch brief requires inspecting the real, authenticated ofmjobs.com feed
and apply flow with `chrome-devtools-axi` before finalizing:

- the real DOM structure of the feed page and how a "new posting" is
  distinguishable,
- the actual category taxonomy as rendered on the site,
- exactly what clicking "Apply" does (same-page button, modal, or full
  application form), and whether it needs form fields the extension can't
  safely fill in (in which case that posting must be logged as
  needs-manual-application, per the brief - never a fake/partial submission).

`chrome-devtools-axi` was non-functional in the build environment (no working
Chrome install), confirmed against both `ofmjobs.com` and a known-good site
(`example.com`) to rule out a site-specific cause. Once a working browser
session is available, replace the stubs in `lib/feed.js` and `lib/apply.js`
with real implementations - their function signatures are the integration
contract and should not need to change.

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
`lib/dedupe.js`, `lib/category-filter.js`, `lib/log.js`, and `lib/storage.js`
(using an in-memory mock of the `chrome.storage.local` promise API).

Full live-site DOM interaction (the real feed shape and Apply click-through)
is not something these automated tests can safely cover - see "Known gaps"
above.
