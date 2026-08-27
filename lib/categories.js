// Seed/fallback category list, shown on first install before the extension
// has observed any real postings. These are the literal per-posting category
// values found on job cards in a captain-supplied authenticated DOM dump of
// the dashboard "find jobs" feed (see AGENTS.md) - NOT the brief's guessed
// marketing-homepage list, which turned out not to match.
//
// This is a sample from ~18 postings on one page, not proven exhaustive - a
// single posting can carry MULTIPLE categories at once (e.g. "Reddit
// Marketer" + "Virtual Assistant" on the same card). The popup grows this
// list over time from state.knownCategories as real postings are observed
// (see lib/storage.js), so it self-corrects rather than staying frozen on
// this seed.
export const DEFAULT_CATEGORIES = [
  'Account Manager',
  'Content Editor',
  'Marketing Manager',
  'OnlyFans Chatter',
  'OnlyFans Manager',
  'Reddit Marketer',
  'Social Media Manager',
  'Team Lead',
  'Virtual Assistant',
];
