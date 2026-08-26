# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Build/test: `npm test` (Node's built-in `node --test`, no deps to install). Load-unpacked steps live in `README.md`.
- Architecture: `lib/*.js` holds pure, unit-tested logic (dedupe, category-filter, log, storage); `background/service-worker.js` orchestrates them via `chrome.alarms`; `popup/` is the UI. Keep new logic in `lib/` and unit-testable — `background`/`popup` should stay thin glue.
- `lib/feed.js` (fetch the ofmjobs.com feed) and `lib/apply.js` (perform the real Apply action) are the integration boundary with the live site and are intentionally stubbed (`throw new Error('not implemented')`) pending live-site DOM/API inspection — see each file's header comment and README "Known gaps" before implementing. Do not guess at selectors or an apply flow; a posting that can't be safely auto-applied must resolve to `'needs-manual'`, never a fake/partial submission.
- `lib/categories.js`'s `DEFAULT_CATEGORIES` is an unverified placeholder from the launch brief — confirm against the live site's real taxonomy before treating it as authoritative.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
