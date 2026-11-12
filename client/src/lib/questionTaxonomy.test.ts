import { describe, expect, it } from "vitest";
import { studyData } from "@/data/questions";
import {
  availableSubjects,
  availableSubtopics,
  availableTopics,
  type TaxonomyQuestion,
} from "./questionTaxonomy";

const questions: TaxonomyQuestion[] = studyData.editions.flatMap(edition =>
  edition.questions.map(question => ({ ...question, editionId: edition.id }))
);

describe("opções de taxonomia da busca", () => {
  it("não oferece subtemas que só aparecem em questões inválidas", () => {
    const subtopics = availableSubtopics(
      questions,
      "todos",
      "Todos os assuntos",
      "Todos os temas"
    );
    expect(subtopics).not.toContain("Árvores B e B+");
    expect(subtopics).not.toContain("Operações bit a bit");
  });

  it("respeita edital ao listar assuntos e temas respondíveis", () => {
    expect(availableSubjects(questions, "2025-01")).not.toContain("Grafos");
    expect(
      availableTopics(questions, "2026-01", "Todos os assuntos")
    ).not.toContain("Ordenação");
  });

  it("inclui temas corrigidos para estabilidade e ordenação por seleção", () => {
    expect(
      availableSubtopics(questions, "todos", "Algoritmos", "Ordenação")
    ).toEqual(
      expect.arrayContaining([
        "Estabilidade de ordenação",
        "Ordenação por seleção",
      ])
    );
  });
});
