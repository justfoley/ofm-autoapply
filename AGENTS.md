# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Build/test: `npm test` (Node's built-in `node --test`, no deps to install). Load-unpacked steps live in `README.md`.
- Architecture: `lib/*.js` holds pure, unit-tested logic (dedupe, category-filter, log, storage, posting-parser, apply-eligibility); `background/service-worker.js` orchestrates them via `chrome.alarms`; `popup/` is the UI. `lib/feed.js`/`lib/apply.js` are the one exception — they contain small, deliberately-untested DOM-walking functions (`extractRawCardsFromPage`, `getCardApplyState`, `clickApplyButtonForPosting`) that run inside a real tab via `chrome.scripting.executeScript` and must stay self-contained (no closures/imports survive that serialization boundary). Keep new logic in `lib/` and unit-testable where possible.
- The real ofmjobs.com feed/apply flow was never inspected with a working browser (`chrome-devtools-axi` had no Chrome install) — implementation is based on a captain-supplied authenticated DOM dump of the dashboard jobs page, plus the captain's confirmation (relayed via firstmate) of what a real Apply click does. See README "What was confirmed" / "Still open" before touching `lib/feed.js` or `lib/apply.js`: the feed page's own URL is inferred, not observed, and marked `TODO(unconfirmed)` in code.
- A posting can carry **multiple** categories at once — `posting.categories` is always an array; `lib/category-filter.js` matches on intersection, not equality.
- `lib/categories.js`'s `DEFAULT_CATEGORIES` is a seed only (9 values actually observed in the DOM dump, not proven exhaustive). The popup's real checkbox list is `state.knownCategories`, which `background/service-worker.js` grows from every posting it sees — don't reintroduce a fixed/static category list in the UI.
- Apply confirmed to submit immediately in place (no modal/form); whether the captain qualifies is a server-side judgment invisible to the client, so `lib/apply-eligibility.js` does **not** gate on posting content (tests/questions/etc.) — only on whether the DOM lets the extension act at all (`canClickApply`). Its outcome is one of three states — `applied` / `applied-unconfirmed` / `needs-manual` (`interpretPostClickState`, `lib/log.js`) — never assert `applied` without an observed DOM signal.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
