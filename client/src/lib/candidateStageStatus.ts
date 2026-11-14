export function didCandidatePassStage(
  stageId: string,
  nextStageId: string | undefined,
  candidateStages: Record<string, unknown>,
  passedStages: readonly string[]
): boolean {
  const status = candidateStages[stageId];
  const explicitStatus =
    status && typeof status === "object" && "status" in status
      ? String(status.status).trim()
      : "";
  if (
    /^(não(?:\s+homologada)?|reprovad[oa]|eliminad[oa]|desclassificad[oa]|inabilitad[oa])$/i.test(
      explicitStatus
    )
  ) {
    return false;
  }
  return (
    passedStages.includes(stageId) ||
    (nextStageId !== undefined && Boolean(candidateStages[nextStageId]))
  );
}
