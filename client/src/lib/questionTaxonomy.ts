export type TaxonomyQuestion = {
  editionId: string;
  subject: string;
  topic?: string;
  subtopic?: string;
  annulled?: boolean;
  needsReview?: boolean;
};

export function isQuestionRespondible(question: TaxonomyQuestion): boolean {
  return !question.annulled && !question.needsReview;
}

function inEdition(question: TaxonomyQuestion, editionId: string): boolean {
  return editionId === "todos" || question.editionId === editionId;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

export function availableSubjects(
  questions: readonly TaxonomyQuestion[],
  editionId: string
): string[] {
  return unique(
    questions
      .filter(
        question =>
          isQuestionRespondible(question) && inEdition(question, editionId)
      )
      .map(question => question.subject)
  );
}

export function availableTopics(
  questions: readonly TaxonomyQuestion[],
  editionId: string,
  subject: string
): string[] {
  return unique(
    questions
      .filter(
        question =>
          isQuestionRespondible(question) &&
          inEdition(question, editionId) &&
          (subject === "Todos os assuntos" || question.subject === subject)
      )
      .map(question => question.topic)
  );
}

export function availableSubtopics(
  questions: readonly TaxonomyQuestion[],
  editionId: string,
  subject: string,
  topic: string
): string[] {
  return unique(
    questions
      .filter(
        question =>
          isQuestionRespondible(question) &&
          inEdition(question, editionId) &&
          (subject === "Todos os assuntos" || question.subject === subject) &&
          (topic === "Todos os temas" || question.topic === topic)
      )
      .map(question => question.subtopic)
  );
}
