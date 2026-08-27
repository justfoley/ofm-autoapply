/**
 * Split postings into ones we've never acted on before and ones we have.
 * A posting counts as "seen" once it has been auto-applied to OR logged as
 * needing manual application - both cases add its id to seenIds, so neither
 * is ever re-evaluated again (requirement: no duplicate applications, even
 * across browser restarts, since seenIds is persisted in chrome.storage.local).
 *
 * @param {Array<{id: string}>} postings
 * @param {Iterable<string>} seenIds
 * @returns {{ unseen: Array<object>, alreadySeen: Array<object> }}
 */
export function partitionBySeen(postings, seenIds) {
  const seen = new Set(seenIds);
  const unseen = [];
  const alreadySeen = [];

  for (const posting of postings) {
    if (seen.has(posting.id)) {
      alreadySeen.push(posting);
    } else {
      unseen.push(posting);
    }
  }

  return { unseen, alreadySeen };
}
