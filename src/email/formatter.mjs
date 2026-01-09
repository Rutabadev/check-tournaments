import { WEEKEND_DAYS } from "../config/index.mjs";

/**
 * Format a tournament for email display
 * @param {import("../scraping/parser.mjs").Tournament} tournament
 * @param {{isFreedSpot?: boolean}} options
 * @returns {string}
 */
export function formatTournament(tournament, options = {}) {
  const parts = [];

  if (tournament.isNocturne) {
    parts.push("<b>nocturne</b>");
  }

  const day = WEEKEND_DAYS.includes(tournament.dayOfWeek)
    ? `<b>${tournament.dayOfWeek}</b>`
    : tournament.dayOfWeek;

  parts.push(`${day} ${tournament.date}`);
  parts.push(tournament.level);
  parts.push(tournament.time);
  parts.push(`${tournament.spots} places`);

  const prefix = options.isFreedSpot ? "Places libérées: " : "";
  return prefix + parts.filter(Boolean).join(" ");
}

/**
 * Format tournaments grouped by subdomain for email HTML
 * @param {Map<string, {tournament: import("../scraping/parser.mjs").Tournament, isFreedSpot: boolean}[]>} tournamentsBySubdomain
 * @returns {string}
 */
export function formatEmailHtml(tournamentsBySubdomain) {
  const sections = [];

  for (const [subdomain, tournaments] of tournamentsBySubdomain) {
    const tournamentHtml = tournaments
      .map(
        ({ tournament, isFreedSpot }) =>
          `<p style="font-size:1rem;line-height:1.5rem">${formatTournament(tournament, { isFreedSpot })}</p>`
      )
      .join("");

    sections.push(`<h2>${subdomain}</h2>${tournamentHtml}`);
  }

  return sections.join("<hr />");
}
