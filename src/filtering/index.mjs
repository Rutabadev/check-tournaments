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
 * Find new tournaments by comparing current with previous IDs
 * Also detects freed spots (previously full, now available)
 * @param {Tournament[]} currentTournaments
 * @param {string[]} previousIds
 * @returns {{tournament: Tournament, isFreedSpot: boolean}[]}
 */
export function findNewTournaments(currentTournaments, previousIds) {
  const previousIdSet = new Set(previousIds);

  const filtered = applyFilters(currentTournaments);

  return filtered
    .filter((t) => {
      const wasKnown = previousIdSet.has(t.id);
      const wasFullId = t.id + "_full";
      const wasFullBefore = previousIdSet.has(wasFullId);
      return !wasKnown || wasFullBefore;
    })
    .map((tournament) => {
      const wasFullId = tournament.id + "_full";
      const isFreedSpot = previousIds.includes(wasFullId);
      return { tournament, isFreedSpot };
    });
}

/**
 * Get IDs for DB storage (includes _full suffix for full tournaments)
 * @param {Tournament[]} tournaments
 * @returns {string[]}
 */
export function getTournamentIdsForStorage(tournaments) {
  return tournaments.map((t) => (t.isFull ? t.id + "_full" : t.id));
}
