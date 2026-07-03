import { defaultFilters } from "./rules.mjs";

/**
 * @typedef {import("../scraping/parser.mjs").Tournament} Tournament
 */

/**
 * Apply default filters to tournaments
 * @param {Tournament[]} tournaments
 * @returns {Tournament[]}
 */
export function applyFilters(tournaments) {
  return tournaments.filter((t) => defaultFilters.every((filter) => filter(t)));
}

/**
 * Find new tournaments by comparing current with previous
 * @param {Tournament[]} currentTournaments
 * @param {Tournament[]} previousTournaments
 * @returns {{tournament: Tournament, isFreedSpot: boolean}[]}
 */
export function findNewTournaments(currentTournaments, previousTournaments) {
  const previousById = new Map(previousTournaments.map((t) => [t.id, t]));

  const filtered = applyFilters(currentTournaments);

  return filtered
    .filter((t) => {
      const previous = previousById.get(t.id);
      return !previous || (previous.isFull && !t.isFull);
    })
    .map((tournament) => {
      const previous = previousById.get(tournament.id);
      const isFreedSpot = Boolean(previous?.isFull && !tournament.isFull);
      return { tournament, isFreedSpot };
    });
}

/**
 * Analyze a fresh scrape against the previously stored tournaments.
 *
 * Produces everything the handler needs: the broad set to persist (waitlist
 * excluded), the narrow set of new/freed tournaments to notify, and whether
 * the stored set changed.
 *
 * @param {Tournament[]} scraped - Raw tournaments from the scraper
 * @param {Tournament[]} previous - Previously stored tournaments
 * @returns {{
 *   toPersist: Tournament[],
 *   newTournaments: {tournament: Tournament, isFreedSpot: boolean}[],
 *   needsDbUpdate: boolean,
 * }}
 */
export function analyzeTournaments(scraped, previous) {
  const toPersist = scraped.filter((t) => !t.isWaitlist);
  const newTournaments = findNewTournaments(toPersist, previous);
  const needsDbUpdate = JSON.stringify(toPersist) !== JSON.stringify(previous);

  return { toPersist, newTournaments, needsDbUpdate };
}
