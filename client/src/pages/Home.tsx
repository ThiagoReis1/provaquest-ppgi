import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
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
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { studyData } from "@/data/questions";
import { candidateData } from "@/data/candidates";
import {
  questionId,
  resetSimulationState,
  sessionBelongsToEdition,
} from "@/lib/simulation";
import { matchesQuestionQuery } from "@/lib/questionFilters";

type Edition = (typeof studyData.editions)[number];
type Question = Edition["questions"][number];

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
type Mode = "home" | "study" | "simulate" | "search" | "sources" | "candidates";

const editionList = studyData.editions;
const allQuestions = editionList.flatMap(edition =>
  edition.questions.map(question => ({
    ...question,
    editionId: edition.id,
    editionLabel: edition.label,
  }))
);
const respondibleQuestionIds = new Set(
  allQuestions
    .filter(question => !question.annulled && !question.needsReview)
    .map(question => question.editionId + "-" + question.number)
);

function sanitizeProgress(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, answered]) => answered === true && respondibleQuestionIds.has(id)
    )
  );
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

export default function Home() {
  const initialView =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("view")
      : null;
  const previewMode: Mode =
    initialView === "study" ||
    initialView === "simulate" ||
    initialView === "search" ||
    initialView === "sources" ||
    initialView === "candidates"
      ? initialView
      : "home";
  const previewAnswered =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "answered";
  const [mode, setMode] = useState<Mode>(previewMode);
  const [selectedEdition, setSelectedEdition] = useState<string>(
    previewMode === "search" ? "todos" : editionList[0].id
  );
  const [selectedSubject, setSelectedSubject] = useState("Todos os assuntos");
  const [selectedTopic, setSelectedTopic] = useState("Todos os temas");
  const [selectedSubtopic, setSelectedSubtopic] = useState("Todos os subtemas");
  const [query, setQuery] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("provaquest-bookmarks") ?? "[]"
      );
      return Array.isArray(saved)
        ? saved.filter(item => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [sessionIds, setSessionIds] = useState<string[]>(() =>
    previewMode === "study"
      ? allQuestions
          .filter(question => !question.annulled && !question.needsReview)
          .slice(0, 12)
          .map(question => question.editionId + "-" + question.number)
      : []
  );
  const [sessionIndex, setSessionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    previewAnswered && previewMode === "study"
      ? ({ "2026-02-1": "B" } as Record<string, string>)
      : {}
  );
  const [submitted, setSubmitted] = useState<Record<string, boolean>>(() =>
    previewAnswered && previewMode === "study"
      ? ({ "2026-02-1": true } as Record<string, boolean>)
      : {}
  );
  const [finished, setFinished] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    try {
      return sanitizeProgress(
        JSON.parse(localStorage.getItem("provaquest-progress") ?? "{}")
      );
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const syncBookmarks = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) {
        setBookmarkedIds(detail);
        return;
      }
      try {
        const saved = JSON.parse(
          localStorage.getItem("provaquest-bookmarks") ?? "[]"
        );
        setBookmarkedIds(
          Array.isArray(saved)
            ? saved.filter(item => typeof item === "string")
            : []
        );
      } catch {
        setBookmarkedIds([]);
      }
    };
    window.addEventListener("provaquest-bookmarks-changed", syncBookmarks);
    window.addEventListener("storage", syncBookmarks);
    return () => {
      window.removeEventListener("provaquest-bookmarks-changed", syncBookmarks);
      window.removeEventListener("storage", syncBookmarks);
    };
  }, []);

  const edition =
    editionList.find(item => item.id === selectedEdition) ?? editionList[0];
  const valid = validQuestions(edition);
  const safeSession = sessionBelongsToEdition(sessionIds, selectedEdition)
    ? sessionIds
    : [];
  const currentQuestion =
    allQuestions.find(
      item => item.editionId + "-" + item.number === safeSession[sessionIndex]
    ) ?? undefined;
  const currentAnswer = currentQuestion
    ? answers[safeSession[sessionIndex]]
    : undefined;
  const isSubmitted = currentQuestion
    ? Boolean(submitted[safeSession[sessionIndex]])
    : false;

  const subjects = useMemo(() => {
    const unique = new Set(allQuestions.map(question => question.subject));
    return ["Todos os assuntos", ...Array.from(unique)];
  }, []);

  const topics = useMemo(() => {
    const unique = new Set(
      allQuestions
        .filter(
          question =>
            (selectedEdition === "todos" ||
              question.editionId === selectedEdition) &&
            (selectedSubject === "Todos os assuntos" ||
              question.subject === selectedSubject)
        )
        .map(question => question.topic)
    );
    return ["Todos os temas", ...Array.from(unique).filter(Boolean)];
  }, [selectedEdition, selectedSubject]);

  const subtopics = useMemo(() => {
    const unique = new Set(
      allQuestions
        .filter(
          question =>
            (selectedEdition === "todos" ||
              question.editionId === selectedEdition) &&
            (selectedSubject === "Todos os assuntos" ||
              question.subject === selectedSubject) &&
            (selectedTopic === "Todos os temas" ||
              question.topic === selectedTopic)
        )
        .map(question => question.subtopic)
    );
    return ["Todos os subtemas", ...Array.from(unique).filter(Boolean)];
  }, [selectedEdition, selectedSubject, selectedTopic]);

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
        !bookmarkedOnly ||
        bookmarkedIds.includes(question.editionId + "-" + question.number);
      const isRespondible = !question.annulled && !question.needsReview;
      return (
        matchesQuery &&
        matchesSubject &&
        matchesTopic &&
        matchesSubtopic &&
        matchesEdition &&
        matchesBookmark &&
        isRespondible
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

  const answeredCount = Object.keys(completed).filter(id =>
    respondibleQuestionIds.has(id)
  ).length;
  const correctCount = Object.entries(submitted).filter(
    ([id, didSubmit]) =>
      didSubmit &&
      allQuestions.find(
        question => question.editionId + "-" + question.number === id
      )?.correct === answers[id]
  ).length;
  const globalProgress = Math.min(
    100,
    Math.round(
      (answeredCount /
        Math.max(
          1,
          allQuestions.filter(
            question => !question.annulled && !question.needsReview
          ).length
        )) *
        100
    )
  );

  function persistProgress(next: Record<string, boolean>) {
    const sanitized = sanitizeProgress(next);
    setCompleted(sanitized);
    try {
      localStorage.setItem("provaquest-progress", JSON.stringify(sanitized));
    } catch {
      /* storage bloqueado/quota excedida não interrompe a resposta */
    }
  }

  function clearSession() {
    const empty = resetSimulationState();
    setSessionIds(empty.sessionIds);
    setSessionIndex(empty.sessionIndex);
    setAnswers(empty.answers);
    setSubmitted(empty.submitted);
    setFinished(empty.finished);
  }

  function handleEditionChange(nextEdition: string) {
    if (nextEdition !== selectedEdition) clearSession();
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

  function beginStudy(
    questionIds: string[],
    nextMode: "study" | "simulate" = "study"
  ) {
    if (!questionIds.length) return;
    setSessionIds(questionIds);
    setSessionIndex(0);
    setAnswers({});
    setSubmitted({});
    setFinished(false);
    setMode(nextMode);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSearchQuestion(question: Question & { editionId: string }) {
    // Um resultado encontrado em "Todos os editais" precisa abrir no edital
    // real para que a sessão e a revisão usem a fonte correta.
    setSelectedEdition(question.editionId);
    beginStudy([questionId(question.editionId, question.number)]);
  }

  function startSubjectStudy(subject = selectedSubject) {
    const pool = allQuestions.filter(
      question =>
        !question.annulled &&
        !question.needsReview &&
        (subject === "Todos os assuntos" || question.subject === subject)
    );
    setSelectedEdition("todos");
    beginStudy(
      pool
        .slice(0, 12)
        .map(question => question.editionId + "-" + question.number)
    );
  }

  function startEditionStudy(editionId: string, simulate = false) {
    const target = editionList.find(item => item.id === editionId) ?? edition;
    setSelectedEdition(target.id);
    beginStudy(
      validQuestions(target).map(question =>
        questionId(target.id, question.number)
      ),
      simulate ? "simulate" : "study"
    );
  }

  function submitAnswer() {
    if (!currentQuestion || !currentAnswer || isSubmitted) return;
    const id = sessionIds[sessionIndex];
    const next = { ...submitted, [id]: true };
    setSubmitted(next);
    const nextCompleted = { ...completed, [id]: true };
    persistProgress(nextCompleted);
  }

  function goNext() {
    if (sessionIndex >= sessionIds.length - 1) {
      setFinished(true);
      return;
    }
    setSessionIndex(index => index + 1);
  }

  function resetStudy() {
    setAnswers({});
    setSubmitted({});
    setSessionIndex(0);
    setFinished(false);
  }

  function nav(nextMode: Mode) {
    if (
      nextMode !== mode &&
      (nextMode === "study" ||
        nextMode === "simulate" ||
        mode === "study" ||
        mode === "simulate")
    )
      clearSession();
    if (nextMode === "simulate" && selectedEdition === "todos") {
      setSelectedEdition(editionList[0].id);
    }
    setMode(nextMode);
    setMobileMenu(false);
    if (nextMode === "search") {
      setQuery("");
      setSelectedEdition("todos");
      setSelectedTopic("Todos os temas");
      setSelectedSubtopic("Todos os subtemas");
    }
  }

  const navItems: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Visão geral", icon: <LayoutGrid size={17} /> },
    { id: "study", label: "Treinar", icon: <BookOpen size={17} /> },
    { id: "simulate", label: "Simulados", icon: <Target size={17} /> },
    { id: "search", label: "Buscar questões", icon: <Search size={17} /> },
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
                  {item.id === "search" && (
                    <span className="nav-shortcut">⌘K</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <div className="streak-card">
              <div className="streak-icon">
                <Flame size={18} />
              </div>
              <div>
                <strong>Foco em alta</strong>
                <span>
                  {answeredCount
                    ? `${answeredCount} respostas registradas`
                    : "Comece sua primeira sessão"}
                </span>
              </div>
            </div>
            <div className="mini-progress">
              <div className="mini-progress-label">
                <span>Progresso geral</span>
                <b>{globalProgress}%</b>
              </div>
              <ProgressBar value={globalProgress} tone="mint" />
            </div>
            <p className="sidebar-note">
              Questões oficiais, feedback sem enrolação.
            </p>
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
                      onClick={() => startSubjectStudy()}
                    >
                      <Play size={16} fill="currentColor" /> Começar treino{" "}
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
                    <span>7 editais</span>
                  </div>
                  <span className="orbit-chip chip-one">+ feedback</span>
                  <span className="orbit-chip chip-two">20 questões</span>
                </div>
              </section>
              <section className="stats-strip">
                <div>
                  <span className="stat-icon blue">
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <strong>140</strong>
                    <span>questões mapeadas</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon coral">
                    <Target size={18} />
                  </span>
                  <div>
                    <strong>7</strong>
                    <span>editais disponíveis</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon violet">
                    <Trophy size={18} />
                  </span>
                  <div>
                    <strong>
                      {answeredCount
                        ? `${Math.round((correctCount / answeredCount) * 100)}%`
                        : "—"}
                    </strong>
                    <span>seu aproveitamento</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon mint">
                    <Clock3 size={18} />
                  </span>
                  <div>
                    <strong>∞</strong>
                    <span>ritmo no seu tempo</span>
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
                    onClick={() => startSubjectStudy()}
                  >
                    <div className="path-card-top">
                      <span className="round-icon coral">
                        <Zap size={19} />
                      </span>
                      <span className="path-tag">Recomendado</span>
                    </div>
                    <h3>Treino rápido</h3>
                    <p>
                      Uma sequência de 12 questões válidas, misturando os
                      assuntos para aquecer.
                    </p>
                    <span className="path-link">
                      Começar agora <ArrowRight size={15} />
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
                  <button className="path-card" onClick={() => nav("search")}>
                    <div className="path-card-top">
                      <span className="round-icon violet">
                        <Search size={19} />
                      </span>
                      <span className="path-tag">Explorar</span>
                    </div>
                    <h3>Buscar por assunto</h3>
                    <p>
                      Encontre uma questão específica por palavra, tema ou
                      período.
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
                      onClick={() => startEditionStudy(item.id)}
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

          {mode === "study" && (
            <StudyView
              edition={edition}
              selectedSubject={selectedSubject}
              setSelectedSubject={setSelectedSubject}
              subjects={subjects}
              startSubjectStudy={startSubjectStudy}
              currentQuestion={currentQuestion}
              currentAnswer={currentAnswer}
              setAnswers={setAnswers}
              answers={answers}
              submitted={submitted}
              isSubmitted={isSubmitted}
              submitAnswer={submitAnswer}
              goNext={goNext}
              sessionIndex={sessionIndex}
              sessionIds={safeSession}
              finished={finished}
              resetStudy={resetStudy}
              completed={completed}
            />
          )}

          {mode === "simulate" && (
            <SimulationView
              edition={edition}
              selectedEdition={selectedEdition}
              onEditionChange={handleEditionChange}
              startEditionStudy={startEditionStudy}
              currentQuestion={currentQuestion}
              currentAnswer={currentAnswer}
              answers={answers}
              submitted={submitted}
              setAnswers={setAnswers}
              isSubmitted={isSubmitted}
              submitAnswer={submitAnswer}
              goNext={goNext}
              sessionIndex={sessionIndex}
              sessionIds={safeSession}
              finished={finished}
              resetStudy={resetStudy}
              correctCount={correctCount}
            />
          )}

          {mode === "search" && (
            <SearchView
              query={query}
              setQuery={setQuery}
              selectedEdition={selectedEdition}
              setSelectedEdition={handleEditionChange}
              selectedSubject={selectedSubject}
              setSelectedSubject={handleSearchSubjectChange}
              selectedTopic={selectedTopic}
              setSelectedTopic={handleSearchTopicChange}
              selectedSubtopic={selectedSubtopic}
              setSelectedSubtopic={setSelectedSubtopic}
              subjects={subjects}
              topics={topics}
              subtopics={subtopics}
              filteredQuestions={filteredQuestions}
              bookmarkedOnly={bookmarkedOnly}
              setBookmarkedOnly={setBookmarkedOnly}
              openQuestion={openSearchQuestion}
            />
          )}

          {mode === "sources" && (
            <SourcesView
              editionList={editionList}
              startEditionStudy={startEditionStudy}
            />
          )}

          {mode === "candidates" && <CandidatesView />}
        </main>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  currentAnswer,
  setAnswers,
  isSubmitted,
  submitAnswer,
  goNext,
  sessionIndex,
  sessionIds,
  finished,
  resetStudy,
  simulate = false,
}: {
  question?: Question;
  currentAnswer?: string;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isSubmitted: boolean;
  submitAnswer: () => void;
  goNext: () => void;
  sessionIndex: number;
  sessionIds: string[];
  finished: boolean;
  resetStudy: () => void;
  simulate?: boolean;
}) {
  const id = question ? (sessionIds[sessionIndex] ?? "") : "";
  const [bookmarked, setBookmarked] = useState(false);
  useEffect(() => {
    if (!id) {
      setBookmarked(false);
      return;
    }
    try {
      setBookmarked(
        JSON.parse(
          localStorage.getItem("provaquest-bookmarks") ?? "[]"
        ).includes(id)
      );
    } catch {
      setBookmarked(false);
    }
  }, [id]);
  if (!question)
    return (
      <div className="empty-state">
        <CircleHelp size={28} />
        <h3>Escolha uma sessão para começar</h3>
        <p>Selecione um assunto ou edital e volte para esta área.</p>
      </div>
    );
  function toggleBookmark() {
    try {
      const current = JSON.parse(
        localStorage.getItem("provaquest-bookmarks") ?? "[]"
      ) as string[];
      const next = current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id];
      localStorage.setItem("provaquest-bookmarks", JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent("provaquest-bookmarks-changed", { detail: next })
      );
      setBookmarked(next.includes(id));
    } catch {
      /* bookmark é opcional e não pode interromper o fluxo */
    }
  }
  const correct = currentAnswer === question.correct;
  const options = question.options;
  if (finished)
    return (
      <section className="result-card">
        <div className="result-badge">
          <Check size={25} />
        </div>
        <span className="section-kicker">Sequência concluída</span>
        <h2>Bom ritmo.</h2>
        <p>
          Você fechou esta rodada. Comece outra para consolidar o assunto ou
          mude o filtro para variar o treino.
        </p>
        <div className="result-actions">
          <button className="primary-button" onClick={resetStudy}>
            <RotateCcw size={16} /> Recomeçar
          </button>
        </div>
      </section>
    );
  return (
    <section className="question-stage">
      <div className="question-topline">
        <div className="question-counter">
          <span>{String(sessionIndex + 1).padStart(2, "0")}</span>
          <span className="counter-slash">/</span>
          <span className="counter-total">{sessionIds.length}</span>
        </div>
        <div className="question-labels">
          <Pill tone={subjectColor(question.subject)}>{question.subject}</Pill>
          {question.annulled && <Pill tone="coral">Anulada</Pill>}
        </div>
        <span className="question-source">Edital oficial</span>
      </div>
      <ProgressBar
        value={
          ((sessionIndex + (isSubmitted ? 1 : 0)) / sessionIds.length) * 100
        }
        tone={subjectColor(question.subject)}
      />
      <div className="question-card">
        <div className="question-card-head">
          <span className="question-overline">
            Questão {question.number} · {simulate ? "simulado" : "treino"}
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
        <div className="options-list">
          {options.map(option => {
            const chosen = currentAnswer === option.id;
            const isCorrect = option.id === question.correct;
            const state =
              isSubmitted && isCorrect
                ? "correct"
                : isSubmitted && chosen
                  ? "wrong"
                  : "";
            return (
              <button
                disabled={isSubmitted}
                key={option.id}
                className={`option-row ${chosen ? "selected" : ""} ${state}`}
                onClick={() =>
                  setAnswers(prev => ({ ...prev, [id]: option.id }))
                }
              >
                <span className="option-letter">{option.id}</span>
                <span
                  className={`option-text${(option as { code?: boolean }).code ? " option-code" : ""}`}
                >
                  {option.text}
                </span>
                {isSubmitted && isCorrect && <Check size={18} />}
                {isSubmitted && chosen && !isCorrect && <X size={18} />}
              </button>
            );
          })}
        </div>
        {isSubmitted ? (
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
        ) : (
          <div className="question-hint">
            <CircleHelp size={15} /> Selecione uma alternativa para revelar o
            gabarito.
          </div>
        )}
      </div>
      <div className="question-actions">
        {isSubmitted ? (
          <button className="primary-button" onClick={goNext}>
            {sessionIndex === sessionIds.length - 1
              ? "Ver resultado"
              : "Próxima questão"}{" "}
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={!currentAnswer}
            onClick={submitAnswer}
          >
            Confirmar resposta <Check size={16} />
          </button>
        )}
        <span className="keyboard-hint">
          {isSubmitted ? "Continue no seu ritmo" : "Escolha com calma"}
        </span>
      </div>
    </section>
  );
}

function StudyView({
  edition,
  selectedSubject,
  setSelectedSubject,
  subjects,
  startSubjectStudy,
  currentQuestion,
  currentAnswer,
  setAnswers,
  answers,
  submitted,
  isSubmitted,
  submitAnswer,
  goNext,
  sessionIndex,
  sessionIds,
  finished,
  resetStudy,
  completed,
}: any) {
  return (
    <div className="page-view">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Modo treino</span>
          <h1>Uma questão de cada vez.</h1>
          <p>
            Feedback imediato, sem pressão. Escolha um assunto para montar sua
            próxima sequência.
          </p>
        </div>
        <div className="mode-toggle">
          <button
            className={selectedSubject === "Todos os assuntos" ? "active" : ""}
            onClick={() => setSelectedSubject("Todos os assuntos")}
          >
            Mix rápido
          </button>
          {subjects
            .filter((subject: string) => subject !== "Todos os assuntos")
            .slice(0, 2)
            .map((subject: string) => (
              <button
                key={subject}
                className={selectedSubject === subject ? "active" : ""}
                onClick={() => setSelectedSubject(subject)}
              >
                {subject}
              </button>
            ))}
        </div>
      </div>
      <div className="study-layout">
        <aside className="study-rail">
          <div className="rail-card">
            <span className="rail-label">Sua sequência</span>
            <strong>{sessionIds.length || 12} questões</strong>
            <p>
              {selectedSubject === "Todos os assuntos"
                ? "Mistura de assuntos"
                : selectedSubject}
            </p>
            <button
              className="secondary-button"
              onClick={() => startSubjectStudy(selectedSubject)}
            >
              Começar sequência <Play size={15} />
            </button>
          </div>
          <div className="rail-card rail-stats">
            <span className="rail-label">Desempenho nesta sessão</span>
            <div className="rail-stat">
              <span>Respondidas</span>
              <b>
                {
                  Object.keys(submitted ?? {}).filter(id => submitted[id])
                    .length
                }
              </b>
            </div>
            <div className="rail-stat">
              <span>Salvas no progresso</span>
              <b>{Object.keys(completed).length}</b>
            </div>
          </div>
        </aside>
        <QuestionCard
          question={currentQuestion}
          currentAnswer={currentAnswer}
          setAnswers={setAnswers}
          isSubmitted={isSubmitted}
          submitAnswer={submitAnswer}
          goNext={goNext}
          sessionIndex={sessionIndex}
          sessionIds={sessionIds}
          finished={finished}
          resetStudy={resetStudy}
        />
      </div>
    </div>
  );
}

function SimulationView({
  edition,
  selectedEdition,
  onEditionChange,
  startEditionStudy,
  currentQuestion,
  currentAnswer,
  answers,
  submitted,
  setAnswers,
  isSubmitted,
  submitAnswer,
  goNext,
  sessionIndex,
  sessionIds,
  finished,
  resetStudy,
}: any) {
  const [reviewing, setReviewing] = useState(false);
  const sessionCorrect = sessionIds.filter((id: string) => {
    const question = allQuestions.find(
      item => item.editionId + "-" + item.number === id
    );
    return question && answers[id] === question.correct;
  }).length;
  const score = sessionIds.length
    ? Math.round((sessionCorrect / sessionIds.length) * 100)
    : 0;
  return (
    <div className="page-view">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Modo simulado</span>
          <h1>Como você se sairia na prova?</h1>
          <p>
            Selecione um edital. Questões anuladas ou sem alternativas legíveis
            ficam fora da prova respondível.
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
              startEditionStudy(selectedEdition, true);
            }}
          >
            <Play size={15} /> Iniciar
          </button>
        </div>
      </div>
      {!sessionIds.length ? (
        <div className="simulation-launch">
          <div className="launch-illustration">
            <Target size={34} />
          </div>
          <div>
            <Pill tone="blue">
              {validQuestions(edition).length} questões respondíveis
            </Pill>
            <h2>{edition.label}</h2>
            <p>
              {edition.subtitle}. Faça o simulado completo e revise tudo no
              final.
            </p>
            <button
              className="primary-button"
              onClick={() => startEditionStudy(selectedEdition, true)}
            >
              Começar simulado <ArrowRight size={16} />
            </button>
          </div>
          <div className="launch-note">
            <strong>Gabarito no final</strong>
            <span>
              Você responde sem ver a resposta e revisa toda a prova ao
              terminar.
            </span>
          </div>
        </div>
      ) : reviewing ? (
        <ReviewPanel
          edition={edition}
          sessionIds={sessionIds}
          answers={answers}
          onBack={() => setReviewing(false)}
        />
      ) : (
        <div className="study-layout simulation-layout">
          <aside className="study-rail">
            <div className="rail-card">
              <span className="rail-label">Simulado atual</span>
              <strong>{edition.label}</strong>
              <p>{sessionIds.length} questões respondíveis</p>
              <ProgressBar
                value={(sessionIndex / sessionIds.length) * 100}
                tone="blue"
              />
            </div>
            <div className="rail-card rail-stats">
              <span className="rail-label">Parcial</span>
              <div className="rail-stat">
                <span>Respondidas</span>
                <b>
                  {
                    Object.keys(submitted ?? {}).filter(id => submitted[id])
                      .length
                  }
                </b>
              </div>
              <div className="rail-stat">
                <span>Acertos</span>
                <b>{sessionCorrect}</b>
              </div>
            </div>
          </aside>
          {finished ? (
            <ResultView
              sessionIds={sessionIds}
              answers={answers}
              questions={edition.questions}
              resetStudy={resetStudy}
              simulate
              score={score}
              correctTotal={sessionCorrect}
              onReview={() => setReviewing(true)}
            />
          ) : (
            <QuestionCard
              question={currentQuestion}
              currentAnswer={currentAnswer}
              setAnswers={setAnswers}
              isSubmitted={isSubmitted}
              submitAnswer={submitAnswer}
              goNext={goNext}
              sessionIndex={sessionIndex}
              sessionIds={sessionIds}
              finished={finished}
              resetStudy={resetStudy}
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
  onReview,
}: {
  sessionIds: string[];
  answers: Record<string, string>;
  questions: readonly Question[];
  resetStudy: () => void;
  simulate: boolean;
  score?: number;
  correctTotal?: number;
  onReview: () => void;
}) {
  return (
    <section className="result-card">
      <div className="result-badge">
        <Trophy size={25} />
      </div>
      <span className="section-kicker">Simulado concluído</span>
      <h2>{score}% de aproveitamento</h2>
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
      <div className="result-actions">
        <button className="primary-button" onClick={resetStudy}>
          <RotateCcw size={16} /> Refazer simulado
        </button>
        <button className="quiet-button" onClick={onReview}>
          Revisar respostas <ArrowRight size={15} />
        </button>
      </div>
      <p className="result-footnote">
        <Check size={14} /> Questões anuladas e itens em revisão não entram na
        pontuação.
      </p>
    </section>
  );
}

function ReviewPanel({
  edition,
  sessionIds,
  answers,
  onBack,
}: {
  edition: Edition;
  sessionIds: string[];
  answers: Record<string, string>;
  onBack: () => void;
}) {
  return (
    <section className="review-panel">
      <div className="review-header">
        <div>
          <span className="section-kicker">Revisão do simulado</span>
          <h2>Veja onde ganhou — e onde pode virar o jogo.</h2>
          <p>{sessionIds.length} respostas comparadas ao gabarito final.</p>
        </div>
        <button className="quiet-button" onClick={onBack}>
          <ChevronLeft size={15} /> Voltar ao resultado
        </button>
      </div>
      <div className="review-list">
        {sessionIds.map((id, index) => {
          const question = allQuestions.find(
            item => item.editionId + "-" + item.number === id
          );
          if (!question) return null;
          const marked = answers[id];
          const isCorrect = marked === question.correct;
          return (
            <article
              className={`review-item ${isCorrect ? "review-correct" : "review-wrong"}`}
              key={id}
            >
              <div className="review-index">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="review-copy">
                <div className="review-meta">
                  <span>Questão {question.number}</span>
                  <Pill tone={isCorrect ? "mint" : "coral"}>
                    {isCorrect ? "Acertou" : "Revisar"}
                  </Pill>
                </div>
                <strong>
                  {previewOf(question).slice(0, 210)}
                  {previewOf(question).length > 210 ? "…" : ""}
                </strong>
                <div className="review-answer">
                  <span>
                    Sua resposta: <b>{marked ?? "—"}</b>
                  </span>
                  <span>
                    Gabarito: <b>{question.correct}</b>
                  </span>
                </div>
                <p>{explain(question)}</p>
              </div>
              {isCorrect ? <Check size={18} /> : <X size={18} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SearchView({
  query,
  setQuery,
  selectedEdition,
  setSelectedEdition,
  selectedSubject,
  setSelectedSubject,
  selectedTopic,
  setSelectedTopic,
  selectedSubtopic,
  setSelectedSubtopic,
  subjects,
  topics,
  subtopics,
  filteredQuestions,
  bookmarkedOnly,
  setBookmarkedOnly,
  openQuestion,
}: any) {
  return (
    <div className="page-view">
      <div className="page-intro search-intro">
        <div>
          <span className="section-kicker">Biblioteca pesquisável</span>
          <h1>Encontre a questão certa.</h1>
          <p>
            Comece pela área, refine pelo tema e subtema, ou pesquise termos
            como hash, pilha, Dijkstra e caminho mínimo.
          </p>
        </div>
        <div className="search-summary">
          <strong>{filteredQuestions.length}</strong>
          <span>resultados encontrados</span>
        </div>
      </div>
      <div className="search-controls">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Buscar questões"
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Ex.: heap, árvore AVL, complexidade..."
          />
        </div>
        <select
          aria-label="Filtrar por edital"
          value={selectedEdition}
          onChange={event => setSelectedEdition(event.target.value)}
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
          onChange={event => setSelectedSubject(event.target.value)}
        >
          {subjects.map((subject: string) => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tema"
          value={selectedTopic}
          onChange={event => setSelectedTopic(event.target.value)}
        >
          {topics.map((topic: string) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar por subtema"
          value={selectedSubtopic}
          onChange={event => setSelectedSubtopic(event.target.value)}
        >
          {subtopics.map((subtopic: string) => (
            <option key={subtopic}>{subtopic}</option>
          ))}
        </select>
        <label className="bookmark-filter">
          <input
            type="checkbox"
            checked={bookmarkedOnly}
            onChange={event => setBookmarkedOnly(event.target.checked)}
          />
          Somente salvas
        </label>
      </div>
      <div className="search-filter-path" aria-live="polite">
        <span>Filtro atual:</span>
        <b>{selectedSubject}</b>
        <span>›</span>
        <b>{selectedTopic}</b>
        <span>›</span>
        <b>{selectedSubtopic}</b>
      </div>
      <div className="search-results">
        {filteredQuestions.map((question: any) => (
          <button
            key={`${question.editionId}-${question.number}`}
            className="search-result"
            onClick={() => openQuestion(question)}
          >
            <div className={`result-index ${subjectColor(question.subject)}`}>
              {String(question.number).padStart(2, "0")}
            </div>
            <div className="result-copy">
              <div className="result-meta">
                <Pill tone={subjectColor(question.subject)}>
                  {question.subject}
                </Pill>
                <span>{question.editionLabel}</span>
              </div>
              <strong>
                {previewOf(question).slice(0, 175)}
                {previewOf(question).length > 175 ? "…" : ""}
              </strong>
            </div>
            <ArrowRight size={17} />
          </button>
        ))}
        {!filteredQuestions.length && (
          <div className="empty-state">
            <Search size={28} />
            <h3>Nenhuma questão encontrada</h3>
            <p>Tente outro termo ou limpe os filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesView({
  editionList,
  startEditionStudy,
}: {
  editionList: readonly Edition[];
  startEditionStudy: (id: string, simulate?: boolean) => void;
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
                  onClick={() => startEditionStudy(edition.id)}
                >
                  Treinar este edital <ArrowRight size={15} />
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
  const [edition, setEdition] = useState("todos");
  const [degree, setDegree] = useState("todos");
  const [stage, setStage] = useState("todos");
  const records: any[] = candidateData.records as any;
  const stageDefs = [
    { id: "inscricoes", label: "Inscrições homologadas", short: "Inscrições" },
    { id: "prova", label: "Prova de conhecimentos", short: "Prova", cutoff: 7 },
    { id: "projetos", label: "Análise de projetos", short: "Projeto" },
    { id: "titulos", label: "Prova de títulos", short: "Títulos" },
    { id: "final", label: "Classificação final", short: "Final" },
  ];
  const editions = Array.from(new Set(records.map(item => item.editionLabel)));
  const degrees = Array.from(
    new Set(records.map(item => item.candidate.degree))
  )
    .filter(Boolean)
    .sort();
  const selectedEditionRecords = records
    .filter(item => edition === "todos" || item.editionLabel === edition)
    .filter(item => degree === "todos" || item.candidate.degree === degree);
  const activeStages = stageDefs.filter(def =>
    selectedEditionRecords.some(item => item.candidate.stages[def.id])
  );
  const normalized = query.trim().toLowerCase();
  const filtered = selectedEditionRecords.filter(item => {
    const c = item.candidate;
    const text = `${c.name} ${c.degree} ${item.editionLabel}`.toLowerCase();
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
  const statusFor = (candidate: any, def: any, index: number) => {
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
    return candidate.passedStages.includes(def.id) ? "Passou" : "Não passou";
  };
  const funnel = activeStages.map((def, index) => {
    const entered = selectedEditionRecords.filter(
      item => item.candidate.stages[def.id]
    ).length;
    const next = activeStages[index + 1];
    const advanced = next
      ? selectedEditionRecords.filter(
          item =>
            item.candidate.stages[def.id] && item.candidate.stages[next.id]
        ).length
      : null;
    return { ...def, entered, advanced };
  });
  return (
    <div className="page-view candidates-view">
      <div className="page-intro search-intro">
        <div>
          <span className="section-kicker">Notas e progressão</span>
          <h1>Quem entrou. Quanto tirou. Quem passou.</h1>
          <p>
            Consulta objetiva dos resultados oficiais: nota publicada em cada
            etapa, situação e funil de candidatos por edital.
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
            href="https://ppgi.ufam.edu.br/encerrados.html"
            target="_blank"
            rel="noreferrer"
          >
            Abrir fontes oficiais <ExternalLink size={12} />
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
          aria-label="Filtrar candidatos por modalidade"
          value={degree}
          onChange={event => setDegree(event.target.value)}
        >
          <option value="todos">Todas as modalidades</option>
          {degrees.map(item => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar candidatos por etapa"
          value={stage}
          onChange={event => setStage(event.target.value)}
        >
          <option value="todos">Todas as etapas</option>
          {stageDefs.map(def => (
            <option key={def.id} value={def.id}>
              {def.label}
            </option>
          ))}
        </select>
      </div>
      <section className="funnel-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Funil do processo</span>
            <h2>{edition === "todos" ? "Todos os editais" : edition}</h2>
          </div>
          <span className="section-caption">
            Entraram × avançaram para a próxima etapa
          </span>
        </div>
        <div className="funnel-grid">
          {funnel.map(item => (
            <article className="funnel-card" key={item.id}>
              <div className="funnel-card-top">
                <span>{item.short}</span>
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
            </article>
          ))}
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
                    const status = statusFor(c, def, index);
                    const passed =
                      status === "Passou" ||
                      status === "Homologada" ||
                      /Classificado/i.test(status);
                    return (
                      <div
                        className={`candidate-stage-row ${passed ? "stage-ok" : "stage-no"}`}
                        key={def.id}
                      >
                        <div className="stage-name">
                          <span className="stage-dot">
                            {passed ? <Check size={11} /> : <X size={11} />}
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
            <p>Tente outro nome, edital, modalidade ou etapa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
