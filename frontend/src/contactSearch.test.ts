import { describe, expect, it } from "vitest";
import { normalizeContactSearch, rankContactMatches } from "./contactSearch";

const contacts = [
  { id: "1", name: "Yuri Almeida" },
  { id: "2", name: "Iury Costa" },
  { id: "3", name: "Karlos Pereira" },
  { id: "4", name: "Maria Flor" },
];

describe("contact search", () => {
  it("normaliza variantes fonéticas comuns de nomes", () => {
    expect(normalizeContactSearch("Yuri")).toBe("iuri");
    expect(normalizeContactSearch("Iury")).toBe("iuri");
    expect(normalizeContactSearch("Carlos")).toBe("karlos");
    expect(normalizeContactSearch("Karlos")).toBe("karlos");
  });

  it("encontra grafias alternativas e pequenos erros", () => {
    expect(rankContactMatches(contacts, "iuri").map((item) => item.id)).toEqual(["2", "1"]);
    expect(rankContactMatches(contacts, "carlos").map((item) => item.id)).toEqual(["3"]);
    expect(rankContactMatches(contacts, "mariaa").map((item) => item.id)).toEqual(["4"]);
  });
});
