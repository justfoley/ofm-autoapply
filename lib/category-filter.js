/**
 * Keep only the postings that carry at least one checked category. A posting
 * only triggers auto-apply when (one of) its category(ies) is checked.
 *
 * A posting can belong to multiple categories at once (e.g. a real posting
 * observed as both "Reddit Marketer" and "Virtual Assistant" - see
 * lib/posting-parser.js), so this is an intersection test, not equality.
 *
 * @param {Array<{categories: string[]}>} postings
 * @param {Iterable<string>} selectedCategories
 * @returns {Array<object>}
 */
export function filterByCategory(postings, selectedCategories) {
  const selected = new Set(selectedCategories);
  return postings.filter((posting) => posting.categories.some((category) => selected.has(category)));
}
