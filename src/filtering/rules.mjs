import { TARGET_LEVELS } from "../config/index.mjs";

/**
 * @typedef {import("../scraping/parser.mjs").Tournament} Tournament
 */

/** @param {Tournament} t */
export const isNotFull = (t) => !t.isFull;

/** @param {Tournament} t */
export const isMen = (t) => t.category === "homme";

/** @param {Tournament} t */
export const isNotSenior = (t) => t.ageGroup !== "+45";

/** @param {Tournament} t */
export const isNotYouth = (t) => t.youthGroup === null;

/** @param {Tournament} t */
export const isTargetLevel = (t) => TARGET_LEVELS.includes(t.level);

/** @param {Tournament} t */
export const isNotWaitlist = (t) => !t.isWaitlist;

export const defaultFilters = [
  isNotFull,
  isMen,
  isNotSenior,
  isNotYouth,
  isTargetLevel,
  isNotWaitlist,
];
