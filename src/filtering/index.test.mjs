import { describe, it, expect } from "vitest";
import {
  applyFilters,
  findNewTournaments,
  getTournamentIdsForStorage,
} from "./index.mjs";

const validTournament = {
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
  id: "test-id-1",
};

describe("applyFilters", () => {
  it("keeps tournaments that pass all filters", () => {
    const tournaments = [validTournament];
    expect(applyFilters(tournaments)).toEqual([validTournament]);
  });

  it("removes full tournaments", () => {
    const full = { ...validTournament, isFull: true, id: "full-id" };
    expect(applyFilters([full])).toEqual([]);
  });

  it("removes non-men tournaments", () => {
    const femme = { ...validTournament, category: "femme", id: "femme-id" };
    expect(applyFilters([femme])).toEqual([]);
  });

  it("removes senior tournaments", () => {
    const senior = { ...validTournament, ageGroup: "+45", id: "senior-id" };
    expect(applyFilters([senior])).toEqual([]);
  });

  it("removes non-target levels", () => {
    const p500 = { ...validTournament, level: "P500", id: "p500-id" };
    expect(applyFilters([p500])).toEqual([]);
  });

  it("removes waitlist tournaments", () => {
    const waitlist = { ...validTournament, isWaitlist: true, id: "waitlist-id" };
    expect(applyFilters([waitlist])).toEqual([]);
  });

  it("filters multiple tournaments correctly", () => {
    const valid2 = { ...validTournament, id: "test-id-2" };
    const invalid = { ...validTournament, isFull: true, id: "invalid-id" };
    expect(applyFilters([validTournament, valid2, invalid])).toEqual([
      validTournament,
      valid2,
    ]);
  });
});

describe("findNewTournaments", () => {
  it("returns new tournaments not in previous IDs", () => {
    const result = findNewTournaments([validTournament], []);
    expect(result).toEqual([{ tournament: validTournament, isFreedSpot: false }]);
  });

  it("excludes tournaments already known", () => {
    const result = findNewTournaments([validTournament], ["test-id-1"]);
    expect(result).toEqual([]);
  });

  it("detects freed spots (was full, now available)", () => {
    const result = findNewTournaments([validTournament], ["test-id-1_full"]);
    expect(result).toEqual([{ tournament: validTournament, isFreedSpot: true }]);
  });

  it("still applies filters before checking IDs", () => {
    const full = { ...validTournament, isFull: true };
    const result = findNewTournaments([full], []);
    expect(result).toEqual([]);
  });

  it("handles mixed scenarios", () => {
    const new1 = { ...validTournament, id: "new-1" };
    const new2 = { ...validTournament, id: "new-2" };
    const known = { ...validTournament, id: "known" };
    const freed = { ...validTournament, id: "freed" };

    const previousIds = ["known", "freed_full"];
    const result = findNewTournaments([new1, new2, known, freed], previousIds);

    expect(result).toHaveLength(3);
    expect(result.find((r) => r.tournament.id === "new-1")?.isFreedSpot).toBe(false);
    expect(result.find((r) => r.tournament.id === "new-2")?.isFreedSpot).toBe(false);
    expect(result.find((r) => r.tournament.id === "freed")?.isFreedSpot).toBe(true);
  });
});

describe("getTournamentIdsForStorage", () => {
  it("returns IDs without suffix for available tournaments", () => {
    expect(getTournamentIdsForStorage([validTournament])).toEqual(["test-id-1"]);
  });

  it("adds _full suffix for full tournaments", () => {
    const full = { ...validTournament, isFull: true };
    expect(getTournamentIdsForStorage([full])).toEqual(["test-id-1_full"]);
  });

  it("handles mixed tournaments", () => {
    const available = { ...validTournament, id: "avail" };
    const full = { ...validTournament, id: "full", isFull: true };
    expect(getTournamentIdsForStorage([available, full])).toEqual([
      "avail",
      "full_full",
    ]);
  });
});
