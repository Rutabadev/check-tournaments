import { defaultFilters } from "./rules.mjs";

/**
 * @typedef {import("../scraping/parser.mjs").Tournament} Tournament
 */

/**
 * Get the storage ID for a tournament (base ID + suffixes for state tracking)
 * @param {Tournament} tournament
 * @param {{ asFull?: boolean }} [options] - Override isFull state
 * @returns {string}
 */
function getStorageId(tournament, options = {}) {
  let id = tournament.id;
  if (tournament.isWaitlist) id += "_waitlist";
  const isFull = options.asFull ?? tournament.isFull;
  if (isFull) id += "_full";
  return id;
}

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
      const storageId = getStorageId(t);
      const wasKnown = previousIdSet.has(storageId);
      const wasFullId = getStorageId(t, { asFull: true });
      const wasFullBefore = previousIdSet.has(wasFullId);
      return !wasKnown || wasFullBefore;
    })
    .map((tournament) => {
      const wasFullId = getStorageId(tournament, { asFull: true });
      const isFreedSpot = previousIdSet.has(wasFullId);
      return { tournament, isFreedSpot };
    });
}

/**
 * Get IDs for DB storage (includes suffixes for state tracking)
 * @param {Tournament[]} tournaments
 * @returns {string[]}
 */
export function getTournamentIdsForStorage(tournaments) {
  return tournaments.map((t) => getStorageId(t));
}
