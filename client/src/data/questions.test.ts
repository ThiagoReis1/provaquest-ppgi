import { describe, expect, it } from "vitest";
import { studyData } from "./questions";
import { sessionBelongsToEdition } from "../lib/simulation";
import { matchesQuestionQuery } from "../lib/questionFilters";

const question = (editionId: string, number: number) =>
  studyData.editions
    .find(edition => edition.id === editionId)!
    .questions.find(item => item.number === number)!;

/**
 * Gabaritos finais publicados pela UFAM (PDFs oficiais de cada edital),
 * conferidos item a item com o acervo. `null` = questão anulada no gabarito.
 */
const officialKeys: Record<string, Record<number, string | null>> = {
  "2026-02": {
    1: "B",
    2: "B",
    3: "C",
    4: "B",
    5: "D",
    6: "D",
    7: "C",
    8: "A",
    9: "D",
    10: "C",
    11: null,
    12: "D",
    13: null,
    14: "C",
    15: "D",
    16: "A",
    17: "A",
    18: "D",
    19: "C",
    20: null,
  },
  "2026-01": {
    1: "C",
    2: "D",
    3: "A",
    4: "C",
    5: null,
    6: "B",
    7: null,
    8: "C",
    9: null,
    10: null,
    11: null,
    12: null,
    13: "C",
    14: "C",
    15: null,
    16: "B",
    17: "B",
    18: "A",
    19: "B",
    20: "C",
  },
  "2025-02": {
    1: "B",
    2: "A",
    3: "A",
    4: "C",
    5: null,
    6: null,
    7: "A",
    8: "A",
    9: "C",
    10: "B",
    11: "B",
    12: "D",
    13: "C",
    14: "B",
    15: "D",
    16: "A",
    17: "D",
    18: "D",
    19: null,
    20: "A",
  },
  "2025-01": {
    1: "A",
    2: null,
    3: "A",
    4: "E",
    5: null,
    6: null,
    7: "C",
    8: "C",
    9: "B",
    10: "D",
    11: "B",
    12: "C",
    13: "B",
    14: "D",
    15: null,
    16: "E",
    17: "C",
    18: "C",
    19: "E",
    20: "D",
  },
  "2024-02": {
    1: null,
    2: "C",
    3: "A",
    4: "D",
    5: "A",
    6: "A",
    7: null,
    8: "A",
    9: "C",
    10: "C",
    11: "C",
    12: "A",
    13: "B",
    14: "A",
    15: "B",
    16: null,
    17: "B",
    18: "A",
    19: "C",
    20: "C",
  },
  "2024-01": {
    1: null,
    2: "A",
    3: "B",
    4: "C",
    5: "B",
    6: "B",
    7: null,
    8: "D",
    9: "B",
    10: null,
    11: "D",
    12: "B",
    13: "C",
    14: "D",
    15: "B",
    16: "A",
    17: "C",
    18: "D",
    19: "B",
    20: "B",
  },
};

/** O edital 060/2019 só publica a folha de respostas com as questões anuladas. */
const annulled2020 = [11, 13, 14, 16];

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

  it("mantém o gabarito igual ao gabarito final oficial", () => {
    for (const [editionId, keys] of Object.entries(officialKeys)) {
      for (const [number, key] of Object.entries(keys)) {
        const item = question(editionId, Number(number));
        if (key === null) {
          expect(item.annulled).toBe(true);
          expect(item.correct).toBeNull();
        } else {
          expect(item.annulled).toBe(false);
          expect(item.correct).toBe(key);
        }
      }
    }
    const edition2020 = studyData.editions.find(
      edition => edition.id === "2020-01"
    )!;
    expect(
      edition2020.questions
        .filter(item => item.annulled)
        .map(item => item.number)
    ).toEqual(annulled2020);
  });

  it("não contradiz o gabarito oficial na solução de 2020/01-17", () => {
    const item = question("2020-01", 17);
    expect(item.correct).toBe("A");
    expect(item.solution?.conclusion).toMatch(/^Alternativa A/);
    expect(item.solution?.steps.join(" ")).toMatch(/gabarito final oficial/i);
  });

  it("mantém a tabela e as alternativas oficiais de 2026/02-12 legíveis", () => {
    const item = question("2026-02", 12);
    expect(item.correct).toBe("D");
    expect(item.sourcePageImage).toBe("/evidence/2026-02-page-7.png");
    expect(item.prompt).toContain("índices: 0, 1, 2, 3, 4, 5, 6");
    expect(item.prompt).toContain("elementos: [70, 9, 2, Ø, 4, 705, 27]");
    expect(item.options.map(option => option.text)).toEqual([
      "h(k, i) = (h'(k) + i) mod m.",
      "h(k, i) = (h'(k) + i²) mod m.",
      "h(k, i) = (h'(k) + 2i + i²) mod m.",
      "h(k, i) = (h'(k) + 3i) mod m.",
    ]);
  });

  it("só deixa como respondível quem tem alternativas e gabarito", () => {
    for (const edition of studyData.editions) {
      for (const item of edition.questions) {
        if (item.annulled || item.needsReview) continue;
        expect(item.options.length).toBeGreaterThanOrEqual(3);
        expect(item.solution?.steps.length).toBeGreaterThanOrEqual(2);
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
    expect(question("2026-02", 4).subtopic).toBe("Estabilidade de ordenação");
    expect(question("2026-02", 7).subtopic).toBe("Ordenação por seleção");
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
