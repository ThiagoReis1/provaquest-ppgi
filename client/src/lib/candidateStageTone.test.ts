import { describe, expect, it } from "vitest";
import { candidateStageTone } from "./candidateStageTone";

describe("candidateStageTone", () => {
  it("mantém resultado final publicado em estado neutro", () => {
    expect(candidateStageTone("final", "Resultado final")).toBe("neutral");
  });

  it("distingue classificação, lista de espera e reprovação", () => {
    expect(candidateStageTone("final", "Classificado")).toBe("positive");
    expect(candidateStageTone("final", "Lista de Espera")).toBe("warning");
    expect(candidateStageTone("prova", "Não passou")).toBe("negative");
  });
});
