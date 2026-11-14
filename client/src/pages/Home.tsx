import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  Flame,
  GraduationCap,
  LayoutGrid,
  Menu,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { studyData } from "@/data/questions";
import { candidateData } from "@/data/candidates";
import { questionId } from "@/lib/simulation";
import { matchesQuestionQuery } from "@/lib/questionFilters";
import { candidateStageTone } from "@/lib/candidateStageTone";
import { didCandidatePassStage } from "@/lib/candidateStageStatus";
import { normalizeSearchText } from "@/lib/normalizeSearch";
import { withStudyResult } from "@/lib/mergeStudyResults";
import {
  persistScopedDiff,
  readScopedValue,
  scopedStorageKey,
  writeJsonValue,
} from "@/lib/scopedStorage";
import { writeJsonSafely } from "@/lib/safeStorage";
import { simulationAnswerStatus } from "@/lib/simulationAnswerStatus";
import {
  availableSubjects,
  availableSubtopics,
  availableTopics,
} from "@/lib/questionTaxonomy";

type Edition = (typeof studyData.editions)[number];
type Question = Edition["questions"][number];
type PracticeQuestion = Question & { editionId: string; editionLabel: string };

type ListItem = { label: string; text: string; code?: boolean; level?: number };
type Block =
  | { type: "p"; text: string }
  | { type: "code"; text: string }
  | {
      type: "list";
      style: "roman" | "bullet" | "number";
      items: readonly ListItem[];
    };

type Figure = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  page?: number;
};

function blocksOf(question: Question): readonly Block[] {
  return ((question as unknown as { blocks?: readonly Block[] }).blocks ??
    []) as readonly Block[];
}

/** Figuras recortadas da prova original (árvore, grafo, tabela, diagrama). */
function figuresOf(question: Question): readonly Figure[] {
  return ((question as unknown as { figures?: readonly Figure[] }).figures ??
    []) as readonly Figure[];
}

/** Primeiro parágrafo do enunciado, usado em resumos (busca e revisão) sem arrastar código ou listas. */
function previewOf(question: Question) {
  const first = blocksOf(question).find(block => block.type === "p");
  return first && first.type === "p" ? first.text : question.prompt;
}

function FigureList({ question }: { question: Question }) {
  const figures = figuresOf(question);
  if (!figures.length) return null;
  return (
    <div className="question-figures">
      {figures.map((figure, index) => (
        <figure className="question-figure" key={`${figure.src}-${index}`}>
          <a
            href={figure.src}
            target="_blank"
            rel="noreferrer"
            title="Abrir a figura em tamanho real"
          >
            <img
              src={figure.src}
              alt={figure.alt}
              width={figure.width}
              height={figure.height}
              loading="lazy"
            />
          </a>
          {figure.caption && <figcaption>{figure.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function EditionSourceLinks({ edition }: { edition: Edition }) {
  return (
    <div
      className="simulation-source-links"
      aria-label={`Fontes oficiais do ${edition.label}`}
    >
      <span>Fontes oficiais:</span>
      <a href={edition.examUrl} target="_blank" rel="noreferrer">
        <FileText size={14} /> Caderno de questões <ExternalLink size={12} />
      </a>
      <a href={edition.keyUrl} target="_blank" rel="noreferrer">
        <Check size={14} /> Gabarito <ExternalLink size={12} />
      </a>
    </div>
  );
}

function QuestionBody({ question }: { question: Question }) {
  const blocks = blocksOf(question);
  if (!blocks.length)
    return <div className="question-prompt">{question.prompt}</div>;
  if (blocks.length === 1 && blocks[0].type === "p")
    return (
      <div className="question-prompt">
        {blocks[0].text}
        <FigureList question={question} />
      </div>
    );
  return (
    <div className="structured-question">
      {blocks.map((block, index) => {
        if (block.type === "code")
          return (
            <pre className="question-code" key={index}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.type === "list") {
          const ListTag = block.style === "bullet" ? "ul" : "ol";
          return (
            <ListTag
              className={`question-list question-list-${block.style}`}
              type={block.style === "roman" ? "I" : undefined}
              key={index}
            >
              {block.items.map((item, itemIndex) => (
                <li
                  className={item.level ? "question-list-nested" : undefined}
                  key={itemIndex}
                >
                  <span className="question-list-label">{item.label}</span>
                  {item.code ? (
                    <pre className="question-code question-code-item">
                      <code>{item.text}</code>
                    </pre>
                  ) : (
                    <span className="question-list-text">{item.text}</span>
                  )}
                </li>
              ))}
            </ListTag>
          );
        }
        const isAsk = index > 0 && index === blocks.length - 1;
        return (
          <div
            className={isAsk ? "question-ask" : "question-intro"}
            key={index}
          >
            {block.text}
          </div>
        );
      })}
      <FigureList question={question} />
      {question.sourcePageImage && (
        <details className="source-page">
          <summary>
            <FileText size={14} /> Ver referência visual da prova{" "}
            <ChevronRight size={14} />
          </summary>
          <div className="source-page-frame">
            <img
              src={question.sourcePageImage}
              alt={question.sourcePageLabel ?? "Página original da prova"}
            />
            <span>{question.sourcePageLabel}</span>
          </div>
        </details>
      )}
    </div>
  );
}

type Mode = "home" | "practice" | "simulate" | "sources" | "candidates";

const editionList = studyData.editions;
const allQuestions: PracticeQuestion[] = editionList.flatMap(edition =>
  edition.questions.map(question => ({
    ...question,
    editionId: edition.id,
    editionLabel: edition.label,
  }))
);
const editionLabels: Record<string, string> = Object.fromEntries(
  editionList.map(edition => [edition.id, edition.label])
);
const respondibleQuestionIds = new Set(
  allQuestions
    .filter(question => !question.annulled && !question.needsReview)
    .map(questionKey)
);

function questionKey(question: { editionId: string; number: number }) {
  return `${question.editionId}-${question.number}`;
}

function editionIdFromQuestionId(id: string) {
  const separator = id.lastIndexOf("-");
  return separator > 0 ? id.slice(0, separator) : "";
}

function isRespondible(question: Question) {
  return !question.annulled && !question.needsReview;
}

const subjectColors: Record<string, string> = {
  Algoritmos: "coral",
  "Estruturas de dados": "blue",
  Complexidade: "violet",
  Grafos: "mint",
};

function subjectColor(subject: string) {
  return subjectColors[subject] ?? "blue";
}

function validQuestions(edition: Edition) {
  return edition.questions.filter(
    question => !question.annulled && !question.needsReview
  );
}

function explain(question: Question) {
  if (question.solution?.conclusion) return question.solution.conclusion;
  if (question.subject === "Algoritmos")
    return "A alternativa é compatível com o comportamento e a complexidade do algoritmo descrito no enunciado.";
  if (question.subject === "Estruturas de dados")
    return "A resposta aplica a propriedade fundamental da estrutura de dados apresentada na questão.";
  if (question.subject === "Grafos")
    return "A alternativa respeita o funcionamento do algoritmo ou da representação de grafos descrita.";
  return "A alternativa correta é a indicada no gabarito final oficial; use o PDF da prova para revisar o raciocínio completo.";
}

function SolutionDetails({ question }: { question: Question }) {
  const solution = question.solution;
  if (!solution) return null;
  const methodNote = "methodNote" in solution ? solution.methodNote : undefined;
  return (
    <div className="solution-details">
      <div className="solution-heading">
        <Sparkles size={15} />
        <strong>Como resolver</strong>
        <span>{solution.method}</span>
      </div>
      <ol>
        {solution.steps.map((step, index) => (
          <li key={`${question.number}-${index}`}>{step}</li>
        ))}
      </ol>
      {methodNote && (
        <div className="solution-method-note">
          <CircleHelp size={14} />
          <span>{methodNote}</span>
        </div>
      )}
      <div className="solution-conclusion">
        <Check size={15} />
        <strong>{solution.conclusion}</strong>
      </div>
      <div className="solution-distractors">
        <strong>Por que as outras não?</strong>
        <span>{solution.distractors}</span>
      </div>
    </div>
  );
}

function AppLogo() {
  return (
    <div className="brand-mark" aria-label="ProvaQuest PPGI">
      <span className="brand-glyph">
        <Zap size={17} strokeWidth={2.8} />
      </span>
      <span>
        prova<span>quest</span>
      </span>
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function ProgressBar({
  value,
  tone = "blue",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div className={`progress-track progress-${tone}`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Persistência local: nada de perder a sessão com F5                 */
/* ------------------------------------------------------------------ */

const STORAGE_KEYS = {
  practice: "provaquest-practice",
  practiceQuestionPrefix: "provaquest-practice-question:",
  simulation: "provaquest-simulation", // chave antiga, usada para migrar sessões já salvas
  simulations: "provaquest-simulations",
  simulationEditionPrefix: "provaquest-simulation-edition:",
  simulationEdition: "provaquest-simulation-edition",
  filters: "provaquest-practice-filters",
  progress: "provaquest-progress",
  results: "provaquest-results",
  bookmarks: "provaquest-bookmarks",
} as const;

type PracticeState = {
  activeId: string | null;
  answers: Record<string, string>;
  submitted: Record<string, boolean>;
};

type SimulationState = {
  ids: string[];
  index: number;
  answers: Record<string, string>;
  submitted: Record<string, boolean>;
  finished: boolean;
};

type PracticeFilters = {
  query: string;
  edition: string;
  subject: string;
  topic: string;
  subtopic: string;
  bookmarksOnly: boolean;
};

const emptyPracticeState: PracticeState = {
  activeId: null,
  answers: {},
  submitted: {},
};

function practiceStorageEntries(
  state: PracticeState
): Record<string, { answer?: string; submitted?: true }> {
  const ids = new Set([
    ...Object.keys(state.answers),
    ...Object.keys(state.submitted),
  ]);
  return Object.fromEntries(
    [...ids]
      .filter(id => state.answers[id] || state.submitted[id] === true)
      .map(id => [
        id,
        {
          ...(state.answers[id] ? { answer: state.answers[id] } : {}),
          ...(state.submitted[id] === true ? { submitted: true as const } : {}),
        },
      ])
  );
}

const emptySimulationState: SimulationState = {
  ids: [],
  index: 0,
  answers: {},
  submitted: {},
  finished: false,
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    return writeJsonSafely(window.localStorage, key, value);
  } catch {
    return false;
  }
}

function sanitizeProgress(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, answered]) => answered === true && respondibleQuestionIds.has(id)
    )
  );
}

function sanitizeResults(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, correct]) =>
        typeof correct === "boolean" && respondibleQuestionIds.has(id)
    )
  );
}

function sanitizeAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, answer]) =>
        typeof answer === "string" && respondibleQuestionIds.has(id)
    )
  ) as Record<string, string>;
}

function loadPracticeState(): PracticeState {
  const saved = readStorage<Partial<PracticeState>>(
    STORAGE_KEYS.practice,
    emptyPracticeState
  );
  const answers = sanitizeAnswers(saved.answers);
  const submitted = sanitizeResults(saved.submitted);
  if (typeof window !== "undefined") {
    for (const question of allQuestions) {
      const id = questionKey(question);
      const scoped = readScopedValue(
        window.localStorage,
        STORAGE_KEYS.practiceQuestionPrefix,
        id
      );
      if (!scoped.present || !scoped.value || typeof scoped.value !== "object")
        continue;
      const value = scoped.value as { answer?: unknown; submitted?: unknown };
      if (typeof value.answer === "string") answers[id] = value.answer;
      else delete answers[id];
      if (value.submitted === true) submitted[id] = true;
      else delete submitted[id];
    }
  }
  return {
    activeId:
      typeof saved.activeId === "string" &&
      respondibleQuestionIds.has(saved.activeId)
        ? saved.activeId
        : null,
    answers,
    submitted,
  };
}

function loadSimulationStateForEdition(
  value: unknown,
  editionId: string
): SimulationState {
  if (!value || typeof value !== "object") return emptySimulationState;
  const saved = value as Partial<SimulationState>;
  const validIds = new Set(
    (editionList.find(edition => edition.id === editionId)?.questions ?? [])
      .filter(isRespondible)
      .map(question => questionId(editionId, question.number))
  );
  const ids = Array.isArray(saved.ids)
    ? Array.from(
        new Set(
          saved.ids.filter(
            (id): id is string => typeof id === "string" && validIds.has(id)
          )
        )
      )
    : [];
  const scopedIds = new Set(ids);
  const answers = sanitizeAnswers(saved.answers);
  const submitted = sanitizeResults(saved.submitted);
  const index =
    typeof saved.index === "number"
      ? Math.min(Math.max(0, saved.index), Math.max(0, ids.length - 1))
      : 0;
  return {
    ids,
    index,
    answers: Object.fromEntries(
      Object.entries(answers).filter(([id]) => scopedIds.has(id))
    ),
    submitted: Object.fromEntries(
      Object.entries(submitted).filter(([id]) => scopedIds.has(id))
    ),
    finished: saved.finished === true && ids.length > 0,
  };
}

function loadSimulationStates(): Record<string, SimulationState> {
  const saved = readStorage<unknown>(STORAGE_KEYS.simulations, {});
  const states: Record<string, SimulationState> = {};
  const scopedEditions = new Set<string>();
  if (saved && typeof saved === "object") {
    for (const edition of editionList) {
      const state = loadSimulationStateForEdition(
        (saved as Record<string, unknown>)[edition.id],
        edition.id
      );
      if (state.ids.length) states[edition.id] = state;
    }
  }

  if (typeof window !== "undefined") {
    for (const edition of editionList) {
      const scoped = readScopedValue(
        window.localStorage,
        STORAGE_KEYS.simulationEditionPrefix,
        edition.id
      );
      if (!scoped.present) continue;
      scopedEditions.add(edition.id);
      const state = loadSimulationStateForEdition(scoped.value, edition.id);
      if (state.ids.length) states[edition.id] = state;
      else delete states[edition.id];
    }
  }

  // Migra a sessão única criada por versões anteriores, sem sobrescrever dados novos.
  const legacy = readStorage<unknown>(STORAGE_KEYS.simulation, null);
  if (legacy && typeof legacy === "object") {
    const oldState = legacy as Partial<SimulationState>;
    const firstId = Array.isArray(oldState.ids)
      ? oldState.ids.find((id): id is string => typeof id === "string")
      : undefined;
    const legacyEdition = firstId ? editionIdFromQuestionId(firstId) : "";
    if (
      legacyEdition &&
      editionLabels[legacyEdition] &&
      !scopedEditions.has(legacyEdition) &&
      !states[legacyEdition]
    ) {
      const migrated = loadSimulationStateForEdition(legacy, legacyEdition);
      if (migrated.ids.length) states[legacyEdition] = migrated;
    }
  }
  return states;
}

function loadSimulationEdition(
  states: Record<string, SimulationState>
): string {
  const saved = readStorage<unknown>(STORAGE_KEYS.simulationEdition, null);
  if (typeof saved === "string" && editionLabels[saved]) return saved;
  const legacy = readStorage<unknown>(STORAGE_KEYS.simulation, null);
  if (legacy && typeof legacy === "object") {
    const ids = (legacy as Partial<SimulationState>).ids;
    const firstId = Array.isArray(ids)
      ? ids.find((id): id is string => typeof id === "string")
      : undefined;
    const legacyEdition = firstId ? editionIdFromQuestionId(firstId) : "";
    if (legacyEdition && editionLabels[legacyEdition]) return legacyEdition;
  }
  return (
    editionList.find(edition => states[edition.id])?.id ?? editionList[0].id
  );
}

function loadFilters(): PracticeFilters {
  const saved = readStorage<Partial<PracticeFilters>>(STORAGE_KEYS.filters, {});
  const edition =
    typeof saved.edition === "string" &&
    (saved.edition === "todos" ||
      editionList.some(item => item.id === saved.edition))
      ? saved.edition
      : "todos";
  return {
    query: typeof saved.query === "string" ? saved.query : "",
    edition,
    subject:
      typeof saved.subject === "string" ? saved.subject : "Todos os assuntos",
    topic: typeof saved.topic === "string" ? saved.topic : "Todos os temas",
    subtopic:
      typeof saved.subtopic === "string" ? saved.subtopic : "Todos os subtemas",
    bookmarksOnly: saved.bookmarksOnly === true,
  };
}

function modeFromUrl(): Mode {
  if (typeof window === "undefined") return "home";
  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "study" || view === "search" || view === "practice")
    return "practice";
  if (view === "simulate") return "simulate";
  if (view === "sources") return "sources";
  if (view === "candidates") return "candidates";
  return "home";
}

/* ------------------------------------------------------------------ */

export default function Home() {
  const [mode, setMode] = useState<Mode>(() => modeFromUrl());
  const initialFilters = useMemo(() => loadFilters(), []);

  const [selectedEdition, setSelectedEdition] = useState(
    initialFilters.edition
  );
  const [selectedSubject, setSelectedSubject] = useState(
    initialFilters.subject
  );
  const [selectedTopic, setSelectedTopic] = useState(initialFilters.topic);
  const [selectedSubtopic, setSelectedSubtopic] = useState(
    initialFilters.subtopic
  );
  const [query, setQuery] = useState(initialFilters.query);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(
    initialFilters.bookmarksOnly
  );
  const [mobileMenu, setMobileMenu] = useState(false);

  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    const saved = readStorage<unknown>(STORAGE_KEYS.bookmarks, []);
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string")
      : [];
  });

  const [completed, setCompleted] = useState<Record<string, boolean>>(() =>
    sanitizeProgress(readStorage(STORAGE_KEYS.progress, {}))
  );
  const [studyResults, setStudyResults] = useState<Record<string, boolean>>(
    () => sanitizeResults(readStorage(STORAGE_KEYS.results, {}))
  );

  const [practice, setPractice] = useState<PracticeState>(() =>
    loadPracticeState()
  );
  const [simulations, setSimulations] = useState<
    Record<string, SimulationState>
  >(() => loadSimulationStates());
  const [simEdition, setSimEdition] = useState<string>(() =>
    loadSimulationEdition(loadSimulationStates())
  );
  const previousPracticeRef = useRef(practice);
  const previousSimulationsRef = useRef(simulations);
  const simulation = simulations[simEdition] ?? emptySimulationState;

  /* Migra dados antigos para chaves isoladas antes de remover os formatos legados. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    try {
      let migrated = true;
      const practiceEntries = practiceStorageEntries(practice);
      for (const [id, value] of Object.entries(practiceEntries)) {
        const scoped = readScopedValue(
          storage,
          STORAGE_KEYS.practiceQuestionPrefix,
          id
        );
        if (
          !scoped.present &&
          !writeJsonValue(
            storage,
            scopedStorageKey(STORAGE_KEYS.practiceQuestionPrefix, id),
            value
          )
        )
          migrated = false;
      }
      if (migrated) {
        writeJsonValue(storage, STORAGE_KEYS.practice, {
          activeId: practice.activeId,
        });
      }

      let simulationsMigrated = true;
      for (const [editionId, state] of Object.entries(simulations)) {
        const scoped = readScopedValue(
          storage,
          STORAGE_KEYS.simulationEditionPrefix,
          editionId
        );
        if (
          !scoped.present &&
          !writeJsonValue(
            storage,
            scopedStorageKey(STORAGE_KEYS.simulationEditionPrefix, editionId),
            state
          )
        )
          simulationsMigrated = false;
      }
      if (simulationsMigrated) {
        storage.removeItem(STORAGE_KEYS.simulations);
        storage.removeItem(STORAGE_KEYS.simulation);
      }
    } catch {
      /* Mantém os formatos anteriores se o storage não aceitar a migração. */
    }
  }, []);

  /* Cada questão/edital tem sua chave: uma aba não sobrescreve as outras. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    const previousEntries = practiceStorageEntries(previousPracticeRef.current);
    const currentEntries = practiceStorageEntries(practice);
    persistScopedDiff(
      storage,
      STORAGE_KEYS.practiceQuestionPrefix,
      previousEntries,
      currentEntries
    );
    writeStorage(STORAGE_KEYS.practice, { activeId: practice.activeId });
    previousPracticeRef.current = practice;
  }, [practice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      persistScopedDiff(
        window.localStorage,
        STORAGE_KEYS.simulationEditionPrefix,
        previousSimulationsRef.current,
        simulations
      );
      previousSimulationsRef.current = simulations;
    } catch {
      /* Mantém a sessão em memória quando o storage está indisponível. */
    }
  }, [simulations]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.simulationEdition, simEdition);
  }, [simEdition]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.filters, {
      query,
      edition: selectedEdition,
      subject: selectedSubject,
      topic: selectedTopic,
      subtopic: selectedSubtopic,
      bookmarksOnly: bookmarkedOnly,
    });
  }, [
    query,
    selectedEdition,
    selectedSubject,
    selectedTopic,
    selectedSubtopic,
    bookmarkedOnly,
  ]);

  /* Mantém a aba atual na URL para que o F5 reabra a mesma tela. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (mode === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", mode);
    window.history.replaceState({}, "", url);
  }, [mode]);

  /* O botão Voltar/Avançar altera o histórico fora do React. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncModeFromHistory = () => setMode(modeFromUrl());
    window.addEventListener("popstate", syncModeFromHistory);
    return () => window.removeEventListener("popstate", syncModeFromHistory);
  }, []);

  useEffect(() => {
    const syncStorage = (event: Event) => {
      const storageEvent = event as StorageEvent;
      const key = storageEvent.key;
      if (key === STORAGE_KEYS.results || key === STORAGE_KEYS.progress) {
        let value: unknown = {};
        try {
          value = storageEvent.newValue
            ? JSON.parse(storageEvent.newValue)
            : {};
        } catch {
          return;
        }
        if (key === STORAGE_KEYS.results)
          setStudyResults(sanitizeResults(value));
        else setCompleted(sanitizeProgress(value));
        return;
      }
      if (key?.startsWith(STORAGE_KEYS.practiceQuestionPrefix)) {
        const id = decodeURIComponent(
          key.slice(STORAGE_KEYS.practiceQuestionPrefix.length)
        );
        if (!respondibleQuestionIds.has(id)) return;
        let value: { answer?: unknown; submitted?: unknown } | null = null;
        try {
          value = storageEvent.newValue
            ? JSON.parse(storageEvent.newValue)
            : null;
        } catch {
          return;
        }
        setPractice(previous => {
          const answers = { ...previous.answers };
          const submitted = { ...previous.submitted };
          if (value && typeof value.answer === "string")
            answers[id] = value.answer;
          else delete answers[id];
          if (value?.submitted === true) submitted[id] = true;
          else delete submitted[id];
          return { ...previous, answers, submitted };
        });
        return;
      }
      if (key?.startsWith(STORAGE_KEYS.simulationEditionPrefix)) {
        const editionId = decodeURIComponent(
          key.slice(STORAGE_KEYS.simulationEditionPrefix.length)
        );
        if (!editionLabels[editionId]) return;
        let state: SimulationState | undefined;
        try {
          if (storageEvent.newValue) {
            state = loadSimulationStateForEdition(
              JSON.parse(storageEvent.newValue),
              editionId
            );
          }
        } catch {
          return;
        }
        setSimulations(previous => {
          const next = { ...previous };
          if (state?.ids.length) next[editionId] = state;
          else delete next[editionId];
          return next;
        });
        return;
      }

      const detail = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) {
        setBookmarkedIds(detail);
        return;
      }
      // Qualquer outra chave (aba atual, filtros, tema) não mexe nos favoritos.
      if (key !== null && key !== STORAGE_KEYS.bookmarks) return;
      const saved = readStorage<unknown>(STORAGE_KEYS.bookmarks, []);
      setBookmarkedIds(
        Array.isArray(saved)
          ? saved.filter((item): item is string => typeof item === "string")
          : []
      );
    };
    window.addEventListener("provaquest-bookmarks-changed", syncStorage);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener("provaquest-bookmarks-changed", syncStorage);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const subjects = useMemo(
    () => [
      "Todos os assuntos",
      ...availableSubjects(allQuestions, selectedEdition),
    ],
    [selectedEdition]
  );

  const topics = useMemo(
    () => [
      "Todos os temas",
      ...availableTopics(allQuestions, selectedEdition, selectedSubject),
    ],
    [selectedEdition, selectedSubject]
  );

  const subtopics = useMemo(
    () => [
      "Todos os subtemas",
      ...availableSubtopics(
        allQuestions,
        selectedEdition,
        selectedSubject,
        selectedTopic
      ),
    ],
    [selectedEdition, selectedSubject, selectedTopic]
  );

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(question => {
      const matchesQuery = matchesQuestionQuery(question, query);
      const matchesSubject =
        selectedSubject === "Todos os assuntos" ||
        question.subject === selectedSubject;
      const matchesTopic =
        selectedTopic === "Todos os temas" || question.topic === selectedTopic;
      const matchesSubtopic =
        selectedSubtopic === "Todos os subtemas" ||
        question.subtopic === selectedSubtopic;
      const matchesEdition =
        selectedEdition === "todos" || question.editionId === selectedEdition;
      const matchesBookmark =
        !bookmarkedOnly || bookmarkedIds.includes(questionKey(question));
      return (
        matchesQuery &&
        matchesSubject &&
        matchesTopic &&
        matchesSubtopic &&
        matchesEdition &&
        matchesBookmark &&
        isRespondible(question)
      );
    });
  }, [
    query,
    selectedSubject,
    selectedTopic,
    selectedSubtopic,
    selectedEdition,
    bookmarkedOnly,
    bookmarkedIds,
  ]);

  const answeredCount = new Set([
    ...Object.keys(practice.submitted),
    ...Object.keys(completed),
  ]).size;
  const correctCount = Object.values(studyResults).filter(Boolean).length;
  const globalProgress = Math.min(
    100,
    Math.round((answeredCount / Math.max(1, respondibleQuestionIds.size)) * 100)
  );

  const practiceQuestion = practice.activeId
    ? allQuestions.find(question => questionKey(question) === practice.activeId)
    : undefined;
  const practicePosition = practiceQuestion
    ? filteredQuestions.findIndex(
        question => questionKey(question) === practice.activeId
      ) + 1
    : 0;
  const practiceAnswer = practiceQuestion
    ? practice.answers[questionKey(practiceQuestion)]
    : undefined;
  const practiceSubmitted = practiceQuestion
    ? Boolean(practice.submitted[questionKey(practiceQuestion)])
    : false;

  const filterIds = useMemo(
    () => filteredQuestions.map(questionKey),
    [filteredQuestions]
  );
  const answeredInFilter = filterIds.filter(
    id => practice.submitted[id] || completed[id]
  ).length;
  const correctInFilter = filterIds.filter(
    id => (practice.submitted[id] || completed[id]) && studyResults[id] === true
  ).length;
  const filterProgress = filteredQuestions.length
    ? (answeredInFilter / filteredQuestions.length) * 100
    : 0;

  const simulationEdition =
    editionList.find(item => item.id === simEdition) ?? editionList[0];
  const simulationQuestion = simulation.ids[simulation.index]
    ? allQuestions.find(
        question => questionKey(question) === simulation.ids[simulation.index]
      )
    : undefined;
  const simulationAnswer = simulationQuestion
    ? simulation.answers[questionKey(simulationQuestion)]
    : undefined;
  const simulationSubmitted = simulationQuestion
    ? Boolean(simulation.submitted[questionKey(simulationQuestion)])
    : false;

  /* Sempre existe uma questão ativa dentro do filtro atual. */
  useEffect(() => {
    if (mode !== "practice" || !filteredQuestions.length) return;
    const stillVisible =
      practice.activeId &&
      filteredQuestions.some(
        question => questionKey(question) === practice.activeId
      );
    if (stillVisible) return;
    const nextQuestion =
      filteredQuestions.find(question => {
        const id = questionKey(question);
        return (
          !practice.submitted[id] && !(completed[id] && practice.answers[id])
        );
      }) ?? filteredQuestions[0];
    setPractice(previous => ({
      ...previous,
      activeId: questionKey(nextQuestion),
    }));
  }, [
    mode,
    filteredQuestions,
    practice.activeId,
    practice.submitted,
    completed,
  ]);

  function persistProgress(next: Record<string, boolean>) {
    const sanitized = sanitizeProgress(next);
    setCompleted(sanitized);
    writeStorage(STORAGE_KEYS.progress, sanitized);
  }

  function persistResult(id: string, correct: boolean) {
    const latestPersisted = sanitizeResults(
      readStorage(STORAGE_KEYS.results, {})
    );
    const next = sanitizeResults(
      withStudyResult(studyResults, latestPersisted, id, correct)
    );
    setStudyResults(next);
    writeStorage(STORAGE_KEYS.results, next);
  }

  function handleEditionChange(nextEdition: string) {
    setSelectedEdition(nextEdition);
    if (
      selectedSubject !== "Todos os assuntos" &&
      nextEdition !== "todos" &&
      !allQuestions.some(
        question =>
          question.editionId === nextEdition &&
          question.subject === selectedSubject &&
          !question.annulled &&
          !question.needsReview
      )
    ) {
      setSelectedSubject("Todos os assuntos");
    }
    setSelectedTopic("Todos os temas");
    setSelectedSubtopic("Todos os subtemas");
  }

  function handleSearchSubjectChange(nextSubject: string) {
    setSelectedSubject(nextSubject);
    setSelectedTopic("Todos os temas");
    setSelectedSubtopic("Todos os subtemas");
  }

  function handleSearchTopicChange(nextTopic: string) {
    setSelectedTopic(nextTopic);
    setSelectedSubtopic("Todos os subtemas");
  }

  function navigateToMode(nextMode: Mode) {
    if (typeof window !== "undefined" && modeFromUrl() !== nextMode) {
      const url = new URL(window.location.href);
      if (nextMode === "home") url.searchParams.delete("view");
      else url.searchParams.set("view", nextMode);
      window.history.pushState({}, "", url);
    }
    setMode(nextMode);
  }

  function nav(nextMode: Mode) {
    navigateToMode(nextMode);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Abre a prática já com o filtro desejado (ou o último filtro salvo). */
  function startPractice(
    options: {
      editionId?: string;
      subject?: string;
      bookmarksOnly?: boolean;
      resetFilters?: boolean;
      activeId?: string | null;
    } = {}
  ) {
    if (options.resetFilters) {
      setSelectedEdition("todos");
      setSelectedSubject("Todos os assuntos");
      setSelectedTopic("Todos os temas");
      setSelectedSubtopic("Todos os subtemas");
      setQuery("");
      setBookmarkedOnly(false);
    } else {
      if (options.editionId) {
        if (options.editionId !== selectedEdition) {
          setSelectedTopic("Todos os temas");
          setSelectedSubtopic("Todos os subtemas");
        }
        setSelectedEdition(options.editionId);
      }
      if (options.subject) setSelectedSubject(options.subject);
      if (options.bookmarksOnly !== undefined)
        setBookmarkedOnly(options.bookmarksOnly);
    }
    setPractice(previous => ({
      ...previous,
      activeId: options.activeId ?? null,
    }));
    navigateToMode("practice");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditionPractice(editionId: string) {
    setSelectedTopic("Todos os temas");
    setSelectedSubtopic("Todos os subtemas");
    setQuery("");
    startPractice({
      editionId,
      subject: "Todos os assuntos",
      bookmarksOnly: false,
    });
  }

  function openPracticeQuestion(question: PracticeQuestion) {
    setPractice(previous => ({
      ...previous,
      activeId: questionKey(question),
    }));
  }

  function selectPracticeOption(optionId: string) {
    if (!practiceQuestion) return;
    const id = questionKey(practiceQuestion);
    setPractice(previous => ({
      ...previous,
      answers: { ...previous.answers, [id]: optionId },
    }));
  }

  function submitPracticeAnswer() {
    if (!practiceQuestion || practiceSubmitted) return;
    const id = questionKey(practiceQuestion);
    const answer = practice.answers[id];
    if (!answer) return;
    setPractice(previous => ({
      ...previous,
      submitted: { ...previous.submitted, [id]: true },
    }));
    persistProgress({
      ...sanitizeProgress(readStorage(STORAGE_KEYS.progress, {})),
      [id]: true,
    });
    persistResult(id, answer === practiceQuestion.correct);
  }

  function stepPractice(direction: 1 | -1) {
    if (!filteredQuestions.length) return;
    const currentIndex = filteredQuestions.findIndex(
      question => questionKey(question) === practice.activeId
    );
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= filteredQuestions.length) {
      setPractice(previous => ({
        ...previous,
        activeId: questionKey(filteredQuestions[0]),
      }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPractice(previous => ({
      ...previous,
      activeId: questionKey(filteredQuestions[nextIndex]),
    }));
  }

  /** Apaga as respostas apenas do filtro atual, para recomeçar do zero. */
  function clearFilterProgress() {
    const ids = filterIds;
    if (!ids.length) return;
    const confirmed = window.confirm(
      `Apagar as respostas de ${ids.length} questão(ões) deste filtro? Elas voltam a contar como não respondidas.`
    );
    if (!confirmed) return;
    const nextAnswers = { ...practice.answers };
    const nextSubmitted = { ...practice.submitted };
    const nextCompleted = sanitizeProgress(
      readStorage(STORAGE_KEYS.progress, {})
    );
    const nextResults = sanitizeResults(readStorage(STORAGE_KEYS.results, {}));
    ids.forEach(id => {
      delete nextAnswers[id];
      delete nextSubmitted[id];
      delete nextCompleted[id];
      delete nextResults[id];
    });
    setPractice(previous => ({
      ...previous,
      answers: nextAnswers,
      submitted: nextSubmitted,
    }));
    persistProgress(nextCompleted);
    setStudyResults(nextResults);
    writeStorage(STORAGE_KEYS.results, nextResults);
  }

  /** Apaga todo o histórico local (respostas, acertos e simulado salvo). */
  function clearAllProgress() {
    const confirmed = window.confirm(
      "Apagar todo o seu progresso (respostas, acertos e simulado salvo)? Os favoritos são mantidos. Esta ação não pode ser desfeita."
    );
    if (!confirmed) return;
    setPractice(emptyPracticeState);
    setSimulations({});
    persistProgress({});
    setStudyResults({});
    writeStorage(STORAGE_KEYS.results, {});
  }

  function startSimulation(editionId: string, restart = false) {
    const target =
      editionList.find(item => item.id === editionId) ?? editionList[0];
    const current = simulations[target.id];
    const hasProgress = Boolean(
      current &&
        (Object.keys(current.answers).length ||
          Object.keys(current.submitted).length)
    );
    if (
      restart &&
      hasProgress &&
      !window.confirm(
        `Reiniciar o simulado ${target.label}? As respostas salvas deste edital serão apagadas.`
      )
    )
      return;

    setSimEdition(target.id);
    if (!current?.ids.length || restart) {
      setSimulations(previous => ({
        ...previous,
        [target.id]: {
          ids: validQuestions(target).map(question =>
            questionId(target.id, question.number)
          ),
          index: 0,
          answers: {},
          submitted: {},
          finished: false,
        },
      }));
    }
    navigateToMode("simulate");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearSimulation(editionId: string) {
    const state = simulations[editionId];
    if (!state) return;
    const label = editionLabels[editionId] ?? editionId;
    if (
      !window.confirm(
        `Zerar somente o progresso do simulado ${label}? Esta ação não pode ser desfeita.`
      )
    )
      return;
    setSimulations(previous => {
      const next = { ...previous };
      delete next[editionId];
      return next;
    });
  }

  function clearAllSimulations() {
    if (!Object.keys(simulations).length) return;
    if (
      !window.confirm(
        "Zerar o progresso de todos os simulados? O progresso da prática e os favoritos serão mantidos."
      )
    )
      return;
    setSimulations({});
  }

  function selectSimulationEdition(editionId: string) {
    setSimEdition(editionId);
    navigateToMode("simulate");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectSimulationOption(optionId: string) {
    if (!simulationQuestion) return;
    const id = questionKey(simulationQuestion);
    setSimulations(previous => ({
      ...previous,
      [simEdition]: {
        ...(previous[simEdition] ?? emptySimulationState),
        answers: {
          ...(previous[simEdition]?.answers ?? {}),
          [id]: optionId,
        },
      },
    }));
  }

  function submitSimulationAnswer() {
    if (!simulationQuestion || simulationSubmitted) return;
    const id = questionKey(simulationQuestion);
    if (!simulation.answers[id]) return;
    setSimulations(previous => ({
      ...previous,
      [simEdition]: {
        ...(previous[simEdition] ?? emptySimulationState),
        submitted: {
          ...(previous[simEdition]?.submitted ?? {}),
          [id]: true,
        },
      },
    }));
  }

  function nextSimulationQuestion() {
    setSimulations(previous => {
      const current = previous[simEdition] ?? emptySimulationState;
      if (current.index >= current.ids.length - 1)
        return {
          ...previous,
          [simEdition]: { ...current, finished: true },
        };
      return {
        ...previous,
        [simEdition]: { ...current, index: current.index + 1 },
      };
    });
  }

  function previousSimulationQuestion() {
    setSimulations(previous => {
      const current = previous[simEdition] ?? emptySimulationState;
      return {
        ...previous,
        [simEdition]: { ...current, index: Math.max(0, current.index - 1) },
      };
    });
  }

  function goToSimulationQuestion(index: number) {
    setSimulations(previous => {
      const current = previous[simEdition] ?? emptySimulationState;
      if (index < 0 || index >= current.ids.length) return previous;
      return {
        ...previous,
        [simEdition]: { ...current, index },
      };
    });
  }

  const navItems: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Visão geral", icon: <LayoutGrid size={17} /> },
    { id: "practice", label: "Praticar", icon: <Search size={17} /> },
    { id: "simulate", label: "Simulados", icon: <Target size={17} /> },
    {
      id: "candidates",
      label: "Candidatos e resultados",
      icon: <GraduationCap size={17} />,
    },
    { id: "sources", label: "Fontes oficiais", icon: <FileText size={17} /> },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="logo-button" onClick={() => nav("home")}>
            <AppLogo />
          </button>
          <div className="header-context">
            <span className="eyebrow">PPGI · UFAM</span>
            <span className="context-separator">/</span>
            <span>Preparação inteligente</span>
          </div>
          <div className="header-actions">
            <Pill tone="mint">
              <span className="status-dot" /> PDFs oficiais importados
            </Pill>
            <button
              className="icon-button mobile-only"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label={mobileMenu ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileMenu}
              aria-controls="primary-navigation"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
          <div className="sidebar-top">
            <span className="sidebar-label">Seu espaço</span>
            <nav id="primary-navigation">
              {navItems.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${mode === item.id ? "active" : ""}`}
                  aria-current={mode === item.id ? "page" : undefined}
                  onClick={() => nav(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-progress-panel">
              <div className="streak-card">
                <div className="streak-icon">
                  <Flame size={18} />
                </div>
                <div>
                  <strong>Seu progresso de prática</strong>
                  <span>
                    {answeredCount
                      ? `${answeredCount} respostas registradas`
                      : "Comece sua primeira sessão"}
                  </span>
                </div>
              </div>
              <div className="mini-progress">
                <div className="mini-progress-label">
                  <span>Prática respondida</span>
                  <b>{globalProgress}%</b>
                </div>
                <ProgressBar value={globalProgress} tone="mint" />
                <button className="reset-link" onClick={clearAllProgress}>
                  <Trash2 size={13} /> Zerar progresso
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          {mode === "home" && (
            <>
              <section className="hero-block">
                <div className="hero-copy">
                  <Pill tone="coral">
                    <Sparkles size={13} /> estudo guiado
                  </Pill>
                  <h1>
                    Domine a prova.
                    <br />
                    <em>Uma questão por vez.</em>
                  </h1>
                  <p>
                    Treine com as provas oficiais do PPGI/UFAM em um fluxo
                    rápido, visual e feito para você enxergar evolução.
                  </p>
                  <div className="hero-ctas">
                    <button
                      className="primary-button"
                      onClick={() => startPractice()}
                    >
                      <Play size={16} fill="currentColor" /> Praticar agora{" "}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="quiet-button"
                      onClick={() => nav("simulate")}
                    >
                      Ver simulados <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="hero-orbit" aria-hidden="true">
                  <div className="orbit-ring ring-one" />
                  <div className="orbit-ring ring-two" />
                  <div className="orbit-core">
                    <GraduationCap size={30} />
                    <span>{editionList.length} editais</span>
                  </div>
                  <span className="orbit-chip chip-one">+ feedback</span>
                  <span className="orbit-chip chip-two">
                    {respondibleQuestionIds.size} questões
                  </span>
                </div>
              </section>
              <section className="stats-strip">
                <div>
                  <span className="stat-icon blue">
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <strong>{allQuestions.length}</strong>
                    <span>questões mapeadas</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon coral">
                    <Target size={18} />
                  </span>
                  <div>
                    <strong>{editionList.length}</strong>
                    <span>editais disponíveis</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon mint">
                    <Trophy size={18} />
                  </span>
                  <div>
                    <strong>
                      {answeredCount}
                      <small className="stat-total">
                        /{respondibleQuestionIds.size}
                      </small>
                    </strong>
                    <span>questões respondidas na prática</span>
                  </div>
                </div>
              </section>
              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">Comece por aqui</span>
                    <h2>Escolha o seu caminho</h2>
                  </div>
                  <span className="section-caption">
                    Do aquecimento ao simulado completo
                  </span>
                </div>
                <div className="path-grid">
                  <button
                    className="path-card path-card-main"
                    onClick={() => startPractice()}
                  >
                    <div className="path-card-top">
                      <span className="round-icon coral">
                        <Zap size={19} />
                      </span>
                      <span className="path-tag">Recomendado</span>
                    </div>
                    <h3>Treino rápido</h3>
                    <p>
                      Abre na sua próxima questão não respondida, com correção
                      imediata e progresso salvo automático.
                    </p>
                    <span className="path-link">
                      Continuar de onde parei <ArrowRight size={15} />
                    </span>
                    <div className="path-decoration">01</div>
                  </button>
                  <button className="path-card" onClick={() => nav("simulate")}>
                    <div className="path-card-top">
                      <span className="round-icon blue">
                        <Target size={19} />
                      </span>
                      <span className="path-tag">Modo prova</span>
                    </div>
                    <h3>Simular um edital</h3>
                    <p>
                      Faça a prova inteira, veja sua nota e revise cada resposta
                      ao final.
                    </p>
                    <span className="path-link blue-link">
                      Escolher edital <ArrowRight size={15} />
                    </span>
                    <div className="path-decoration">02</div>
                  </button>
                  <button
                    className="path-card"
                    onClick={() => startPractice({ resetFilters: true })}
                  >
                    <div className="path-card-top">
                      <span className="round-icon violet">
                        <Search size={19} />
                      </span>
                      <span className="path-tag">Explorar</span>
                    </div>
                    <h3>Encontre a questão certa</h3>
                    <p>
                      Filtre por edital, assunto e tema, ou busque por palavra —
                      e resolva a questão ali mesmo.
                    </p>
                    <span className="path-link violet-link">
                      Abrir busca <ArrowRight size={15} />
                    </span>
                    <div className="path-decoration">03</div>
                  </button>
                </div>
              </section>
              <section className="section-block edition-preview">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">Acervo oficial</span>
                    <h2>Treine por edital</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => nav("sources")}
                  >
                    Ver todas as fontes <ArrowRight size={14} />
                  </button>
                </div>
                <div className="edition-list">
                  {editionList.slice(0, 4).map(item => (
                    <button
                      className="edition-row"
                      key={item.id}
                      onClick={() => startEditionPractice(item.id)}
                    >
                      <img src={item.thumbnail} alt="" />
                      <div className="edition-main">
                        <strong>{item.label}</strong>
                        <span>{item.subtitle}</span>
                      </div>
                      <div className="edition-meta">
                        <Pill tone="neutral">
                          {validQuestions(item).length} válidas
                        </Pill>
                        <ChevronRight size={17} />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {mode === "practice" && (
            <PracticeView
              query={query}
              setQuery={setQuery}
              selectedEdition={selectedEdition}
              onEditionChange={handleEditionChange}
              selectedSubject={selectedSubject}
              onSubjectChange={handleSearchSubjectChange}
              selectedTopic={selectedTopic}
              onTopicChange={handleSearchTopicChange}
              selectedSubtopic={selectedSubtopic}
              onSubtopicChange={setSelectedSubtopic}
              subjects={subjects}
              topics={topics}
              subtopics={subtopics}
              questions={filteredQuestions}
              bookmarkedOnly={bookmarkedOnly}
              onBookmarkedOnlyChange={setBookmarkedOnly}
              question={practiceQuestion}
              position={practicePosition}
              currentAnswer={practiceAnswer}
              isSubmitted={practiceSubmitted}
              onSelect={selectPracticeOption}
              onSubmit={submitPracticeAnswer}
              onNext={() => stepPractice(1)}
              onPrev={() => stepPractice(-1)}
              canPrev={practicePosition > 1}
              onOpen={openPracticeQuestion}
              onClearFilter={clearFilterProgress}
              answeredInFilter={answeredInFilter}
              correctInFilter={correctInFilter}
              submitted={practice.submitted}
              results={studyResults}
              progress={filterProgress}
            />
          )}

          {mode === "simulate" && (
            <SimulationView
              edition={simulationEdition}
              selectedEdition={simEdition}
              onEditionChange={selectSimulationEdition}
              simulations={simulations}
              onClearSimulation={clearSimulation}
              onClearAllSimulations={clearAllSimulations}
              onStart={startSimulation}
              currentQuestion={simulationQuestion}
              currentAnswer={simulationAnswer}
              isSubmitted={simulationSubmitted}
              answers={simulation.answers}
              ids={simulation.ids}
              index={simulation.index}
              finished={simulation.finished}
              onSelect={selectSimulationOption}
              onSubmit={submitSimulationAnswer}
              onNext={nextSimulationQuestion}
              onPrev={previousSimulationQuestion}
              onGoToQuestion={goToSimulationQuestion}
              onRestart={() => startSimulation(simEdition, true)}
            />
          )}

          {mode === "sources" && (
            <SourcesView
              editionList={editionList}
              startEditionPractice={startEditionPractice}
            />
          )}

          {mode === "candidates" && <CandidatesView />}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card da questão (compartilhado entre prática e simulado)            */
/* ------------------------------------------------------------------ */

function QuestionCard({
  question,
  currentAnswer,
  isSubmitted,
  revealAnswer = true,
  onSelect,
  onSubmit,
  onNext,
  onPrev,
  canPrev = false,
  position,
  total,
  progress,
  nextLabel,
  simulate = false,
}: {
  question?: PracticeQuestion;
  currentAnswer?: string;
  isSubmitted: boolean;
  revealAnswer?: boolean;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onNext: () => void;
  onPrev?: () => void;
  canPrev?: boolean;
  position: number;
  total: number;
  progress: number;
  nextLabel: string;
  simulate?: boolean;
}) {
  const id = question ? questionKey(question) : "";
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    const syncBookmark = (event?: Event) => {
      if (!id) {
        setBookmarked(false);
        return;
      }
      const detail = (event as CustomEvent<string[]> | undefined)?.detail;
      if (Array.isArray(detail)) {
        setBookmarked(detail.includes(id));
        return;
      }
      const saved = readStorage<unknown>(STORAGE_KEYS.bookmarks, []);
      setBookmarked(Array.isArray(saved) && saved.includes(id));
    };
    syncBookmark();
    window.addEventListener("provaquest-bookmarks-changed", syncBookmark);
    window.addEventListener("storage", syncBookmark);
    return () => {
      window.removeEventListener("provaquest-bookmarks-changed", syncBookmark);
      window.removeEventListener("storage", syncBookmark);
    };
  }, [id]);

  if (!question)
    return (
      <div className="empty-state">
        <CircleHelp size={28} />
        <h3>Nenhuma questão neste filtro</h3>
        <p>Ajuste o edital, o assunto ou a busca para encontrar questões.</p>
      </div>
    );

  function toggleBookmark() {
    const saved = readStorage<unknown>(STORAGE_KEYS.bookmarks, []);
    const current = Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string")
      : [];
    const next = current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id];
    writeStorage(STORAGE_KEYS.bookmarks, next);
    window.dispatchEvent(
      new CustomEvent("provaquest-bookmarks-changed", { detail: next })
    );
    setBookmarked(next.includes(id));
  }

  const correct = currentAnswer === question.correct;
  const showFeedback = isSubmitted && revealAnswer;
  const options = question.options;

  return (
    <section className="question-stage">
      <div className="question-topline">
        <div className="question-counter">
          <span>{String(position).padStart(2, "0")}</span>
          <span className="counter-slash">/</span>
          <span className="counter-total">{total}</span>
        </div>
        <div className="question-labels">
          <Pill tone={subjectColor(question.subject)}>{question.subject}</Pill>
          <Pill tone="neutral">{question.editionLabel}</Pill>
          {question.annulled && <Pill tone="coral">Anulada</Pill>}
        </div>
        <span className="question-source">
          {simulate ? "Simulado" : "Progresso salvo"}
        </span>
      </div>
      <ProgressBar value={progress} tone={subjectColor(question.subject)} />
      <div className="question-card">
        <div className="question-card-head">
          <span className="question-overline">
            Questão {question.number} · {simulate ? "simulado" : "treino"} ·{" "}
            {question.editionLabel}
          </span>
          <button
            className={`bookmark-button ${bookmarked ? "is-bookmarked" : ""}`}
            title={bookmarked ? "Remover dos favoritos" : "Salvar questão"}
            aria-label={
              bookmarked
                ? "Remover questão dos favoritos"
                : "Salvar questão nos favoritos"
            }
            aria-pressed={bookmarked}
            onClick={toggleBookmark}
          >
            <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
        <QuestionBody question={question} />
        <div
          className="options-list"
          role="group"
          aria-label={`Alternativas da questão ${question.number}`}
        >
          {options.map(option => {
            const chosen = currentAnswer === option.id;
            const isCorrect = option.id === question.correct;
            const state = showFeedback
              ? isCorrect
                ? "correct"
                : chosen
                  ? "wrong"
                  : ""
              : "";
            return (
              <button
                disabled={isSubmitted}
                key={option.id}
                className={`option-row ${chosen ? "selected" : ""} ${state}`}
                aria-pressed={chosen}
                onClick={() => onSelect(option.id)}
              >
                <span className="option-letter">{option.id}</span>
                <span
                  className={`option-text${(option as { code?: boolean }).code ? " option-code" : ""}`}
                >
                  {option.text}
                </span>
                {showFeedback && isCorrect && <Check size={18} />}
                {showFeedback && chosen && !isCorrect && <X size={18} />}
              </button>
            );
          })}
        </div>
        {showFeedback ? (
          <div
            role="status"
            aria-live="polite"
            className={`answer-feedback ${correct ? "feedback-correct" : "feedback-wrong"}`}
          >
            <div className="feedback-icon">
              {correct ? <Check size={18} /> : <X size={18} />}
            </div>
            <div>
              <strong>
                {correct
                  ? "Boa. Você acertou."
                  : `A resposta é ${question.correct}.`}
              </strong>
              <SolutionDetails question={question} />
            </div>
          </div>
        ) : isSubmitted ? (
          <div className="question-hint" role="status" aria-live="polite">
            <Check size={15} /> Resposta registrada. O gabarito aparece na
            revisão, ao final do simulado.
          </div>
        ) : (
          <div className="question-hint">
            <CircleHelp size={15} />
            {simulate
              ? "Confirme para revelar o gabarito ou pule sem confirmar; itens pendentes não contam como acerto."
              : "Selecione uma alternativa e confirme para ver o gabarito."}
          </div>
        )}
      </div>
      <div className="question-actions">
        <div className="question-action-buttons">
          {canPrev && onPrev && (
            <button className="quiet-button" onClick={onPrev}>
              <ChevronLeft size={16} /> Anterior
            </button>
          )}
          {isSubmitted ? (
            <button className="primary-button" onClick={onNext}>
              {nextLabel} <ChevronRight size={16} />
            </button>
          ) : (
            <>
              <button
                className="primary-button"
                disabled={!currentAnswer}
                onClick={onSubmit}
              >
                Confirmar resposta <Check size={16} />
              </button>
              {simulate && (
                <button type="button" className="quiet-button" onClick={onNext}>
                  {position === total ? "Concluir simulado" : "Pular questão"}
                  <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
        <span className="keyboard-hint">
          {isSubmitted
            ? "Salvo neste navegador — pode atualizar a página sem perder nada"
            : "Escolha com calma"}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Prática: busca + resolução na mesma tela                            */
/* ------------------------------------------------------------------ */

type PracticeViewProps = {
  query: string;
  setQuery: (value: string) => void;
  selectedEdition: string;
  onEditionChange: (value: string) => void;
  selectedSubject: string;
  onSubjectChange: (value: string) => void;
  selectedTopic: string;
  onTopicChange: (value: string) => void;
  selectedSubtopic: string;
  onSubtopicChange: (value: string) => void;
  subjects: string[];
  topics: string[];
  subtopics: string[];
  questions: PracticeQuestion[];
  bookmarkedOnly: boolean;
  onBookmarkedOnlyChange: (value: boolean) => void;
  question?: PracticeQuestion;
  position: number;
  currentAnswer?: string;
  isSubmitted: boolean;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onNext: () => void;
  onPrev: () => void;
  canPrev: boolean;
  onOpen: (question: PracticeQuestion) => void;
  onClearFilter: () => void;
  answeredInFilter: number;
  correctInFilter: number;
  submitted: Record<string, boolean>;
  results: Record<string, boolean>;
  progress: number;
};

function PracticeView({
  query,
  setQuery,
  selectedEdition,
  onEditionChange,
  selectedSubject,
  onSubjectChange,
  selectedTopic,
  onTopicChange,
  selectedSubtopic,
  onSubtopicChange,
  subjects,
  topics,
  subtopics,
  questions,
  bookmarkedOnly,
  onBookmarkedOnlyChange,
  question,
  position,
  currentAnswer,
  isSubmitted,
  onSelect,
  onSubmit,
  onNext,
  onPrev,
  canPrev,
  onOpen,
  onClearFilter,
  answeredInFilter,
  correctInFilter,
  submitted,
  results,
  progress,
}: PracticeViewProps) {
  const atLast = position === questions.length && questions.length > 0;
  return (
    <div className="page-view practice-view">
      <div className="page-intro search-intro">
        <div>
          <span className="section-kicker">
            Praticar · biblioteca pesquisável
          </span>
          <h1>Encontre a questão certa.</h1>
          <p>
            Filtre por edital, assunto e tema — ou busque por palavra. A questão
            abre ao lado, com correção imediata e progresso salvo no seu
            navegador.
          </p>
        </div>
        <div className="search-summary">
          <strong>{questions.length}</strong>
          <span>questões no filtro</span>
        </div>
      </div>

      <div className="search-controls">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Buscar questões"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Ex.: heap, árvore AVL, complexidade..."
          />
        </div>
        <select
          aria-label="Filtrar por edital"
          value={selectedEdition}
          onChange={event => onEditionChange(event.target.value)}
        >
          <option value="todos">Todos os editais</option>
          {editionList.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por assunto"
          value={selectedSubject}
          onChange={event => onSubjectChange(event.target.value)}
        >
          {subjects.map(subject => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tema"
          value={selectedTopic}
          onChange={event => onTopicChange(event.target.value)}
        >
          {topics.map(topic => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar por subtema"
          value={selectedSubtopic}
          onChange={event => onSubtopicChange(event.target.value)}
        >
          {subtopics.map(subtopic => (
            <option key={subtopic}>{subtopic}</option>
          ))}
        </select>
        <label className="bookmark-filter">
          <input
            type="checkbox"
            checked={bookmarkedOnly}
            onChange={event => onBookmarkedOnlyChange(event.target.checked)}
          />
          Somente salvas
        </label>
      </div>

      <div className="search-filter-path" aria-live="polite">
        <span>Filtro atual:</span>
        <b>
          {selectedEdition === "todos"
            ? "Todos os editais"
            : editionLabels[selectedEdition]}
        </b>
        <span>›</span>
        <b>{selectedSubject}</b>
        <span>›</span>
        <b>{selectedTopic}</b>
        <span>›</span>
        <b>{selectedSubtopic}</b>
      </div>

      <div className="practice-progress">
        <div className="practice-progress-copy">
          <span className="rail-label">Seu progresso neste filtro</span>
          <strong>
            {answeredInFilter} de {questions.length}
          </strong>
          <span>
            {correctInFilter} acerto(s) ·{" "}
            {Math.max(0, answeredInFilter - correctInFilter)} para revisar
          </span>
        </div>
        <div className="practice-progress-bar">
          <ProgressBar value={progress} tone="mint" />
        </div>
        <button
          className="quiet-button"
          onClick={onClearFilter}
          disabled={!answeredInFilter}
        >
          <Trash2 size={15} /> Zerar este filtro
        </button>
      </div>

      <div className="practice-layout">
        <div className="practice-stage">
          <QuestionCard
            question={questions.length ? question : undefined}
            currentAnswer={currentAnswer}
            isSubmitted={isSubmitted}
            onSelect={onSelect}
            onSubmit={onSubmit}
            onNext={onNext}
            onPrev={onPrev}
            canPrev={canPrev}
            position={position}
            total={questions.length}
            progress={progress}
            nextLabel={atLast ? "Voltar ao início" : "Próxima questão"}
          />
        </div>
        <aside className="practice-list" aria-label="Questões do filtro">
          {questions.map((item, index) => {
            const id = questionKey(item);
            const answered = Boolean(submitted[id]);
            const isCorrect = results[id] === true;
            const active = question ? questionKey(question) === id : false;
            return (
              <button
                key={id}
                className={`practice-item ${active ? "active" : ""} ${
                  answered ? (isCorrect ? "is-correct" : "is-wrong") : ""
                }`}
                aria-current={active ? "true" : undefined}
                onClick={() => onOpen(item)}
              >
                <span className="practice-item-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="practice-item-body">
                  <span className="practice-item-meta">
                    <b>{item.editionLabel}</b>
                    <span>{item.subject}</span>
                  </span>
                  <span className="practice-item-text">
                    {previewOf(item).slice(0, 120)}
                  </span>
                </span>
                <span className="practice-item-status">
                  {answered ? (
                    isCorrect ? (
                      <Check size={15} />
                    ) : (
                      <X size={15} />
                    )
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </span>
              </button>
            );
          })}
          {!questions.length && (
            <div className="empty-state">
              <Search size={28} />
              <h3>Nenhuma questão encontrada</h3>
              <p>
                {bookmarkedOnly
                  ? "Você ainda não salvou questões com esse filtro. Toque no marcador de uma questão para salvá-la."
                  : "Tente outro termo ou limpe os filtros."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Simulado                                                            */
/* ------------------------------------------------------------------ */

function SimulationView({
  edition,
  selectedEdition,
  onEditionChange,
  simulations,
  onClearSimulation,
  onClearAllSimulations,
  onStart,
  currentQuestion,
  currentAnswer,
  isSubmitted,
  answers,
  ids,
  index,
  finished,
  onSelect,
  onSubmit,
  onNext,
  onPrev,
  onGoToQuestion,
  onRestart,
}: any) {
  const [reviewing, setReviewing] = useState(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousReviewingRef = useRef(reviewing);
  useEffect(() => {
    if (previousReviewingRef.current !== reviewing) {
      (reviewing ? reviewHeadingRef : resultHeadingRef).current?.focus();
      previousReviewingRef.current = reviewing;
    }
  }, [reviewing]);
  const submitted = simulations[selectedEdition]?.submitted ?? {};
  const sessionAnswered = ids.filter((id: string) =>
    Boolean(submitted[id] && answers[id])
  ).length;
  const sessionCorrect = ids.filter((id: string) => {
    const question = allQuestions.find(item => questionKey(item) === id);
    return (
      question &&
      simulationAnswerStatus(
        answers[id],
        question.correct,
        Boolean(submitted[id])
      ) === "correct"
    );
  }).length;
  const score = ids.length
    ? Math.round((sessionCorrect / ids.length) * 100)
    : 0;
  const hasAnySimulationProgress = Object.keys(simulations).length > 0;

  return (
    <div className="page-view">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Modo simulado</span>
          <h1>Seu simulado, seu progresso.</h1>
          <p>
            Cada edital tem respostas e progresso independentes. Após confirmar
            cada resposta, veja o gabarito e a explicação imediatamente.
            Continue de onde parou, refaça um edital ou zere apenas aquele
            simulado.
          </p>
          <EditionSourceLinks edition={edition} />
        </div>
        <div className="simulator-select">
          <select
            aria-label="Selecionar edital do simulado"
            value={selectedEdition}
            onChange={event => {
              onEditionChange(event.target.value);
              setReviewing(false);
            }}
          >
            {editionList.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            className="primary-button compact"
            onClick={() => {
              setReviewing(false);
              if (simulations[selectedEdition]?.finished) {
                onEditionChange(selectedEdition);
              } else {
                onStart(selectedEdition);
              }
            }}
          >
            <Play size={15} />
            {simulations[selectedEdition]?.finished
              ? "Ver resultado"
              : simulations[selectedEdition]?.ids.length
                ? "Continuar"
                : "Iniciar"}
          </button>
        </div>
      </div>

      <section
        className="simulator-progress-section"
        aria-labelledby="simulator-progress-title"
      >
        <div className="simulator-progress-heading">
          <div>
            <span className="section-kicker">Progresso individual</span>
            <h2 id="simulator-progress-title">Simulados por edital</h2>
          </div>
          <button
            type="button"
            className="quiet-button simulator-reset-all"
            disabled={!hasAnySimulationProgress}
            onClick={onClearAllSimulations}
          >
            <Trash2 size={15} /> Zerar todos os simulados
          </button>
        </div>
        <div className="simulator-progress-grid">
          {editionList.map(item => {
            const state = simulations[item.id];
            const total = validQuestions(item).length;
            const answered = state
              ? Object.keys(state.submitted).filter(id =>
                  state.ids.includes(id)
                ).length
              : 0;
            const percent = total ? Math.round((answered / total) * 100) : 0;
            const status = state?.finished
              ? "Concluído"
              : state?.ids.length
                ? "Em andamento"
                : "Não iniciado";
            const hasSaved = Boolean(state?.ids.length);

            return (
              <article
                className={`simulator-progress-card ${
                  selectedEdition === item.id ? "selected" : ""
                }`}
                key={item.id}
              >
                <div className="simulator-card-top">
                  <span>{item.id.replace("-", "/")}</span>
                  <Pill tone={state?.finished ? "mint" : "neutral"}>
                    {status}
                  </Pill>
                </div>
                <h3>{item.label}</h3>
                <p>{item.subtitle}</p>
                <div className="simulator-card-progress-label">
                  <span>
                    {answered} de {total} respondidas
                  </span>
                  <b>{percent}%</b>
                </div>
                <ProgressBar value={percent} tone="blue" />
                <div className="simulator-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      onEditionChange(item.id);
                      setReviewing(false);
                      if (!state?.finished) onStart(item.id);
                    }}
                  >
                    {state?.finished
                      ? "Ver resultado"
                      : hasSaved
                        ? "Continuar"
                        : "Iniciar simulado"}
                  </button>
                  {state?.finished && (
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => {
                        setReviewing(false);
                        onStart(item.id, true);
                      }}
                    >
                      <RotateCcw size={14} /> Refazer
                    </button>
                  )}
                  {hasSaved && (
                    <button
                      type="button"
                      className="simulator-reset-one"
                      onClick={() => onClearSimulation(item.id)}
                      aria-label={`Zerar progresso de ${item.label}`}
                    >
                      <Trash2 size={14} /> Zerar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {!ids.length ? null : reviewing ? (
        <ReviewPanel
          edition={edition}
          sessionIds={ids}
          answers={answers}
          submitted={submitted}
          onBack={() => setReviewing(false)}
          headingRef={reviewHeadingRef}
        />
      ) : (
        <div className="study-layout simulation-layout">
          <aside className="study-rail">
            <div className="rail-card">
              <span className="rail-label">Simulado atual</span>
              <strong>{edition.label}</strong>
              <p>{ids.length} questões respondíveis</p>
              <ProgressBar
                value={(sessionAnswered / Math.max(1, ids.length)) * 100}
                tone="blue"
              />
            </div>
            <div className="rail-card rail-stats">
              <span className="rail-label">Este edital</span>
              <div className="rail-stat">
                <span>Respondidas</span>
                <b>{sessionAnswered}</b>
              </div>
              <div className="rail-stat">
                <span>Restantes</span>
                <b>{Math.max(0, ids.length - sessionAnswered)}</b>
              </div>
              <button
                type="button"
                className="reset-link"
                onClick={() => onClearSimulation(selectedEdition)}
              >
                <Trash2 size={13} /> Zerar este simulado
              </button>
            </div>
            <section
              className="rail-card question-map-card"
              aria-label="Mapa de questões do simulado"
            >
              <div className="question-map-heading">
                <span className="rail-label">Mapa de questões</span>
                <span>
                  {sessionAnswered}/{ids.length}
                </span>
              </div>
              <div
                className="question-map-grid"
                role="group"
                aria-label="Ir para questão"
              >
                {ids.map((id: string, questionIndex: number) => {
                  const question = allQuestions.find(
                    item => questionKey(item) === id
                  );
                  const hasAnswer = Boolean(
                    simulations[selectedEdition]?.submitted?.[id] && answers[id]
                  );
                  const isCorrect =
                    hasAnswer &&
                    Boolean(question) &&
                    answers[id] === question?.correct;
                  const status = !hasAnswer
                    ? "pendente"
                    : isCorrect
                      ? "correta"
                      : "errada";

                  return (
                    <button
                      key={id}
                      type="button"
                      className={`question-map-dot ${
                        hasAnswer
                          ? isCorrect
                            ? "is-correct"
                            : "is-wrong"
                          : "is-pending"
                      } ${index === questionIndex ? "is-current" : ""}`}
                      aria-label={`Questão ${questionIndex + 1}, ${status}`}
                      aria-current={
                        index === questionIndex ? "step" : undefined
                      }
                      title={`Questão ${questionIndex + 1} · ${status}`}
                      onClick={() => onGoToQuestion(questionIndex)}
                    >
                      {questionIndex + 1}
                    </button>
                  );
                })}
              </div>
              <div className="question-map-legend">
                <span>
                  <i className="legend-correct" /> Certa
                </span>
                <span>
                  <i className="legend-wrong" /> Errada
                </span>
                <span>
                  <i className="legend-pending" /> Pendente
                </span>
              </div>
            </section>
          </aside>
          {finished ? (
            <ResultView
              sessionIds={ids}
              resetStudy={onRestart}
              simulate
              score={score}
              correctTotal={sessionCorrect}
              answeredTotal={sessionAnswered}
              onReview={() => setReviewing(true)}
              headingRef={resultHeadingRef}
            />
          ) : (
            <QuestionCard
              question={currentQuestion}
              currentAnswer={currentAnswer}
              isSubmitted={isSubmitted}
              revealAnswer
              onSelect={onSelect}
              onSubmit={onSubmit}
              onNext={onNext}
              onPrev={onPrev}
              canPrev={index > 0}
              position={index + 1}
              total={ids.length}
              progress={(sessionAnswered / Math.max(1, ids.length)) * 100}
              nextLabel={
                index === ids.length - 1 ? "Ver resultado" : "Próxima questão"
              }
              simulate
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResultView({
  sessionIds,
  resetStudy,
  score = 0,
  correctTotal = 0,
  answeredTotal = 0,
  onReview,
  headingRef,
}: {
  sessionIds: string[];
  resetStudy: () => void;
  simulate: boolean;
  score?: number;
  correctTotal?: number;
  answeredTotal?: number;
  onReview: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="result-card">
      <div className="result-badge">
        <Trophy size={25} />
      </div>
      <span className="section-kicker">Simulado concluído</span>
      <h2 ref={headingRef} tabIndex={-1}>
        {score}% de aproveitamento
      </h2>
      <p>
        Você chegou até o fim. Revise os itens abaixo e transforme os erros em
        pontos.
      </p>
      <div className="result-metrics">
        <div>
          <strong>{score}%</strong>
          <span>nota final</span>
        </div>
        <div>
          <strong>{sessionIds.length}</strong>
          <span>questões</span>
        </div>
        <div>
          <strong>{correctTotal}</strong>
          <span>acertos</span>
        </div>
      </div>
      <p className="result-response-summary">
        {answeredTotal}{" "}
        {answeredTotal === 1 ? "resposta confirmada" : "respostas confirmadas"}{" "}
        · {Math.max(0, sessionIds.length - answeredTotal)} sem confirmação
      </p>
      <div className="result-actions">
        <button className="primary-button" onClick={resetStudy}>
          <RotateCcw size={16} /> Refazer simulado
        </button>
        <button className="quiet-button" onClick={onReview}>
          Revisar respostas <ArrowRight size={15} />
        </button>
      </div>
      <p className="result-footnote">
        <Check size={14} /> A nota considera todas as questões respondíveis;
        rascunhos e itens sem confirmação não contam como acerto. Anuladas e em
        revisão ficam fora.
      </p>
    </section>
  );
}

function ReviewPanel({
  edition,
  sessionIds,
  answers,
  submitted,
  onBack,
  headingRef,
}: {
  edition: Edition;
  sessionIds: string[];
  answers: Record<string, string>;
  submitted: Record<string, boolean>;
  onBack: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="review-panel">
      <div className="review-header">
        <div>
          <span className="section-kicker">Revisão do simulado</span>
          <h2 ref={headingRef} tabIndex={-1}>
            Veja onde ganhou — e onde pode virar o jogo.
          </h2>
          <p>
            {sessionIds.length} questões comparadas ao gabarito do{" "}
            {edition.label}, incluindo pendentes e rascunhos não confirmados.
          </p>
        </div>
        <button className="quiet-button" onClick={onBack}>
          <ChevronLeft size={15} /> Voltar ao resultado
        </button>
      </div>
      <div className="review-list">
        {sessionIds.map((id, index) => {
          const question = allQuestions.find(item => questionKey(item) === id);
          if (!question) return null;
          const marked = answers[id];
          const status = simulationAnswerStatus(
            marked,
            question.correct,
            Boolean(submitted[id])
          );
          const reviewClass =
            status === "correct"
              ? "review-correct"
              : status === "incorrect"
                ? "review-wrong"
                : "review-pending";
          return (
            <article className={`review-item ${reviewClass}`} key={id}>
              <div className="review-index">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="review-copy">
                <div className="review-meta">
                  <span>Questão {question.number}</span>
                  <Pill
                    tone={
                      status === "correct"
                        ? "mint"
                        : status === "incorrect"
                          ? "coral"
                          : "neutral"
                    }
                  >
                    {status === "correct"
                      ? "Acertou"
                      : status === "incorrect"
                        ? "Revisar"
                        : "Não respondida"}
                  </Pill>
                </div>
                <strong>
                  {previewOf(question).slice(0, 210)}
                  {previewOf(question).length > 210 ? "…" : ""}
                </strong>
                <div className="review-answer">
                  <span>
                    {status === "pending" && marked
                      ? "Rascunho não confirmado:"
                      : "Sua resposta:"}{" "}
                    <b>{marked ?? "—"}</b>
                  </span>
                  <span>
                    Gabarito: <b>{question.correct}</b>
                  </span>
                </div>
                <p>{explain(question)}</p>
              </div>
              {status === "correct" ? (
                <Check size={18} />
              ) : status === "incorrect" ? (
                <X size={18} />
              ) : (
                <CircleHelp size={18} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SourcesView({
  editionList,
  startEditionPractice,
}: {
  editionList: readonly Edition[];
  startEditionPractice: (id: string) => void;
}) {
  return (
    <div className="page-view">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Acervo e transparência</span>
          <h1>Fontes oficiais.</h1>
          <p>
            Todo o conteúdo vem dos PDFs e gabaritos publicados pelo PPGI/UFAM.
          </p>
        </div>
        <Pill tone="mint">
          <Check size={14} /> links preservados
        </Pill>
      </div>
      <div className="source-grid">
        {editionList.map(edition => {
          const reviewCount = edition.questions.filter(
            question => question.needsReview
          ).length;
          return (
            <article className="source-card" key={edition.id}>
              <img src={edition.thumbnail} alt={`Capa da ${edition.label}`} />
              <div className="source-card-body">
                <div className="source-card-top">
                  <Pill tone="neutral">{edition.id.replace("-", "/")}</Pill>
                  <span>{validQuestions(edition).length} respondíveis</span>
                </div>
                <h3>{edition.label}</h3>
                <p>
                  {edition.subtitle} ·{" "}
                  {reviewCount
                    ? `${reviewCount} item(ns) em revisão visual`
                    : "extração conferida"}
                </p>
                <div className="source-links">
                  <a href={edition.examUrl} target="_blank" rel="noreferrer">
                    <FileText size={14} /> Prova <ExternalLink size={13} />
                  </a>
                  <a href={edition.keyUrl} target="_blank" rel="noreferrer">
                    <Check size={14} /> Gabarito <ExternalLink size={13} />
                  </a>
                </div>
                <button
                  className="source-start"
                  onClick={() => startEditionPractice(edition.id)}
                >
                  Praticar este edital <ArrowRight size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="source-note">
        <CircleHelp size={17} />
        <span>
          <strong>Critério de confiança:</strong> questões anuladas ficam fora
          da pontuação; quando o PDF contém diagrama ou alternativa ilegível no
          OCR, o item é marcado em revisão e não aparece como respondível até
          ser conferido.
        </span>
      </div>
    </div>
  );
}

function CandidatesView() {
  const [query, setQuery] = useState("");
  const [edition, setEdition] = useState("2026/02");
  const [stage, setStage] = useState("todos");
  const [scoreGroup, setScoreGroup] = useState("todos");
  const records: any[] = (candidateData.records as readonly any[]).filter(
    item => item.candidate.degree === "Mestrado"
  );
  const stageLabels: Record<string, Record<string, string>> = {
    "2026/02": {
      prova: "Etapa I – Prova de Conhecimentos",
      titulos: "Etapa II – Análise de Títulos e Currículo",
      final: "Classificação Final",
    },
    "2026/01": {
      prova: "Etapa I – Prova de Conhecimentos",
      titulos: "Etapa II – Análise de Títulos e Currículo",
      final: "Classificação Final",
    },
    "2025/02": {
      prova: "Etapa I – Prova de Conhecimentos",
      projetos: "Etapa II – Análise de Projetos",
      titulos: "Etapa III – Prova de Títulos",
      final: "Classificação Final",
    },
    "2025/01": {
      prova: "Etapa I – Prova de Conhecimentos",
      projetos: "Etapa II – Análise de Projetos",
      titulos: "Etapa III – Prova de Títulos",
      final: "Classificação Final",
    },
    "2024/02": {
      prova: "Etapa I – Prova de Conhecimentos",
      projetos: "Etapa II – Análise de Projetos",
      titulos: "Etapa III – Prova de Títulos",
      final: "Classificação Final",
    },
    "2024/01": {
      prova: "Etapa I – Prova de Conceitos",
      projetos: "Etapa II – Análise do Projeto de Pesquisa",
      titulos: "Etapa III – Prova de Títulos – Currículo Lattes",
      final: "Classificação Final",
    },
    "2020/01": {
      prova: "Prova de Conhecimentos",
      projetos: "Análise de Projetos",
      final: "Resultado Final",
    },
  };
  const baseStageDefs = [
    { id: "inscricoes", label: "Inscrições homologadas", short: "Inscrições" },
    { id: "prova", label: "Prova de conhecimentos", short: "Prova", cutoff: 7 },
    { id: "projetos", label: "Análise de projetos", short: "Projeto" },
    { id: "titulos", label: "Prova de títulos", short: "Títulos" },
    { id: "final", label: "Classificação final", short: "Final" },
  ];
  const editions = Array.from(new Set(records.map(item => item.editionLabel)));
  const selectedStageLabels = stageLabels[edition] ?? {};
  const stageDefs = baseStageDefs.map(def => ({
    ...def,
    label: selectedStageLabels[def.id] ?? def.label,
  }));
  const selectedEditionRecords = records.filter(
    item => edition === "todos" || item.editionLabel === edition
  );
  const activeStages = stageDefs.filter(def =>
    selectedEditionRecords.some(item => item.candidate.stages[def.id])
  );
  const activeStageIds = activeStages.map(def => def.id).join("|");
  useEffect(() => {
    if (stage !== "todos" && !activeStageIds.split("|").includes(stage)) {
      setStage("todos");
    }
  }, [stage, activeStageIds]);
  const normalized = normalizeSearchText(query);
  const filtered = selectedEditionRecords.filter(item => {
    const c = item.candidate;
    const stageNames = stageLabels[item.editionLabel] ?? {};
    const stageText = Object.keys(c.stages)
      .map(id => `${stageNames[id] ?? id} ${c.stages[id]?.status ?? ""}`)
      .join(" ");
    const text = normalizeSearchText(
      `${c.name} ${c.degree} ${item.editionLabel} ${stageText}`
    );
    return (
      (!normalized || text.includes(normalized)) &&
      (stage === "todos" || Boolean(c.stages[stage]))
    );
  });
  const money = (value: unknown) =>
    typeof value === "number"
      ? value.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";
  const statusFor = (candidate: any, def: any) => {
    const entry = candidate.stages[def.id];
    if (!entry) return "Não participou";
    if (def.id === "inscricoes")
      return /não|nao/i.test(entry.status ?? "")
        ? "Não homologada"
        : "Homologada";
    if (def.id === "final")
      return entry.status && entry.status !== "Publicado"
        ? entry.status
        : "Resultado final";
    const activeIndex = activeStages.findIndex(stage => stage.id === def.id);
    return didCandidatePassStage(
      def.id,
      activeStages[activeIndex + 1]?.id,
      candidate.stages,
      candidate.passedStages ?? []
    )
      ? "Passou"
      : "Não passou";
  };
  const funnel = activeStages.map((def, index) => {
    const entered = selectedEditionRecords.filter(
      item =>
        item.candidate.stages[def.id] &&
        (def.id !== "inscricoes" ||
          !/não|nao/i.test(item.candidate.stages[def.id].status ?? ""))
    ).length;
    const next = activeStages[index + 1];
    const advanced = next
      ? selectedEditionRecords.filter(
          item =>
            item.candidate.stages[def.id] &&
            item.candidate.stages[next.id] &&
            didCandidatePassStage(
              def.id,
              next.id,
              item.candidate.stages,
              item.candidate.passedStages ?? []
            )
        ).length
      : null;
    return { ...def, entered, advanced };
  });
  const scoreEntries = selectedEditionRecords.flatMap(item => {
    const score = item.candidate.stages.prova?.score;
    return typeof score === "number" && Number.isFinite(score) ? [score] : [];
  });
  const passingScoreCount = scoreEntries.filter(score => score >= 7).length;
  const belowCutoffScoreCount = scoreEntries.length - passingScoreCount;
  const visibleScoreEntries = scoreEntries.filter(score =>
    scoreGroup === "aprovados"
      ? score >= 7
      : scoreGroup === "abaixo"
        ? score < 7
        : true
  );
  const scoreBins = Array.from({ length: 21 }, (_, index) => {
    const start = index / 2;
    const end = start + 0.5;
    const count = visibleScoreEntries.filter(
      score => score >= start && (index === 20 ? score <= end : score < end)
    ).length;
    return { start, end, count };
  });
  const maxScoreBin = Math.max(1, ...scoreBins.map(bin => bin.count));
  return (
    <div className="page-view candidates-view">
      <div className="page-intro search-intro">
        <div>
          <span className="section-kicker">Notas e progressão</span>
          <h1>Quem entrou. Quanto tirou. Quem passou.</h1>
          <p>
            Consulta objetiva dos resultados oficiais do mestrado: nota
            publicada em cada etapa, situação e funil de candidatos por edital.
          </p>
        </div>
        <div className="search-summary">
          <strong>{filtered.length}</strong>
          <span>candidatos visíveis</span>
        </div>
      </div>
      <div className="candidate-note">
        <CircleHelp size={16} />
        <span>
          <strong>Regra de leitura:</strong> a nota é a que aparece no documento
          oficial. “Passou” significa que o nome aparece no resultado oficial da
          etapa seguinte; “Não passou” significa que não aparece. Na prova de
          conhecimentos, o corte mínimo exibido é <strong>7,00</strong>.{" "}
          <a
            href={
              selectedEditionRecords[0]?.editalUrl ??
              selectedEditionRecords[0]?.sourcePage
            }
            target="_blank"
            rel="noreferrer"
          >
            Abrir{" "}
            {selectedEditionRecords[0]?.editalLabel ?? `edital ${edition}`}{" "}
            <ExternalLink size={12} />
          </a>
        </span>
      </div>
      <div className="search-controls candidate-controls">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Buscar candidato pelo nome"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar pelo nome..."
          />
        </div>
        <select
          aria-label="Filtrar candidatos por edital"
          value={edition}
          onChange={event => setEdition(event.target.value)}
        >
          <option value="todos">Todos os editais</option>
          {editions.map(item => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar candidatos por etapa"
          value={stage}
          onChange={event => setStage(event.target.value)}
        >
          <option value="todos">Todas as etapas</option>
          {activeStages.map(def => (
            <option key={def.id} value={def.id}>
              {def.label}
            </option>
          ))}
        </select>
      </div>
      <section
        className="score-distribution-section"
        aria-labelledby="score-distribution-title"
      >
        <div className="section-heading">
          <div>
            <span className="section-kicker">Desempenho dos candidatos</span>
            <h2 id="score-distribution-title">
              Desempenho na Prova de Conhecimentos
            </h2>
          </div>
          <span className="section-caption">
            {visibleScoreEntries.length} candidatos no grupo selecionado
          </span>
        </div>
        <div
          className="score-group-controls"
          role="group"
          aria-label="Agrupar candidatos pelo corte de 7,00"
        >
          <button
            type="button"
            className={scoreGroup === "todos" ? "active" : ""}
            aria-pressed={scoreGroup === "todos"}
            onClick={() => setScoreGroup("todos")}
          >
            Todos os candidatos
          </button>
          <button
            type="button"
            className={
              scoreGroup === "aprovados" ? "active passing" : "passing"
            }
            aria-pressed={scoreGroup === "aprovados"}
            onClick={() => setScoreGroup("aprovados")}
          >
            Candidatos ≥ 7,00
          </button>
          <button
            type="button"
            className={scoreGroup === "abaixo" ? "active below" : "below"}
            aria-pressed={scoreGroup === "abaixo"}
            onClick={() => setScoreGroup("abaixo")}
          >
            Candidatos &lt; 7,00
          </button>
        </div>
        <div className="score-group-summary" aria-live="polite">
          <div className="score-summary-card passing">
            <strong>{passingScoreCount}</strong>
            <span>candidatos ≥ 7,00</span>
            <b>
              {scoreEntries.length
                ? ((passingScoreCount / scoreEntries.length) * 100)
                    .toFixed(1)
                    .replace(".", ",")
                : "0,0"}
              %
            </b>
          </div>
          <div className="score-summary-card below">
            <strong>{belowCutoffScoreCount}</strong>
            <span>candidatos &lt; 7,00</span>
            <b>
              {scoreEntries.length
                ? ((belowCutoffScoreCount / scoreEntries.length) * 100)
                    .toFixed(1)
                    .replace(".", ",")
                : "0,0"}
              %
            </b>
          </div>
        </div>
        <div className="score-chart" aria-hidden="true">
          {scoreBins.map(bin => (
            <div
              className={`score-bar-column ${bin.start >= 7 ? "passing" : ""}`}
              key={bin.start}
              title={`${bin.start.toFixed(1).replace(".", ",")} a ${bin.end.toFixed(1).replace(".", ",")}: ${bin.count} candidatos`}
            >
              <span className="score-bar-count">{bin.count || ""}</span>
              <div className="score-bar-track">
                <i style={{ height: `${(bin.count / maxScoreBin) * 100}%` }} />
              </div>
              <span className="score-bar-label">
                {bin.start.toFixed(1).replace(".", ",")}
              </span>
            </div>
          ))}
        </div>
        <table className="sr-only">
          <caption>
            Distribuição das notas na Prova de Conhecimentos para o grupo
            selecionado
          </caption>
          <thead>
            <tr>
              <th scope="col">Faixa de nota</th>
              <th scope="col">Quantidade de candidatos</th>
            </tr>
          </thead>
          <tbody>
            {scoreBins.map(bin => (
              <tr key={bin.start}>
                <th scope="row">
                  {bin.start.toFixed(1).replace(".", ",")} a{" "}
                  {bin.end.toFixed(1).replace(".", ",")}
                </th>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="score-chart-note">
          Use os botões para visualizar todos os candidatos ou agrupá-los pelo
          corte oficial de 7,00.
        </p>
      </section>
      <section className="funnel-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Funil do processo</span>
            <h2>
              {edition === "todos"
                ? "Todos os editais de mestrado"
                : `Mestrado ${edition}`}
            </h2>
            {edition !== "todos" && selectedEditionRecords[0]?.sourcePage && (
              <a
                className="edition-source-link"
                href={
                  selectedEditionRecords[0].editalUrl ??
                  selectedEditionRecords[0].sourcePage
                }
                target="_blank"
                rel="noreferrer"
              >
                {selectedEditionRecords[0].editalLabel ?? "Abrir edital"} (PDF){" "}
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          <span className="section-caption">
            Entraram × avançaram para a próxima etapa
          </span>
        </div>
        <div className="funnel-grid">
          {funnel.map(item => {
            const stageSource =
              edition !== "todos"
                ? selectedEditionRecords[0]?.documents?.[item.id]
                : undefined;
            return (
              <article className="funnel-card" key={item.id}>
                <div className="funnel-card-top">
                  <span>{item.label}</span>
                  <strong>{item.entered}</strong>
                </div>
                <div className="funnel-bar">
                  <i
                    style={{
                      width: `${Math.max(4, item.entered ? ((item.advanced ?? item.entered) / item.entered) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <div className="funnel-meta">
                  <span>
                    {item.advanced === null
                      ? "etapa final"
                      : `${item.advanced} foram para ${activeStages[funnel.indexOf(item) + 1]?.short ?? "a próxima"}`}
                  </span>
                  {item.cutoff && <b>corte {money(item.cutoff)}</b>}
                </div>
                {stageSource && (
                  <a
                    className="funnel-pdf-link"
                    href={stageSource}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF desta etapa <ExternalLink size={12} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <div className="candidate-results">
        {filtered.slice(0, 250).map(item => {
          const c = item.candidate;
          return (
            <article
              className="candidate-card"
              key={`${item.editionId}-${c.id}`}
            >
              <div className="candidate-identity">
                <span className="candidate-avatar">
                  {c.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part: string) => part[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{c.name}</strong>
                  <span>
                    {item.editionLabel} · {c.degree}
                  </span>
                </div>
                <a
                  href={item.sourcePage}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir fonte oficial"
                  aria-label={`Abrir fonte oficial de ${c.name}`}
                >
                  <ExternalLink size={15} />
                </a>
              </div>
              <div className="candidate-stage-table">
                {activeStages
                  .filter(def => c.stages[def.id])
                  .map((def, index) => {
                    const entry = c.stages[def.id];
                    const score =
                      def.id === "final"
                        ? (entry.finalScore ?? entry.score)
                        : entry.score;
                    const status = statusFor(c, def);
                    const tone = candidateStageTone(def.id, status);
                    const stageDocument = item.documents?.[def.id];
                    const stageContent = (
                      <>
                        <div className="stage-name">
                          <span className="stage-dot">
                            {tone === "positive" ? (
                              <Check size={11} />
                            ) : tone === "negative" ? (
                              <X size={11} />
                            ) : tone === "warning" ? (
                              <CircleHelp size={11} />
                            ) : (
                              <FileText size={11} />
                            )}
                          </span>
                          <div>
                            <b>{def.label}</b>
                            <small>{status}</small>
                          </div>
                        </div>
                        <div className="stage-score">
                          <strong>{money(score)}</strong>
                          {def.cutoff && (
                            <small>corte {money(def.cutoff)}</small>
                          )}
                        </div>
                      </>
                    );
                    return stageDocument ? (
                      <a
                        className={`candidate-stage-row stage-${tone}`}
                        href={stageDocument}
                        target="_blank"
                        rel="noreferrer"
                        title={`Abrir PDF: ${def.label}`}
                        key={def.id}
                      >
                        {stageContent}
                        <ExternalLink className="stage-pdf-icon" size={13} />
                      </a>
                    ) : (
                      <div
                        className={`candidate-stage-row stage-${tone}`}
                        key={def.id}
                      >
                        {stageContent}
                      </div>
                    );
                  })}
              </div>
            </article>
          );
        })}
        {filtered.length > 250 && (
          <p className="candidate-limit">
            Mostrando os 250 primeiros. Refine a busca para localizar alguém.
          </p>
        )}
        {!filtered.length && (
          <div className="empty-state">
            <Search size={28} />
            <h3>Nenhum candidato encontrado</h3>
            <p>Tente outro nome, edital ou etapa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
