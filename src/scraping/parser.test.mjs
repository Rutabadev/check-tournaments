import { describe, it, expect } from "vitest";
import { parseTournament } from "./parser.mjs";

describe("parseTournament", () => {
  describe("basic parsing", () => {
    it("parses a standard tournament", () => {
      const text = "P100 lun. 10 jan. 18h00-20h00 4 places restantes homme";
      const result = parseTournament(text, "testclub");
      expect(result).toMatchSnapshot();
    });

    it("parses a weekend tournament", () => {
      const text = "P250 sam. 15 jan. 14h00-16h00 2 places restantes homme";
      const result = parseTournament(text, "testclub");
      expect(result).toMatchSnapshot();
    });

    it("parses a full tournament (no spots)", () => {
      const text = "P100 mar. 12 jan. 20h00-22h00 homme";
      const result = parseTournament(text, "testclub");
      expect(result).toMatchSnapshot();
    });
  });

  describe("level extraction", () => {
    it("extracts P50 level", () => {
      const result = parseTournament("P50 lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe("P50");
    });

    it("extracts P100 level", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe("P100");
    });

    it("extracts P250 level", () => {
      const result = parseTournament("P250 lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe("P250");
    });

    it("handles missing level", () => {
      const result = parseTournament("lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe(null);
    });

    it("handles level with space", () => {
      const result = parseTournament("P 100 lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe("P100");
    });

    it("normalizes lowercase level to uppercase", () => {
      const result = parseTournament("p100 lun. 10 jan. 18h00 homme", "test");
      expect(result.level).toBe("P100");
    });
  });

  describe("category detection", () => {
    it("detects homme category", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00 homme", "test");
      expect(result.category).toBe("homme");
    });

    it("detects femme category", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00 femme", "test");
      expect(result.category).toBe("femme");
    });

    it("detects mixte category", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00 mixte", "test");
      expect(result.category).toBe("mixte");
    });

    it("defaults to homme when no category", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00", "test");
      expect(result.category).toBe("homme");
    });
  });

  describe("nocturne detection", () => {
    it("detects nocturne by time >= 18h", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00-20h00", "test");
      expect(result.isNocturne).toBe(true);
    });

    it("detects nocturne by keyword", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 14h00 nocturne",
        "test"
      );
      expect(result.isNocturne).toBe(true);
    });

    it("not nocturne for daytime", () => {
      const result = parseTournament("P100 lun. 10 jan. 14h00-16h00", "test");
      expect(result.isNocturne).toBe(false);
    });
  });

  describe("age group detection", () => {
    it("detects +45 age group", () => {
      const result = parseTournament("P100 +45 lun. 10 jan. 18h00", "test");
      expect(result.ageGroup).toBe("+45");
    });

    it("detects +35 age group", () => {
      const result = parseTournament("P100 +35 lun. 10 jan. 18h00", "test");
      expect(result.ageGroup).toBe("+35");
    });

    it("handles + with space before number", () => {
      const result = parseTournament("P100 + 45 lun. 10 jan. 18h00", "test");
      expect(result.ageGroup).toBe("+45");
    });

    it("returns null when no age group", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00", "test");
      expect(result.ageGroup).toBe(null);
    });
  });

  describe("waitlist detection", () => {
    it("detects waitlist tournament", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 18h00 liste d'attente",
        "test"
      );
      expect(result.isWaitlist).toBe(true);
    });

    it("not waitlist by default", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00", "test");
      expect(result.isWaitlist).toBe(false);
    });
  });

  describe("spots parsing", () => {
    it("parses single digit spots", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 18h00 4 places restantes",
        "test"
      );
      expect(result.spots).toBe(4);
    });

    it("parses double digit spots", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 18h00 12 places restantes",
        "test"
      );
      expect(result.spots).toBe(12);
    });

    it("handles singular place", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 18h00 1 place restante",
        "test"
      );
      expect(result.spots).toBe(1);
    });

    it("parses spots with parenthesis", () => {
      const result = parseTournament(
        "P100 lun. 10 jan. 18h00 1 place(s) restante(s)",
        "test"
      );
      expect(result.spots).toBe(1);
    });

    it("returns 0 when no spots mentioned", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00", "test");
      expect(result.spots).toBe(0);
      expect(result.isFull).toBe(true);
    });
  });

  describe("day mapping", () => {
    it("maps lun. to lundi", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00", "test");
      expect(result.dayOfWeek).toBe("lundi");
    });

    it("maps sam. to samedi", () => {
      const result = parseTournament("P100 sam. 10 jan. 18h00", "test");
      expect(result.dayOfWeek).toBe("samedi");
    });

    it("maps dim. to dimanche", () => {
      const result = parseTournament("P100 dim. 10 jan. 18h00", "test");
      expect(result.dayOfWeek).toBe("dimanche");
    });
  });

  describe("ID generation", () => {
    it("generates unique ID with subdomain, date, level, time", () => {
      const result = parseTournament("P100 lun. 10 jan. 18h00-20h00", "myclub");
      expect(result.id).toBe("myclub-lun.10jan.-P100-18h00-20h00");
    });

    it("handles different subdomains", () => {
      const result1 = parseTournament("P100 lun. 10 jan. 18h00-20h00", "club1");
      const result2 = parseTournament("P100 lun. 10 jan. 18h00-20h00", "club2");
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe("real-world examples", () => {
    it("parses complex tournament text", () => {
      const text = `
        Tournoi P100
        lun. 20 jan.
        18h00-20h00
        homme
        6 places restantes
      `;
      const result = parseTournament(text, "toulousepadelclub");
      expect(result).toMatchSnapshot();
    });

    it("parses senior women tournament", () => {
      const text = "P250 femme +45 ven. 25 jan. 14h00-16h00 2 places restantes";
      const result = parseTournament(text, "acepadelclub");
      expect(result).toMatchSnapshot();
    });

    it("parses waitlist tournament", () => {
      const text = "P100 lun. 10 jan. 20h00-22h00 homme liste d'attente";
      const result = parseTournament(text, "toppadel");
      expect(result).toMatchSnapshot();
    });

    it("parses a real life tournament", () => {
      const text =
        "PADEL HOMME 0,00 € / P LISTE ATTENTE TOURNOIS LISTE D ATTENTE P 250 H FLORIAN CANO  Sam. 17 Janv.  19h30 - 23h30  6 place(s) restante(s)  Je m'inscris";
      const result = parseTournament(text, "testclub");
      expect(result).toMatchSnapshot();
    });
  });
});
