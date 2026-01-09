import { describe, it, expect } from "vitest";
import {
  isNotFull,
  isMen,
  isNotSenior,
  isTargetLevel,
  isNotWaitlist,
  defaultFilters,
} from "./rules.mjs";

const baseTournament = {
  subdomain: "test",
  level: "P100",
  date: "10 jan.",
  dayOfWeek: "lundi",
  time: "18h00-20h00",
  spots: 4,
  isNocturne: true,
  isFull: false,
  category: "homme",
  ageGroup: null,
  isWaitlist: false,
  rawText: "test",
  id: "test-id",
};

describe("isNotFull", () => {
  it("returns true when tournament has spots", () => {
    expect(isNotFull({ ...baseTournament, isFull: false })).toBe(true);
  });

  it("returns false when tournament is full", () => {
    expect(isNotFull({ ...baseTournament, isFull: true })).toBe(false);
  });
});

describe("isMen", () => {
  it("returns true for homme category", () => {
    expect(isMen({ ...baseTournament, category: "homme" })).toBe(true);
  });

  it("returns false for femme category", () => {
    expect(isMen({ ...baseTournament, category: "femme" })).toBe(false);
  });

  it("returns false for mixte category", () => {
    expect(isMen({ ...baseTournament, category: "mixte" })).toBe(false);
  });
});

describe("isNotSenior", () => {
  it("returns true when no age group", () => {
    expect(isNotSenior({ ...baseTournament, ageGroup: null })).toBe(true);
  });

  it("returns false for +45 tournaments", () => {
    expect(isNotSenior({ ...baseTournament, ageGroup: "+45" })).toBe(false);
  });

  it("returns true for other age groups", () => {
    expect(isNotSenior({ ...baseTournament, ageGroup: "+35" })).toBe(true);
  });
});

describe("isTargetLevel", () => {
  it("returns true for P50", () => {
    expect(isTargetLevel({ ...baseTournament, level: "P50" })).toBe(true);
  });

  it("returns true for P100", () => {
    expect(isTargetLevel({ ...baseTournament, level: "P100" })).toBe(true);
  });

  it("returns true for P250", () => {
    expect(isTargetLevel({ ...baseTournament, level: "P250" })).toBe(true);
  });

  it("returns false for P500", () => {
    expect(isTargetLevel({ ...baseTournament, level: "P500" })).toBe(false);
  });

  it("returns false for null level", () => {
    expect(isTargetLevel({ ...baseTournament, level: null })).toBe(false);
  });
});

describe("isNotWaitlist", () => {
  it("returns true when not on waitlist", () => {
    expect(isNotWaitlist({ ...baseTournament, isWaitlist: false })).toBe(true);
  });

  it("returns false when on waitlist", () => {
    expect(isNotWaitlist({ ...baseTournament, isWaitlist: true })).toBe(false);
  });
});

describe("defaultFilters", () => {
  it("contains all 5 filter functions", () => {
    expect(defaultFilters).toHaveLength(5);
    expect(defaultFilters).toContain(isNotFull);
    expect(defaultFilters).toContain(isMen);
    expect(defaultFilters).toContain(isNotSenior);
    expect(defaultFilters).toContain(isTargetLevel);
    expect(defaultFilters).toContain(isNotWaitlist);
  });

  it("all pass for a valid tournament", () => {
    const valid = { ...baseTournament };
    expect(defaultFilters.every((f) => f(valid))).toBe(true);
  });

  it("fails if any single criterion fails", () => {
    const full = { ...baseTournament, isFull: true };
    expect(defaultFilters.every((f) => f(full))).toBe(false);
  });
});
