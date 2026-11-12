import { describe, expect, it } from "vitest";
import { studyData } from "./questions";
import { sessionBelongsToEdition } from "../lib/simulation";
import { matchesQuestionQuery } from "../lib/questionFilters";

const question = (editionId: string, number: number) =>
  studyData.editions
    .find(edition => edition.id === editionId)!
    .questions.find(item => item.number === number)!;

describe("acervo de questões", () => {
  it("mantém sete editais com vinte questões cada", () => {
    expect(studyData.editions).toHaveLength(7);
    expect(
      studyData.editions.every(edition => edition.questions.length === 20)
    ).toBe(true);
  });

  it("não publica gabarito consumível para itens em revisão", () => {
    for (const edition of studyData.editions) {
      for (const question of edition.questions) {
        if (question.needsReview) expect(question.correct).toBeNull();
        if (!question.annulled && !question.needsReview) {
          expect(
            question.options.some(option => option.id === question.correct)
          ).toBe(true);
        }
      }
    }
  });

  it("mantém referências de figuras válidas e dimensionadas", () => {
    const figures = studyData.editions.flatMap(edition =>
      edition.questions.flatMap(question => question.figures ?? [])
    );
    expect(figures).toHaveLength(17);
    expect(
      figures.every(
        figure =>
          figure.src.startsWith("/figures/") &&
          figure.width > 0 &&
          figure.height > 0
      )
    ).toBe(true);
  });

  it("classifica os temas específicos pedidos na busca", () => {
    expect(question("2026-01", 2).topic).toBe("Hash e espalhamento");
    expect(question("2026-01", 2).subtopic).toMatch(/hash|colisões/i);
    expect(question("2026-01", 3).subtopic).toBe("Dijkstra e caminho mínimo");
    expect(question("2025-02", 1).subtopic).toBe("Pilhas (LIFO)");
    expect(question("2026-01", 4).subtopic).toBe("BST e percursos");
    expect(question("2026-01", 11).subtopic).toBe("Árvores B e B+");
    expect(question("2025-02", 8).subtopic).toBe("Rubro-negra");
    expect(question("2026-02", 2).subtopic).toBe("Heap e fila de prioridades");
    expect(question("2025-02", 6).subject).toBe("Algoritmos");
  });

  it("aceita termos com acentos, aliases e múltiplas palavras", () => {
    expect(matchesQuestionQuery(question("2026-01", 3), "dijkstra")).toBe(true);
    expect(matchesQuestionQuery(question("2026-01", 3), "caminho minimo")).toBe(
      true
    );
    expect(matchesQuestionQuery(question("2026-01", 2), "tabela hash")).toBe(
      true
    );
    expect(matchesQuestionQuery(question("2025-02", 1), "stack lifo")).toBe(
      true
    );
    expect(matchesQuestionQuery(question("2026-01", 3), "SQL")).toBe(false);
  });
});

describe("sessão do simulado", () => {
  it("aceita somente questões do edital selecionado", () => {
    expect(sessionBelongsToEdition(["2026-02-1", "2026-02-2"], "2026-02")).toBe(
      true
    );
    expect(sessionBelongsToEdition(["2026-02-1", "2026-01-2"], "2026-02")).toBe(
      false
    );
    expect(sessionBelongsToEdition([], "2026-02")).toBe(true);
  });

  it("aceita uma sessão de qualquer edital quando o filtro é global", () => {
    expect(sessionBelongsToEdition(["2026-02-1", "2025-02-8"], "todos")).toBe(
      true
    );
  });
});
