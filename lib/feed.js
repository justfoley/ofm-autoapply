// INTEGRATION BOUNDARY - NOT YET IMPLEMENTED.
//
// Live inspection of the authenticated ofmjobs.com feed page (real DOM
// structure, how a "new posting" is distinguishable, whether there's a JSON
// API the frontend calls) was blocked: chrome-devtools-axi had no working
// Chrome install in the environment this skeleton was built in. See the
// README "Known gaps" section.
//
// Two candidate strategies to evaluate once inspection is unblocked:
//   1. Direct fetch() to a feed API endpoint the site's own frontend calls,
//      using the cookies already present in the captain's browser profile.
//      manifest.json already declares host_permissions for https://ofmjobs.com/*
//      to support this. NOTE: extension-initiated fetches are cross-site from
//      the cookie jar's point of view, so SameSite=Lax/Strict session cookies
//      may not be attached - this needs to be confirmed against the real
//      cookie config, not assumed.
//   2. If the feed is a client-rendered page with no public JSON endpoint,
//      open a background tab (chrome.tabs.create) to the feed URL and use
//      chrome.scripting.executeScript to run a content-script DOM scrape,
//      then close/hide the tab.
//
// Whichever strategy wins, keep this function's contract stable so
// background/service-worker.js does not need to change.

/**
 * Fetch postings currently visible in the ofmjobs.com feed.
 *
 * @returns {Promise<Array<{id: string, title: string, category: string, url: string}>>}
 */
export async function getFeedPostings() {
  throw new Error('getFeedPostings() not implemented - pending live ofmjobs.com DOM inspection');
}
