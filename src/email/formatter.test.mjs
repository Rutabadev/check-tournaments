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
    expect(result).toMatchInlineSnapshot(
      `"<b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places"`
    );
  });

  it("formats a daytime tournament (no nocturne)", () => {
    const daytime = { ...baseTournament, isNocturne: false };
    const result = formatTournament(daytime);
    expect(result).toMatchInlineSnapshot(
      `"lundi 10 jan. P100 18h00-20h00 4 places"`
    );
  });

  it("formats a weekend tournament with bold day", () => {
    const weekend = { ...baseTournament, dayOfWeek: "samedi" };
    const result = formatTournament(weekend);
    expect(result).toMatchInlineSnapshot(
      `"<b>nocturne</b> <b>samedi</b> 10 jan. P100 18h00-20h00 4 places"`
    );
  });

  it("formats a Sunday tournament with bold day", () => {
    const sunday = { ...baseTournament, dayOfWeek: "dimanche" };
    const result = formatTournament(sunday);
    expect(result).toMatchInlineSnapshot(
      `"<b>nocturne</b> <b>dimanche</b> 10 jan. P100 18h00-20h00 4 places"`
    );
  });

  it("adds freed spot prefix", () => {
    const result = formatTournament(baseTournament, { isFreedSpot: true });
    expect(result).toMatchInlineSnapshot(
      `"Places libérées: <b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places"`
    );
  });

  it("handles null level gracefully", () => {
    const noLevel = { ...baseTournament, level: null };
    const result = formatTournament(noLevel);
    expect(result).toMatchInlineSnapshot(
      `"<b>nocturne</b> lundi 10 jan. 18h00-20h00 4 places"`
    );
  });

  it("formats tournament with many spots", () => {
    const manySpots = { ...baseTournament, spots: 12 };
    const result = formatTournament(manySpots);
    expect(result).toMatchInlineSnapshot(
      `"<b>nocturne</b> lundi 10 jan. P100 18h00-20h00 12 places"`
    );
  });
});

describe("formatEmailHtml", () => {
  it("formats single subdomain with one tournament", () => {
    const map = new Map([
      ["testclub", [{ tournament: baseTournament, isFreedSpot: false }]],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchInlineSnapshot(
      `"<h2>testclub</h2><p style="font-size:1rem;line-height:1.5rem"><b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places</p>"`
    );
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
    expect(result).toMatchInlineSnapshot(
      `"<h2>testclub</h2><p style="font-size:1rem;line-height:1.5rem"><b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places</p><p style="font-size:1rem;line-height:1.5rem">Places libérées: <b>samedi</b> 10 jan. P100 18h00-20h00 4 places</p>"`
    );
  });

  it("formats multiple subdomains", () => {
    const t1 = { ...baseTournament, subdomain: "club1", id: "t1" };
    const t2 = { ...baseTournament, subdomain: "club2", id: "t2" };
    const map = new Map([
      ["club1", [{ tournament: t1, isFreedSpot: false }]],
      ["club2", [{ tournament: t2, isFreedSpot: false }]],
    ]);
    const result = formatEmailHtml(map);
    expect(result).toMatchInlineSnapshot(
      `"<h2>club1</h2><p style="font-size:1rem;line-height:1.5rem"><b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places</p><hr /><h2>club2</h2><p style="font-size:1rem;line-height:1.5rem"><b>nocturne</b> lundi 10 jan. P100 18h00-20h00 4 places</p>"`
    );
  });

  it("formats empty map", () => {
    const map = new Map();
    const result = formatEmailHtml(map);
    expect(result).toMatchInlineSnapshot(`""`);
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
    expect(result).toMatchInlineSnapshot(
      `"<h2>toulousepadelclub</h2><p style="font-size:1rem;line-height:1.5rem"><b>nocturne</b> mercredi 15 jan. P100 20h00-22h00 2 places</p><p style="font-size:1rem;line-height:1.5rem"><b>samedi</b> 18 jan. P250 14h00-16h00 6 places</p><hr /><h2>toppadel</h2><p style="font-size:1rem;line-height:1.5rem">Places libérées: <b>nocturne</b> lundi 20 jan. P50 19h00-21h00 1 places</p>"`
    );
  });
});
