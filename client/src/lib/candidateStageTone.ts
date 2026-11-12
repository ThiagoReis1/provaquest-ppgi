export type CandidateStageTone =
  | "positive"
  | "negative"
  | "neutral"
  | "warning";

export function candidateStageTone(
  stageId: string,
  status: string
): CandidateStageTone {
  if (stageId === "final" && status === "Resultado final") return "neutral";
  if (/lista de espera/i.test(status)) return "warning";
  if (/não|nao/i.test(status)) return "negative";
  if (/classificado|passou|homologada/i.test(status)) return "positive";
  return "neutral";
}
