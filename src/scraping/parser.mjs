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
 * @property {string|null} youthGroup - "U14", "U16", etc. or null
 * @property {string} rawText - Original text for debugging
 * @property {string} id - Unique ID for DB comparison
 */

/**
 * @typedef {Object} TournamentElementData
 * @property {string} innerText - The full innerText of the element
 * @property {string|null} spots - Text from the spots element (e.g., "4 places restantes")
 * @property {boolean} hasButton - Whether the signup button is present
 */

/**
 * Parse tournament element data into structured data
 * @param {TournamentElementData} elementData - Data extracted from the tournament element
 * @param {string} subdomain
 * @returns {Tournament}
 */
export function parseTournament(elementData, subdomain) {
  const text = elementData.innerText.replace(/\n/g, " ").trim();

  const levelMatch = text.match(/\b(P\s?\d+)\b/i);
  const level = levelMatch
    ? levelMatch[1].toUpperCase().replaceAll(" ", "")
    : null;

  const dateMatch = text.match(/([a-zé]{3}\.)\s+(\d{1,2})\s+([a-zé]{3,5}\.?)/i);
  const dayAbbrev = dateMatch?.[1]?.toLowerCase() || "";
  const dayNum = dateMatch?.[2] || "";
  const month = dateMatch?.[3] || "";

  const timeMatch = text.match(/(\d{2})h(\d{2})(?:\s*-\s*(\d{2})h(\d{2}))?/);
  const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
  const time = timeMatch
    ? timeMatch[3]
      ? `${timeMatch[1]}h${timeMatch[2]}-${timeMatch[3]}h${timeMatch[4]}`
      : `${timeMatch[1]}h${timeMatch[2]}`
    : "";

  const spotsMatch = elementData.spots?.match(/(\d+)/);
  const spots =
    elementData.hasButton && spotsMatch ? parseInt(spotsMatch[1]) : 0;

  const textLower = text.toLowerCase();
  const isNocturne =
    textLower.includes("soirée") ||
    textLower.includes("soiree") ||
    textLower.includes("nocturne") ||
    (startHour !== null && startHour >= 18);

  const category = textLower.includes("femme")
    ? "femme"
    : textLower.includes("mixte")
    ? "mixte"
    : "homme";

  const ageMatch = text.match(/\+\s*(\d+)/);
  const ageGroup = ageMatch ? `+${ageMatch[1]}` : null;

  const youthMatch = text.match(/\bU\s?(\d+)\b/i);
  const youthGroup = youthMatch ? `U${youthMatch[1]}` : null;

  const isWaitlist = ["liste", "attente"].every((word) =>
    textLower.includes(word)
  );

  const id = `${dayAbbrev}${dayNum}${month}-${level}-${time}`.replace(
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
    isNocturne,
    isFull: spots === 0,
    category,
    ageGroup,
    youthGroup,
    isWaitlist,
    rawText: text,
    id,
  };
}
