import { getTransporter } from "./transport.mjs";
import { formatEmailHtml } from "./formatter.mjs";
import { SENDER_EMAIL, getConfig } from "../config/index.mjs";

/**
 * Send tournament notification email
 * @param {Map<string, {tournament: import("../scraping/parser.mjs").Tournament, isFreedSpot: boolean}[]>} tournamentsBySubdomain
 */
export async function sendTournamentEmail(tournamentsBySubdomain) {
  const config = getConfig();
  const transporter = getTransporter();

  const allTournaments = [...tournamentsBySubdomain.values()].flat();
  const onlyFreedSpots = allTournaments.every((t) => t.isFreedSpot);

  const mailOptions = {
    from: SENDER_EMAIL,
    to: config.mailingList.join(", "),
    subject: onlyFreedSpots ? "Places libérées" : "Nouveaux tournois",
    html: formatEmailHtml(tournamentsBySubdomain),
  };

  const sentMessageInfo = await transporter.sendMail(mailOptions);
  console.log("Email sent:", sentMessageInfo);
}
