import { sendEmail } from "./transport.mjs";
import { formatEmailHtml } from "./formatter.mjs";
import { getConfig } from "../config/index.mjs";

/**
 * Send tournament notification email
 * @param {Map<string, {tournament: import("../scraping/parser.mjs").Tournament, isFreedSpot: boolean}[]>} tournamentsBySubdomain
 */
export async function sendTournamentEmail(tournamentsBySubdomain) {
  const config = getConfig();

  const allTournaments = [...tournamentsBySubdomain.values()].flat();
  const onlyFreedSpots = allTournaments.every((t) => t.isFreedSpot);

  await sendEmail({
    to: config.mailingList.join(", "),
    subject: onlyFreedSpots ? "Places libérées" : "Nouveaux tournois",
    html: formatEmailHtml(tournamentsBySubdomain),
  });
}
