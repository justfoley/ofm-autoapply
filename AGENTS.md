# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Build/test: `npm test` (Node's built-in `node --test`, no deps to install). Load-unpacked steps live in `README.md`.
- Architecture: `lib/*.js` holds pure, unit-tested logic (dedupe, category-filter, log, storage, posting-parser, apply-eligibility); `background/service-worker.js` orchestrates them via `chrome.alarms`; `popup/` is the UI. `lib/feed.js`/`lib/apply.js` are the one exception — they contain small, deliberately-untested DOM-walking functions (`extractRawCardsFromPage`, `clickApplyButtonForPosting`, `hasOpenDialogAfterApply`) that run inside a real tab via `chrome.scripting.executeScript` and must stay self-contained (no closures/imports survive that serialization boundary). Keep new logic in `lib/` and unit-testable where possible.
- The real ofmjobs.com feed/apply flow was never inspected with a working browser (`chrome-devtools-axi` had no Chrome install) — implementation is instead based on a captain-supplied authenticated DOM dump of the dashboard jobs page. See README "What the DOM dump confirmed" / "Still unconfirmed" before touching `lib/feed.js` or `lib/apply.js`: the feed page's own URL and the real post-Apply behavior are inferred/heuristic, not observed, and are marked `TODO(unconfirmed)` in code.
- A posting can carry **multiple** categories at once — `posting.categories` is always an array; `lib/category-filter.js` matches on intersection, not equality.
- `lib/categories.js`'s `DEFAULT_CATEGORIES` is a seed only (9 values actually observed in the DOM dump, not proven exhaustive). The popup's real checkbox list is `state.knownCategories`, which `background/service-worker.js` grows from every posting it sees — don't reintroduce a fixed/static category list in the UI.
- `lib/apply-eligibility.js` gates auto-apply on a posting's `requirements.{tests,questions}` counts only (not language/tool, which every sampled posting required) — this is a documented judgment call, not a confirmed rule; see README before changing it.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
