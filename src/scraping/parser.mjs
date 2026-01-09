import { DAY_ABBREV_MAP } from "../config/index.mjs";

/**
 * @typedef {Object} Tournament
 * @property {string} subdomain
 * @property {string|null} level - P50, P100, P250
 * @property {string} date - Raw date string for display (e.g., "10 jan.")
 * @property {string} dayOfWeek - Full day name (e.g., "lundi")
 * @property {string} time - Time range (e.g., "18h00-20h00")
 * @property {number} spots - Number of available spots (0 = full)
 * @property {boolean} isNocturne
 * @property {boolean} isFull
 * @property {string} category - "homme", "femme", "mixte"
 * @property {string|null} ageGroup - "+45" or null
 * @property {string} rawText - Original text for debugging
 * @property {string} id - Unique ID for DB comparison
 */

/**
 * Parse tournament HTML element into structured data
 * @param {string} innerText - Raw text from tournament div
 * @param {string} subdomain
 * @returns {Tournament}
 */
export function parseTournament(innerText, subdomain) {
  const text = innerText.replace(/\n/g, " ").trim();

  const levelMatch = text.match(/\b(P\d+)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : null;

  const dateMatch = text.match(
    /([a-zé]{3}\.)\s+(\d{1,2})\s+([a-zé]{3,4}\.)/i
  );
  const dayAbbrev = dateMatch?.[1]?.toLowerCase() || "";
  const dayNum = dateMatch?.[2] || "";
  const month = dateMatch?.[3] || "";

  const timeMatch = text.match(
    /(\d{2})h(\d{2})(?:\s*-\s*(\d{2})h(\d{2}))?/
  );
  const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
  const time = timeMatch
    ? timeMatch[3]
      ? `${timeMatch[1]}h${timeMatch[2]}-${timeMatch[3]}h${timeMatch[4]}`
      : `${timeMatch[1]}h${timeMatch[2]}`
    : "";

  const spotsMatch = text.match(/(\d+)\s*places?\s*restantes?/i);
  const spots = spotsMatch ? parseInt(spotsMatch[1]) : 0;

  const textLower = text.toLowerCase();
  const category = textLower.includes("femme")
    ? "femme"
    : textLower.includes("mixte")
      ? "mixte"
      : "homme";

  const ageMatch = text.match(/\+\s*(\d+)/);
  const ageGroup = ageMatch ? `+${ageMatch[1]}` : null;

  const isWaitlist = textLower.includes("liste d'attente");

  const id = `${subdomain}-${dayAbbrev}${dayNum}${month}-${level}-${time}`.replace(
    /\s+/g,
    ""
  );

  return {
    subdomain,
    level,
    date: `${dayNum} ${month}`,
    dayOfWeek: DAY_ABBREV_MAP[dayAbbrev] || dayAbbrev,
    time,
    spots,
    isNocturne:
      (startHour !== null && startHour >= 18) ||
      textLower.includes("nocturne"),
    isFull: spots === 0,
    category,
    ageGroup,
    isWaitlist,
    rawText: text,
    id,
  };
}
