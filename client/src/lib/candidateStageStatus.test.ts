import { describe, expect, it } from "vitest";
import { didCandidatePassStage } from "./candidateStageStatus";

describe("didCandidatePassStage", () => {
  it("treats appearance in the next official stage as advancement", () => {
    expect(
      didCandidatePassStage(
        "projetos",
        "titulos",
        { projetos: { status: "Publicado" }, titulos: { status: "Aprovado" } },
        ["inscricoes", "prova", "titulos"]
      )
    ).toBe(true);
  });

  it("preserves an explicit pass when the next-stage record is incomplete", () => {
    expect(
      didCandidatePassStage("prova", "projetos", { prova: {} }, ["prova"])
    ).toBe(true);
  });

  it("does not override an explicit negative stage status", () => {
    expect(
      didCandidatePassStage(
        "inscricoes",
        "prova",
        {
          inscricoes: { status: "Não Homologada" },
          prova: { status: "Publicado" },
        },
        ["inscricoes"]
      )
    ).toBe(false);
  });

  it("does not infer a pass without an explicit result or a following stage", () => {
    expect(
      didCandidatePassStage("projetos", "titulos", { projetos: {} }, [])
    ).toBe(false);
  });
});
