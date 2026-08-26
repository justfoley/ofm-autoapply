/**
 * Keep only the postings whose category is in the captain's checked-category
 * selection. A posting only triggers auto-apply when its category is checked.
 *
 * @param {Array<{category: string}>} postings
 * @param {Iterable<string>} selectedCategories
 * @returns {Array<object>}
 */
export function filterByCategory(postings, selectedCategories) {
  const selected = new Set(selectedCategories);
  return postings.filter((posting) => selected.has(posting.category));
}
