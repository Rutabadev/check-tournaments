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
      if (
        t.rawText ===
        "PADEL OPEN 25,00 € / P TOURNOIS HOMOLOGUES P250 Hommes matin  Ven. 16 Janv.  07h30 - 12h00  1 place(s) restante(s)  Je m'inscris"
      ) {
        console.log("-----current------");
        console.log(t);
        console.log("-----previous------");
        console.log(previousById.get(t.id));
      }
      const previous = previousById.get(t.id);
      return !previous || (previous.isFull && !t.isFull);
    })
    .map((tournament) => {
      const previous = previousById.get(tournament.id);
      const isFreedSpot = Boolean(previous?.isFull && !tournament.isFull);
      return { tournament, isFreedSpot };
    });
}
