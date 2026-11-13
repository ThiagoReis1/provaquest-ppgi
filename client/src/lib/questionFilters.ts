import { normalizeSearchText } from "./normalizeSearch";

export type SearchBlock =
  | { type: "p" | "code"; text: string }
  | { type: "list"; items: readonly { label: string; text: string }[] };

export type SearchQuestion = {
  prompt: string;
  subject: string;
  editionLabel?: string;
  topic?: string;
  subtopic?: string;
  searchTerms?: readonly string[];
  options: readonly { id: string; text: string }[];
  blocks?: readonly SearchBlock[];
  solution?: {
    method?: string;
    steps?: readonly string[];
    conclusion?: string;
    distractors?: string;
  };
};

export function normalizeSearch(value: string) {
  // Mesma normalização da consulta nominal: sem acentos, sem diferença de
  // caixa e com apóstrofos tipográficos convertidos para o formato ASCII.
  return normalizeSearchText(value);
}

export function searchTextOf(question: SearchQuestion) {
  const blocks = (question.blocks ?? []).map(block => {
    if (block.type === "list")
      return block.items.map(item => `${item.label} ${item.text}`).join(" ");
    return block.text;
  });
  const options = question.options.map(option => `${option.id} ${option.text}`);
  const solution = question.solution
    ? [
        question.solution.method,
        ...(question.solution.steps ?? []),
        question.solution.conclusion,
        question.solution.distractors,
      ].join(" ")
    : "";
  return normalizeSearch(
    [
      question.prompt,
      question.subject,
      question.editionLabel,
      question.topic,
      question.subtopic,
      ...(question.searchTerms ?? []),
      ...blocks,
      ...options,
      solution,
    ].join(" ")
  );
}

export function matchesQuestionQuery(question: SearchQuestion, query: string) {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const searchable = searchTextOf(question);
  return tokens.every(token => searchable.includes(token));
}
