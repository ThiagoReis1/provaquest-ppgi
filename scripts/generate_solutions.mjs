import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { LlmClient, messageText } = await import(pathToFileURL('/home/ubuntu/skills/builtin-llm-models/lib/llm.mjs').href);
const inputPath = '/home/ubuntu/provaquest/client/src/data/questions.json';
const outputPath = '/home/ubuntu/provaquest/client/src/data/solutions.json';
const data = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const items = data.editions.flatMap((edition) => edition.questions
  .filter((question) => !question.annulled && !question.needsReview)
  .map((question) => ({
    id: `${edition.id}-${question.number}`,
    edition: edition.label,
    number: question.number,
    subject: question.subject,
    prompt: question.prompt,
    intro: question.intro,
    code: question.code,
    ask: question.ask,
    options: question.options,
    correct: question.correct,
  })));

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    solutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
          conclusion: { type: 'string' },
          distractors: { type: 'string' },
        },
        required: ['id', 'steps', 'conclusion', 'distractors'],
      },
    },
  },
  required: ['solutions'],
};

const llm = new LlmClient({ timeoutMs: 300000, maxRetries: 3 });
const result = [];
const batchSize = 7;
for (let offset = 0; offset < items.length; offset += batchSize) {
  const batch = items.slice(offset, offset + batchSize);
  const userPayload = batch.map((item) => ({
    id: item.id,
    edital: item.edition,
    questao: item.number,
    assunto: item.subject,
    enunciado: item.intro ? `${item.intro}\n\nCÓDIGO:\n${item.code}\n\nPERGUNTA:\n${item.ask}` : item.prompt,
    alternativas: item.options.map((option) => `${option.id}) ${option.text}`).join('\n'),
    gabarito_oficial: item.correct,
  }));
  const response = await llm.chat({
    model: 'gpt-6.1-sol',
    messages: [
      { role: 'system', content: 'Você é professor de algoritmos e estruturas de dados. Gere resoluções didáticas, corretas e concisas em português do Brasil. Use somente o enunciado, alternativas e gabarito fornecidos. Não invente dados ausentes. Cada passo deve explicar uma operação, fórmula, simulação ou propriedade que leve ao gabarito. Em distractors, explique em uma frase por que as alternativas incorretas não se aplicam. Retorne apenas JSON conforme o schema.' },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    reasoning: { effort: 'medium' },
    max_completion_tokens: 7000,
    response_format: { type: 'json_schema', json_schema: { name: 'question_solutions', strict: true, schema } },
  });
  const parsed = JSON.parse(messageText(response));
  result.push(...parsed.solutions);
  console.log(`batch ${Math.min(offset + batch.length, items.length)}/${items.length}`);
}

const byId = Object.fromEntries(result.map((item) => [item.id, item]));
const q1 = byId['2026-02-1'];
if (q1) {
  q1.steps = [
    'O laço externo dobra i a cada volta: 1, 2, 4, 8, … até n. Isso gera Θ(log n) níveis.',
    'No nível de tamanho i, o laço interno acessa min(i, n) posições. Como i dobra, a soma é 1 + 2 + 4 + … + n = Θ(n).',
    'Portanto, mesmo somando todos os níveis, o custo total é Θ(n), não Θ(n log n).',
    'O algoritmo usa apenas s, i e j, sem vetor auxiliar proporcional a n: o espaço auxiliar é Θ(1).',
  ];
  q1.conclusion = 'Resposta B — tempo Θ(n) e espaço auxiliar Θ(1).';
  q1.distractors = 'A conta cada nível como n; C ignora que o crescimento de i é geométrico; D troca tempo linear por logarítmico e atribui espaço extra inexistente.';
}
await fs.writeFile(outputPath, JSON.stringify({ solutions: byId }, null, 2));
console.log(`wrote ${outputPath} (${Object.keys(byId).length} solutions)`);
