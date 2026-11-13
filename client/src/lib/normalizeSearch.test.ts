import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./normalizeSearch";

describe("normalizeSearchText", () => {
  it("matches Portuguese names regardless of diacritics or case", () => {
    expect(normalizeSearchText("André Valente De Cristo")).toBe(
      normalizeSearchText("andre valente de cristo")
    );
    expect(normalizeSearchText("Jorzélio Alzier Gonçalves")).toBe(
      normalizeSearchText("jorzelio alzier goncalves")
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSearchText("  busca  ")).toBe("busca");
  });
});
