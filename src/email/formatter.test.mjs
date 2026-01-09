import { describe, it, expect } from "vitest";
import { formatTournament, formatEmailHtml } from "./formatter.mjs";

const baseTournament = {
  subdomain: "testclub",
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

describe("formatTournament", () => {
  it("formats a basic nocturne tournament", () => {
    const result = formatTournament(baseTournament);
    expect(result).toMatchSnapshot();
  });

  it("formats a daytime tournament (no nocturne)", () => {
    const daytime = { ...baseTournament, isNocturne: false };
    const result = formatTournament(daytime);
    expect(result).toMatchSnapshot();
  });

  it("formats a weekend tournament with bold day", () => {
    const weekend = { ...baseTournament, dayOfWeek: "samedi" };
    const result = formatTournament(weekend);
    expect(result).toMatchSnapshot();
  });

  it("formats a Sunday tournament with bold day", () => {
    const sunday = { ...baseTournament, dayOfWeek: "dimanche" };
    const result = formatTournament(sunday);
    expect(result).toMatchSnapshot();
  });

  it("adds freed spot prefix", () => {
    const result = formatTournament(baseTournament, { isFreedSpot: true });
    expect(result).toMatchSnapshot();
  });

  it("handles null level gracefully", () => {
    const noLevel = { ...baseTournament, level: null };
    const result = formatTournament(noLevel);
    expect(result).toMatchSnapshot();
  });

  it("formats tournament with many spots", () => {
    const manySpots = { ...baseTournament, spots: 12 };
    const result = formatTournament(manySpots);
    expect(result).toMatchSnapshot();
  });
});

describe("formatEmailHtml", () => {
  it("formats single subdomain with one tournament", () => {
    const map = new Map([
      ["testclub", [{ tournament: baseTournament, isFreedSpot: false }]],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchSnapshot();
  });

  it("formats single subdomain with multiple tournaments", () => {
    const t1 = { ...baseTournament, id: "t1" };
    const t2 = {
      ...baseTournament,
      id: "t2",
      dayOfWeek: "samedi",
      isNocturne: false,
    };
    const map = new Map([
      [
        "testclub",
        [
          { tournament: t1, isFreedSpot: false },
          { tournament: t2, isFreedSpot: true },
        ],
      ],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchSnapshot();
  });

  it("formats multiple subdomains", () => {
    const t1 = { ...baseTournament, subdomain: "club1", id: "t1" };
    const t2 = { ...baseTournament, subdomain: "club2", id: "t2" };
    const map = new Map([
      ["club1", [{ tournament: t1, isFreedSpot: false }]],
      ["club2", [{ tournament: t2, isFreedSpot: false }]],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchSnapshot();
  });

  it("formats empty map", () => {
    const map = new Map();
    const result = formatEmailHtml(map);
    expect(result).toMatchSnapshot();
  });

  it("formats complex real-world scenario", () => {
    const nocturne = {
      ...baseTournament,
      subdomain: "toulousepadelclub",
      level: "P100",
      date: "15 jan.",
      dayOfWeek: "mercredi",
      time: "20h00-22h00",
      spots: 2,
      isNocturne: true,
    };
    const weekend = {
      ...baseTournament,
      subdomain: "toulousepadelclub",
      level: "P250",
      date: "18 jan.",
      dayOfWeek: "samedi",
      time: "14h00-16h00",
      spots: 6,
      isNocturne: false,
    };
    const freed = {
      ...baseTournament,
      subdomain: "toppadel",
      level: "P50",
      date: "20 jan.",
      dayOfWeek: "lundi",
      time: "19h00-21h00",
      spots: 1,
      isNocturne: true,
    };

    const map = new Map([
      [
        "toulousepadelclub",
        [
          { tournament: nocturne, isFreedSpot: false },
          { tournament: weekend, isFreedSpot: false },
        ],
      ],
      ["toppadel", [{ tournament: freed, isFreedSpot: true }]],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchSnapshot();
  });
});
